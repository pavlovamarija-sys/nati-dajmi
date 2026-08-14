// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { MACEDONIAN_LOCALIZATION_INSTRUCTIONS, parseMacedonianLocalizationResult, type MacedonianLocalizationInput, type MacedonianLocalizationProvider, type MacedonianLocalizationResult } from './macedonian-localization.ts';

export const OPENAI_MACEDONIAN_LOCALIZATION_MODEL = 'gpt-5.6-sol';
export const OPENAI_MACEDONIAN_LOCALIZATION_URL = 'https://api.openai.com/v1/responses';
export const OPENAI_MACEDONIAN_LOCALIZATION_SECRET = 'OPENAI_API_KEY';

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type MacedonianLocalizationProviderErrorCode =
  | 'missing_api_key'
  | 'invalid_input'
  | 'network_error'
  | 'provider_error'
  | 'invalid_provider_json'
  | 'missing_output_text'
  | 'malformed_output_json'
  | 'invalid_localization_output';

export class MacedonianLocalizationProviderError extends Error {
  readonly code: MacedonianLocalizationProviderErrorCode;
  readonly status: number | null;
  readonly requestId: string | null;

  constructor(
    code: MacedonianLocalizationProviderErrorCode,
    message: string,
    options: { cause?: unknown; status?: number; requestId?: string | null } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'MacedonianLocalizationProviderError';
    this.code = code;
    this.status = options.status ?? null;
    this.requestId = options.requestId ?? null;
  }
}

export class OpenAIMacedonianLocalizationProvider implements MacedonianLocalizationProvider {
  private readonly apiKey: string;
  private readonly fetcher: Fetcher;

  constructor(apiKey: string | undefined, fetcher: Fetcher = fetch) {
    this.apiKey = apiKey?.trim() ?? '';
    this.fetcher = fetcher;
  }

  async localize(input: MacedonianLocalizationInput): Promise<MacedonianLocalizationResult> {
    assertValidLocalizationInput(input);

    if (input.candidates.length === 0) {
      return { candidates: [] };
    }

    if (!this.apiKey) {
      throw new MacedonianLocalizationProviderError(
        'missing_api_key',
        `${OPENAI_MACEDONIAN_LOCALIZATION_SECRET} is not configured.`,
      );
    }

    let response: Response;
    try {
      response = await this.fetcher(OPENAI_MACEDONIAN_LOCALIZATION_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildOpenAIMacedonianLocalizationRequest(input)),
      });
    } catch (error) {
      throw new MacedonianLocalizationProviderError(
        'network_error',
        'Macedonian localization provider is unavailable.',
        { cause: error },
      );
    }

    if (!response.ok) {
      throw new MacedonianLocalizationProviderError(
        'provider_error',
        'Macedonian localization provider request failed.',
        {
          status: response.status,
          requestId: response.headers.get('x-request-id'),
        },
      );
    }

    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch (error) {
      throw new MacedonianLocalizationProviderError(
        'invalid_provider_json',
        'Macedonian localization provider returned invalid JSON.',
        { cause: error },
      );
    }

    const outputText = extractMacedonianLocalizationOutputText(responseBody);
    if (!outputText) {
      throw new MacedonianLocalizationProviderError(
        'missing_output_text',
        'Macedonian localization provider returned no structured output.',
      );
    }

    let rawOutput: unknown;
    try {
      rawOutput = JSON.parse(outputText);
    } catch (error) {
      throw new MacedonianLocalizationProviderError(
        'malformed_output_json',
        'Macedonian localization provider returned malformed structured data.',
        { cause: error },
      );
    }

    try {
      return parseMacedonianLocalizationResult(rawOutput, input.candidates);
    } catch (error) {
      throw new MacedonianLocalizationProviderError(
        'invalid_localization_output',
        'Macedonian localization provider output failed validation.',
        { cause: error },
      );
    }
  }
}

export function buildOpenAIMacedonianLocalizationRequest(
  input: MacedonianLocalizationInput,
): Record<string, unknown> {
  assertValidLocalizationInput(input);
  if (input.candidates.length === 0) {
    throw new MacedonianLocalizationProviderError(
      'invalid_input',
      'At least one localization candidate is required to build a provider request.',
    );
  }

  return {
    model: OPENAI_MACEDONIAN_LOCALIZATION_MODEL,
    store: false,
    max_output_tokens: 4000,
    input: [
      {
        role: 'developer',
        content: [{ type: 'input_text', text: MACEDONIAN_LOCALIZATION_INSTRUCTIONS }],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: JSON.stringify({ candidates: input.candidates }),
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'macedonian_toy_localization',
        strict: true,
        schema: buildMacedonianLocalizationSchema(
          input.candidates.map((candidate) => candidate.candidateId),
        ),
      },
    },
  };
}

export function buildMacedonianLocalizationSchema(
  candidateIds: readonly string[],
): Record<string, unknown> {
  if (candidateIds.length === 0 || new Set(candidateIds).size !== candidateIds.length) {
    throw new MacedonianLocalizationProviderError(
      'invalid_input',
      'Localization candidate IDs must be nonempty and unique.',
    );
  }

  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      candidates: {
        type: 'array',
        minItems: candidateIds.length,
        maxItems: candidateIds.length,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            candidateId: { type: 'string', enum: [...candidateIds] },
            name: { type: 'string' },
            category: { type: ['string', 'null'] },
            reason: { type: 'string' },
            playIdeas: {
              type: 'array',
              maxItems: 3,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                },
                required: ['title', 'description'],
              },
            },
          },
          required: ['candidateId', 'name', 'category', 'reason', 'playIdeas'],
        },
      },
    },
    required: ['candidates'],
  };
}

export function extractMacedonianLocalizationOutputText(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.output)) {
    return null;
  }

  for (const output of value.output) {
    if (!isRecord(output) || !Array.isArray(output.content)) {
      continue;
    }

    for (const content of output.content) {
      if (
        isRecord(content) &&
        content.type === 'output_text' &&
        typeof content.text === 'string'
      ) {
        return content.text;
      }
    }
  }

  return null;
}

function assertValidLocalizationInput(input: MacedonianLocalizationInput): void {
  const candidateIds = new Set<string>();
  for (const candidate of input.candidates) {
    if (
      !isNonblankString(candidate.candidateId) ||
      candidateIds.has(candidate.candidateId) ||
      !isNonblankString(candidate.name) ||
      !(candidate.category === null || isNonblankString(candidate.category)) ||
      !isRecommendation(candidate.recommendation) ||
      !isNonblankString(candidate.reason) ||
      !Array.isArray(candidate.playIdeas) ||
      candidate.playIdeas.some((idea) =>
        !isNonblankString(idea.title) || !isNonblankString(idea.description)
      )
    ) {
      throw new MacedonianLocalizationProviderError(
        'invalid_input',
        'Invalid Macedonian localization input.',
      );
    }
    candidateIds.add(candidate.candidateId);
  }
}

function isRecommendation(value: unknown): boolean {
  return value === 'KEEP' || value === 'ROTATE' || value === 'PASS_ON';
}

function isNonblankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
