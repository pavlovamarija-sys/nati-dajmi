// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { hasNoMixedCyrillicLatinWords, hasOnlyAllowedMacedonianCyrillic, parseMacedonianLocalizationResult, type MacedonianLocalizationCandidateInput } from './macedonian-localization.ts';

declare const Deno: {
  test(name: string, test: () => void | Promise<void>): void;
};

const expectedCandidates: readonly MacedonianLocalizationCandidateInput[] = [
  {
    candidateId: 'candidate-1',
    name: 'plastic horse figure',
    category: 'animal figure',
    recommendation: 'KEEP',
    reason: 'Age-appropriate imaginative play.',
    playIdeas: [
      { title: 'Build a stable', description: 'Use blocks to make a home for the horse.' },
      { title: 'Horse trail', description: 'Guide the horse along a simple path.' },
    ],
  },
  {
    candidateId: 'candidate-2',
    name: 'wooden puzzle',
    category: null,
    recommendation: 'ROTATE',
    reason: 'Useful when reintroduced later.',
    playIdeas: [],
  },
];

Deno.test('parses a valid localization result and allows a null category', () => {
  const result = parseMacedonianLocalizationResult(validResult(), expectedCandidates);

  assertEqual(result.candidates.length, 2);
  assertEqual(result.candidates[1].category, null);
  assertEqual(result.candidates[0].playIdeas.length, 2);
  assertEqual(result.candidates[0].playIdeas[0].title, 'Изгради штала');
});

Deno.test('rejects missing, unexpected, or duplicate candidate IDs', () => {
  const missing = validResult();
  missing.candidates.pop();
  assertThrows(() => parseMacedonianLocalizationResult(missing, expectedCandidates));

  const unexpected = validResult();
  unexpected.candidates[1].candidateId = 'candidate-3';
  assertThrows(() => parseMacedonianLocalizationResult(unexpected, expectedCandidates));

  const duplicate = validResult();
  duplicate.candidates[1].candidateId = 'candidate-1';
  assertThrows(() => parseMacedonianLocalizationResult(duplicate, expectedCandidates));
});

Deno.test('rejects blank or malformed localized text', () => {
  const blankName = validResult();
  blankName.candidates[0].name = '   ';
  assertThrows(() => parseMacedonianLocalizationResult(blankName, expectedCandidates));

  const blankCategory = validResult();
  blankCategory.candidates[0].category = '';
  assertThrows(() => parseMacedonianLocalizationResult(blankCategory, expectedCandidates));

  const blankDescription = validResult();
  blankDescription.candidates[0].playIdeas[0].description = '';
  assertThrows(() => parseMacedonianLocalizationResult(blankDescription, expectedCandidates));
});

Deno.test('rejects unexpected semantic fields in localization output', () => {
  const result = validResult() as unknown as {
    candidates: Array<Record<string, unknown>>;
  };
  result.candidates[0].recommendation = 'PASS_ON';

  assertThrows(() => parseMacedonianLocalizationResult(result, expectedCandidates));
});

Deno.test('requires localization to preserve each candidate play-idea count', () => {
  const result = validResult();
  result.candidates[0].playIdeas.pop();

  assertThrows(() => parseMacedonianLocalizationResult(result, expectedCandidates));
});

Deno.test('accepts Macedonian Cyrillic, Latin brands, digits, and punctuation', () => {
  const accepted = [
    'АБВГДЃЕЖЗЅИЈКЛЉМНЊОПРСТЌУФХЦЧЏШ',
    'абвгдѓежзѕијклљмнњопрстќуфхцчџш',
    'Ѝ ѝ',
    'Paw Patrol Marshall — модел 123!',
  ];

  for (const value of accepted) {
    assertEqual(hasOnlyAllowedMacedonianCyrillic(value), true);
  }

  const result = validResult();
  result.candidates[0].name = 'Paw Patrol Marshall — играчка 123!';
  parseMacedonianLocalizationResult(result, expectedCandidates);
});

