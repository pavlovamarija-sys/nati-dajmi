// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { PHYSICAL_TOY_RECONCILIATION_INSTRUCTIONS } from './physical-toy-instructions.ts';

declare const Deno: {
  test(name: string, test: () => void): void;
};

Deno.test('defines one sellable toy or set as the analysis unit', () => {
  assertIncludes('unit of analysis is ONE SELLABLE TOY OR TOY SET');
  assertIncludes('physically separate objects may constitute one sellable toy set');
  assertIncludes('attached or integral component');
  assertIncludes('puzzle board and its removable pieces');
  assertIncludes('shape sorter and its shapes');
  assertIncludes('board game and its board/cards/dice/pieces');
  assertIncludes('RC vehicle and its matching controller');
});

Deno.test('supports a representative when no whole-set detector candidate exists', () => {
  assertIncludes('choose exactly one candidate as its representative');
  assertIncludes('no detector candidate covers the whole set');
  assertIncludes('COMPLETE SELLABLE SET');
  assertIncludes('wooden animal puzzle');
  assertIncludes('Multiple pieces may point directly to the same representative');
});

Deno.test('preserves independent and multiple sellable items', () => {
  assertIncludes('two identical cars');
  assertIncludes('two separate puzzles');
  assertIncludes('One set beside an unrelated toy becomes two items');
  assertIncludes('When set membership is ambiguous, preserve independent items');
});

function assertIncludes(expected: string): void {
  if (!PHYSICAL_TOY_RECONCILIATION_INSTRUCTIONS.includes(expected)) {
    throw new Error(`Expected physical-toy instructions to include: ${expected}`);
  }
}
