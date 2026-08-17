import {
  getSuggestedToyPriceRange,
  isValidAskingPrice,
  shouldWarnAboutHighAskingPrice,
} from '../src/features/toy-analysis/domain/suggested-toy-price';

declare const Deno: {
  test(name: string, test: () => void): void;
};

Deno.test('derives expected ranges with finer endpoint rounding', () => {
  const cases = [
    [0, 0, 0],
    [1, 25, 25],
    [100, 75, 125],
    [150, 125, 175],
    [200, 150, 250],
    [220, 175, 275],
    [300, 250, 350],
    [499, 400, 600],
    [500, 400, 600],
    [600, 475, 700],
  ] as const;

  for (const [value, expectedMin, expectedMax] of cases) {
    const range = getSuggestedToyPriceRange(value);
    assertEqual(range.minDenars, expectedMin);
    assertEqual(range.maxDenars, expectedMax);
    assertEqual(range.minDenars >= 0, true);
    assertEqual(range.minDenars <= range.maxDenars, true);
  }
});

Deno.test('preserves numeric resolution for nearby low-value estimates', () => {
  const range200 = getSuggestedToyPriceRange(200);
  const range220 = getSuggestedToyPriceRange(220);

  assertEqual(range200.minDenars, 150);
  assertEqual(range200.maxDenars, 250);
  assertEqual(range220.minDenars, 175);
  assertEqual(range220.maxDenars, 275);
});

Deno.test('returns deterministic results across repeated calls', () => {
  const first = getSuggestedToyPriceRange(499);
  const second = getSuggestedToyPriceRange(499);

  assertEqual(first.minDenars, second.minDenars);
  assertEqual(first.maxDenars, second.maxDenars);
});

Deno.test('warns only above a strict 30 percent threshold', () => {
  for (const [asking, expected] of [[200, false], [240, false], [260, false], [261, true], [500, true], [50, false]] as const) {
    if (shouldWarnAboutHighAskingPrice(asking, 200) !== expected) {
      throw new Error(`Unexpected warning result for ${asking}.`);
    }
  }
});

Deno.test('validates whole-number nonnegative asking prices', () => {
  if (!isValidAskingPrice(0) || !isValidAskingPrice(50) ||
      isValidAskingPrice(-1) || isValidAskingPrice(1.5) ||
      isValidAskingPrice(Number.NaN) || isValidAskingPrice(Number.POSITIVE_INFINITY)) {
    throw new Error('Asking-price validation failed.');
  }
});

function assertEqual(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