Deno.test('rejects non-Macedonian Cyrillic letters', () => {
  for (const character of ['ю', 'я', 'ъ', 'ы', 'э', 'ё', 'щ']) {
    assertEqual(hasOnlyAllowedMacedonianCyrillic(character), false);
  }
});

Deno.test('allows separate Macedonian and Latin words but rejects mixed-script words', () => {
  for (const value of [
    'мека играчка',
    'Маршал од Paw Patrol',
    'Paw Patrol Marshall',
    'LEGO коцки',
    'Barbie кукла',
    'ѓ ќ љ њ ѕ џ ѝ',
  ]) {
    assertEqual(hasNoMixedCyrillicLatinWords(value), true);
  }

  for (const value of ['играčка', 'Марšал', 'плиšана', 'куćе']) {
    assertEqual(hasNoMixedCyrillicLatinWords(value), false);
  }
});

Deno.test('applies mixed-script validation to every localized text field', () => {
  const invalidName = validResult();
  invalidName.candidates[0].name = 'мека играčка';
  assertThrows(() => parseMacedonianLocalizationResult(invalidName, expectedCandidates));

  const invalidCategory = validResult();
  invalidCategory.candidates[0].category = 'плиšана играчка';
  assertThrows(() => parseMacedonianLocalizationResult(invalidCategory, expectedCandidates));

  const invalidReason = validResult();
  invalidReason.candidates[0].reason = 'Добра е за играње со куćе.';
  assertThrows(() => parseMacedonianLocalizationResult(invalidReason, expectedCandidates));

  const invalidTitle = validResult();
  invalidTitle.candidates[0].playIdeas[0].title = 'Марšал во акција';
  assertThrows(() => parseMacedonianLocalizationResult(invalidTitle, expectedCandidates));

  const invalidDescription = validResult();
  invalidDescription.candidates[0].playIdeas[0].description = 'Направете дом за играčката.';
  assertThrows(() => parseMacedonianLocalizationResult(invalidDescription, expectedCandidates));
});

Deno.test('applies Macedonian Cyrillic validation to every localized text field', () => {
  const invalidName = validResult();
  invalidName.candidates[0].name = 'Плюшка';
  assertThrows(() => parseMacedonianLocalizationResult(invalidName, expectedCandidates));

  const invalidCategory = validResult();
  invalidCategory.candidates[0].category = 'Категория';
  assertThrows(() => parseMacedonianLocalizationResult(invalidCategory, expectedCandidates));

  const invalidReason = validResult();
  invalidReason.candidates[0].reason = 'Съдържи чужда буква.';
  assertThrows(() => parseMacedonianLocalizationResult(invalidReason, expectedCandidates));

  const invalidTitle = validResult();
  invalidTitle.candidates[0].playIdeas[0].title = 'Новый наслов';
  assertThrows(() => parseMacedonianLocalizationResult(invalidTitle, expectedCandidates));

  const invalidDescription = validResult();
  invalidDescription.candidates[0].playIdeas[0].description = 'Игра со ёж.';
  assertThrows(() => parseMacedonianLocalizationResult(invalidDescription, expectedCandidates));
});

function validResult() {
  return {
    candidates: [
      {
        candidateId: 'candidate-1',
        name: 'Пластична фигура на коњ',
        category: 'Животинска фигура',
        reason: 'Соодветна е за имагинативна игра според возраста.',
        playIdeas: [
          { title: 'Изгради штала', description: 'Направете дом за коњот од коцки.' },
          { title: 'Патека за коњот', description: 'Водете го коњот по едноставна патека.' },
        ],
      },
      {
        candidateId: 'candidate-2',
        name: 'Дрвена сложувалка',
        category: null,
        reason: 'Ќе биде повторно интересна по кратка пауза.',
        playIdeas: [],
      },
    ],
  };
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
