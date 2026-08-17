// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import type { AuthoritativeToyImage } from './authoritative-toy-image.ts';
// @ts-ignore Deno requires explicit TypeScript extensions for shared local modules.
import { TOY_VALUATION_CONDITIONS, calculateOverallValuationConfidence, calculateToyValuation, type ToyValuationCondition } from '../../../shared/toy-valuation-policy.ts';

export const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
export const OPENAI_MODEL = 'gpt-4o-mini';
export const VALUATION_METHOD = 'openai-image-aware-condition-estimate';
export const VALUATION_VERSION = 'v2';

export type ModelValuation = {
  baseSecondHandValueDenars: number;
  baseValueConfidence: number | null;
  condition: ToyValuationCondition;
  conditionConfidence: number | null;
  conditionNotes: string[];
};

export type FinalToyValuation = ModelValuation & {
  conditionAdjustmentBasisPoints: number;
  estimatedValueDenars: number;
  confidence: number | null;
  metadata: {
    valuationMethod: typeof VALUATION_METHOD;
    valuationVersion: typeof VALUATION_VERSION;
  };
};

export const valuationResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    baseSecondHandValueDenars: { type: 'integer', minimum: 0 },
    baseValueConfidence: {
      type: ['number', 'null'],
      minimum: 0,
      maximum: 1,
    },
    condition: {
      type: 'string',
      enum: TOY_VALUATION_CONDITIONS,
    },
    conditionConfidence: {
      type: ['number', 'null'],
      minimum: 0,
      maximum: 1,
    },
    conditionNotes: {
      type: 'array',
      maxItems: 3,
      items: { type: 'string' },
    },
  },
  required: [
    'baseSecondHandValueDenars',
    'baseValueConfidence',
    'condition',
    'conditionConfidence',
    'conditionNotes',
  ],
} as const;

export const valuationInstructions = `
Estimate a broad second-hand base value for the supplied toy identity or type in
North Macedonia, expressed as one integer amount in Macedonian denars (MKD). The
baseSecondHandValueDenars is the value assuming normal GOOD used condition. It is not
a new retail price, mint collector price, or condition-adjusted final price. Prefer a
practical rounded estimate rather than false precision or a range. If identity is
generic or uncertain, use a conservative generic-market value, lower base confidence,
and do not invent premium brand value, listings, or market statistics.

When an image is supplied, inspect condition systematically in this order before
classifying it: (1) missing components or parts; (2) broken, detached, cracked, or
deformed structural parts; (3) other damage that may materially affect normal use;
(4) significant cosmetic wear; and only then (5) minor cosmetic wear. Do not begin
with scratches, fading, or cleanliness and overlook a more important structural
defect.

Look for positive visible evidence of toy-appropriate missing parts such as wheels,
limbs, doors, handles, buttons, knobs, pieces, covers, panels, structural components,
or accessories with an obvious empty attachment point. Visual asymmetry and exposed
attachment points or mounts may support a missing-part finding, but asymmetry alone
or seeing only one example of a component is not enough. Do not infer that a part is
missing without positive visible evidence.

EXCELLENT means unusually clean and well-kept with little or no visible wear. GOOD
means normal used condition where minor cosmetic wear is acceptable, but there is no
clearly visible material structural defect or clearly missing meaningful component.
FAIR means the toy still appears reasonably usable but has a clearly visible
meaningful defect, missing component, significant cosmetic deterioration, or similar
issue that reduces second-hand value. POOR means severe visible damage, major
breakage, substantial missing structural components, or damage that appears likely to
materially compromise normal use. A clearly established meaningful missing component
excludes GOOD, but does not automatically require POOR; choose FAIR or POOR according
to the visible severity and likely impact. UNKNOWN means the image lacks enough
reliable evidence. Prefer UNKNOWN over guessing. When no image is supplied, always
return UNKNOWN with null condition confidence.

Do not claim that electronics, lights, sounds, music, batteries, or internal
mechanisms work. Do not claim unseen surfaces are intact, all accessories are present,
the toy is complete unless visibly established, or no damage exists outside the crop.
Return zero to three short factual English condition notes describing only visible
evidence or limitations. Prioritize economically or structurally important findings
over cosmetic observations so scratches or fading cannot crowd out a visible missing
part. Use cautious visual wording such as "appears to be missing", "visible attachment
point", or "visible crack" where appropriate. Do not use marketing language or
unsupported claims.

Return only the model-owned fields. Do not calculate an adjustment, final value,
rounding, overall confidence, method, version, or policy metadata.
`.trim();

