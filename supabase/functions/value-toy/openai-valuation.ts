export const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
export const OPENAI_MODEL = 'gpt-4o-mini';
export const VALUATION_METHOD = 'openai-semantic-estimate';
export const VALUATION_VERSION = 'v1';

export type ModelValuation = {
  estimatedValueDenars: number;
  confidence: number | null;
};

export const valuationResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    estimatedValueDenars: {
      type: 'integer',
      minimum: 0,
    },
    confidence: {
      type: ['number', 'null'],
      minimum: 0,
      maximum: 1,
    },
  },
  required: ['estimatedValueDenars', 'confidence'],
} as const;

export const valuationInstructions = `
Estimate a broad, plausible second-hand resale or exchange value for the supplied
toy in North Macedonia, expressed as one integer amount in Macedonian denars (MKD),
not its new retail price. This is a broad market estimate, not a precise appraisal.
Prefer a sensible rounded estimate using practical increments such as 50 or 100 MKD
where appropriate; do not create false precision or output a range.

Use only the supplied toy name and category. Do not claim or infer an exact brand,
product model, original retail price, condition, completeness, rarity, or current
marketplace listings unless that information is explicitly present in the supplied
text. Conceptually consider only the general toy type/category, likely size or
complexity when reasonably implied by the name, typical durability or reusability of
that kind of toy, and generic second-hand usefulness or demand. Do not infer size,
complexity, premium materials, electronic features, completeness, collections or
sets, or brand value unless the supplied text supports it. Generic toys must receive
conservative generic-market estimates, not premium valuations. Avoid extreme values
unless the supplied text clearly supports an unusually substantial toy. Be
conservative when the identity is uncertain and lower confidence appropriately.

Confidence represents certainty in the valuation estimate, not certainty that the
toy exists or that its condition is known. Confidence should reflect how much
reliable valuation information is available from the name and category alone. No
image evidence is available, so do not assume excellent condition.
Do not set the value to zero merely because information is incomplete when the item
is clearly a normal reusable toy. Do not fabricate listings, retailers, or market
statistics. Return only the required structured output.
`.trim();

export function buildOpenAIValuationRequest(
  name: string,
  category: string | null,
): Record<string, unknown> {
  return {
    model: OPENAI_MODEL,
    store: false,
    max_output_tokens: 200,
    input: [
      {
        role: 'developer',
        content: [{ type: 'input_text', text: valuationInstructions }],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `Toy name: ${name}\nCategory: ${category ?? 'Unknown'}`,
          },
        ],
      },
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
  if (!isRecord(value)) {
    return null;
  }

  const keys = Object.keys(value);
  const estimatedValueDenars = value.estimatedValueDenars;
  const confidence = value.confidence;

  if (
    keys.length !== 2 ||
    !keys.includes('estimatedValueDenars') ||
    !keys.includes('confidence') ||
    !Number.isInteger(estimatedValueDenars) ||
    Number(estimatedValueDenars) < 0 ||
    !(
      confidence === null ||
      (typeof confidence === 'number' &&
        Number.isFinite(confidence) &&
        confidence >= 0 &&
        confidence <= 1)
    )
  ) {
    return null;
  }

  return {
    estimatedValueDenars: Number(estimatedValueDenars),
    confidence,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
