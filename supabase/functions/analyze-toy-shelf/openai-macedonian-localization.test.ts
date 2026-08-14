// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { buildMacedonianLocalizationSchema, buildOpenAIMacedonianLocalizationRequest, extractMacedonianLocalizationOutputText, OPENAI_MACEDONIAN_LOCALIZATION_MODEL } from './openai-macedonian-localization.ts';
// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { parseMacedonianLocalizationResult, type MacedonianLocalizationInput } from './macedonian-localization.ts';

declare const Deno: {
  test(name: string, test: () => void | Promise<void>): void;
};

const input: MacedonianLocalizationInput = {
  candidates: [
    {
      candidateId: 'candidate-1',
      name: 'Paw Patrol Marshall',
      category: 'licensed character toy',
      recommendation: 'KEEP',
      reason: 'The toy supports imaginative rescue play.',
      playIdeas: [
        {
          title: 'Rescue mission',
          description: 'Move Marshall to a pretend rescue location.',
        },
        {
          title: 'Tell a rescue story',
          description: 'Create a short story about who Marshall helps.',
        },
      ],
    },
  ],
};

Deno.test('builds a text-only non-stored strict Responses API request', () => {
  const request = buildOpenAIMacedonianLocalizationRequest(input);
  assertEqual(request.model, OPENAI_MACEDONIAN_LOCALIZATION_MODEL);
  assertEqual(request.store, false);
  assertEqual(containsKey(request, 'image_url'), false);
  assertEqual(containsValue(request, 'input_image'), false);

  const text = request.text as Record<string, unknown>;
  const format = text.format as Record<string, unknown>;
  assertEqual(format.type, 'json_schema');
  assertEqual(format.strict, true);
});

Deno.test('schema is strict, encodes candidate IDs, and excludes recommendation', () => {
  const schema = buildMacedonianLocalizationSchema(['candidate-1', 'candidate-2']);
  assertEqual(containsPropertyDefinition(schema, 'recommendation'), false);
  assertEqual(containsPropertyDefinition(schema, 'confidence'), false);
  assertEqual(containsValue(schema, 'candidate-1'), true);
  assertEqual(containsValue(schema, 'candidate-2'), true);
  assertEveryObjectSchemaIsStrict(schema);
});

Deno.test('sends a proper name unchanged and includes recommendation only as input context', () => {
  const request = buildOpenAIMacedonianLocalizationRequest(input);
  const serialized = JSON.stringify(request);
  assertEqual(serialized.includes('Paw Patrol Marshall'), true);
  assertEqual(serialized.includes('"recommendation":"KEEP"'), true);
});

Deno.test('extracts and independently parses a correct localization', () => {
  const localized = {
    candidates: [
      {
        candidateId: 'candidate-1',
        name: 'Paw Patrol Marshall',
        category: 'Играчка со лиценциран лик',
        reason: 'Играчката поттикнува имагинативна спасувачка игра.',
        playIdeas: [
          {
            title: 'Спасувачка мисија',
            description: 'Однесете го Marshall до измислено место за спасување.',
          },
          {
            title: 'Спасувачка приказна',
            description: 'Смислете кратка приказна за тоа кому му помага Marshall.',
          },
        ],
      },
    ],
  };
  const outputText = extractMacedonianLocalizationOutputText({
    output: [{ content: [{ type: 'output_text', text: JSON.stringify(localized) }] }],
  });

  assertEqual(typeof outputText, 'string');
  const result = parseMacedonianLocalizationResult(JSON.parse(outputText as string), input.candidates);
  assertEqual(result.candidates[0].candidateId, 'candidate-1');
  assertEqual(result.candidates[0].playIdeas.length, 2);
});

Deno.test('independent parser rejects semantic output fields and changed play-idea count', () => {
  const semanticField = validLocalizedOutput() as unknown as {
    candidates: Array<Record<string, unknown>>;
  };
  semanticField.candidates[0].recommendation = 'ROTATE';
  assertThrows(() => parseMacedonianLocalizationResult(semanticField, input.candidates));

  const changedCount = validLocalizedOutput();
  changedCount.candidates[0].playIdeas.pop();
  assertThrows(() => parseMacedonianLocalizationResult(changedCount, input.candidates));
});

function validLocalizedOutput() {
  return {
    candidates: [
      {
        candidateId: 'candidate-1',
        name: 'Paw Patrol Marshall',
        category: 'Играчка со лиценциран лик',
        reason: 'Играчката поттикнува имагинативна спасувачка игра.',
        playIdeas: [
          { title: 'Спасувачка мисија', description: 'Однесете го Marshall на спасувачка мисија.' },
          { title: 'Нова приказна', description: 'Смислете приказна за тоа кому му помага Marshall.' },
        ],
      },
    ],
  };
}

function containsKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsKey(item, key));
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([entryKey, entryValue]) => entryKey === key || containsKey(entryValue, key),
  );
}

function containsPropertyDefinition(value: unknown, property: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsPropertyDefinition(item, property));
  if (!isRecord(value)) return false;
  if (isRecord(value.properties) && property in value.properties) return true;
  return Object.values(value).some((item) => containsPropertyDefinition(item, property));
}

function containsValue(value: unknown, expected: unknown): boolean {
  if (value === expected) return true;
  if (Array.isArray(value)) return value.some((item) => containsValue(item, expected));
  if (!isRecord(value)) return false;
  return Object.values(value).some((item) => containsValue(item, expected));
}

function assertEveryObjectSchemaIsStrict(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertEveryObjectSchemaIsStrict);
    return;
  }
  if (!isRecord(value)) return;
  if (value.type === 'object') assertEqual(value.additionalProperties, false);
  Object.values(value).forEach(assertEveryObjectSchemaIsStrict);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertEqual(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function assertThrows(action: () => void): void {
  try {
    action();
  } catch {
    return;
  }
  throw new Error('Expected action to throw.');
}