export function buildOpenAIValuationRequest(
  name: string,
  category: string | null,
  image?: AuthoritativeToyImage,
): Record<string, unknown> {
  const userContent: Array<Record<string, unknown>> = [
    {
      type: 'input_text',
      text: `Toy name: ${name}\nCategory: ${category ?? 'Unknown'}\nCondition image supplied: ${image ? 'yes' : 'no'}`,
    },
  ];

  if (image) {
    userContent.push({
      type: 'input_image',
      image_url: `data:${image.mimeType};base64,${encodeBase64(image.bytes)}`,
      detail: 'high',
    });
  }

  return {
    model: OPENAI_MODEL,
    store: false,
    max_output_tokens: 500,
    input: [
      {
        role: 'developer',
        content: [{ type: 'input_text', text: valuationInstructions }],
      },
      { role: 'user', content: userContent },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'toy_valuation',
        strict: true,
        schema: valuationResponseSchema,
      },
    },
  };
}

export function finalizeToyValuation(
  modelValuation: ModelValuation,
  hasValidImage: boolean,
): FinalToyValuation {
  const condition: ToyValuationCondition = hasValidImage
    ? modelValuation.condition
    : 'UNKNOWN';
  const conditionConfidence = hasValidImage
    ? modelValuation.conditionConfidence
    : null;
  const conditionNotes = hasValidImage ? modelValuation.conditionNotes : [];
  const calculation = calculateToyValuation(
    modelValuation.baseSecondHandValueDenars,
    condition,
  );

  return {
    baseSecondHandValueDenars: modelValuation.baseSecondHandValueDenars,
    baseValueConfidence: modelValuation.baseValueConfidence,
    condition,
    conditionConfidence,
    conditionNotes,
    ...calculation,
    confidence: calculateOverallValuationConfidence(
      modelValuation.baseValueConfidence,
      condition,
      conditionConfidence,
    ),
    metadata: {
      valuationMethod: VALUATION_METHOD,
      valuationVersion: VALUATION_VERSION,
    },
  };
}

export function extractStructuredOutputText(value: unknown): string | null {
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

export function parseModelValuation(value: unknown): ModelValuation | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    'baseSecondHandValueDenars',
    'baseValueConfidence',
    'condition',
    'conditionConfidence',
    'conditionNotes',
  ])) {
    return null;
  }

  if (
    !Number.isInteger(value.baseSecondHandValueDenars) ||
    Number(value.baseSecondHandValueDenars) < 0 ||
    !isValidConfidence(value.baseValueConfidence) ||
    !isToyCondition(value.condition) ||
    !isValidConfidence(value.conditionConfidence) ||
    !Array.isArray(value.conditionNotes) ||
    value.conditionNotes.length > 3 ||
    !value.conditionNotes.every((note) => Boolean(readNonblankString(note)))
  ) {
    return null;
  }

  return {
    baseSecondHandValueDenars: Number(value.baseSecondHandValueDenars),
    baseValueConfidence: value.baseValueConfidence,
    condition: value.condition,
    conditionConfidence: value.conditionConfidence,
    conditionNotes: value.conditionNotes.map((note) => readNonblankString(note)!),
  };
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function isValidConfidence(value: unknown): value is number | null {
  return value === null || (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function isToyCondition(value: unknown): value is ToyValuationCondition {
  return typeof value === 'string' &&
    (TOY_VALUATION_CONDITIONS as readonly string[]).includes(value);
}

function readNonblankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
