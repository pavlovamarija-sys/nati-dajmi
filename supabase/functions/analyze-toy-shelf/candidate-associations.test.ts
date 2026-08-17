// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { areCandidateAssociationsValid } from './candidate-associations.ts';

declare const Deno: {
  test(name: string, test: () => void): void;
};

const accepted = (candidateId: string, belongsToCandidateId: string | null = null) => ({
  candidateId,
  isToy: true,
  belongsToCandidateId,
});

const suppressed = (candidateId: string, belongsToCandidateId: string | null) => ({
  candidateId,
  isToy: false,
  belongsToCandidateId,
});

Deno.test('accepts multiple suppressed accessories for one accepted toy', () => {
  assertValid([
    accepted('truck'),
    suppressed('remote', 'truck'),
    suppressed('ladder', 'truck'),
  ]);
});

Deno.test('accepts multiple puzzle pieces pointing directly to one representative', () => {
  assertValid([
    accepted('puzzle-representative'),
    suppressed('hedgehog-piece', 'puzzle-representative'),
    suppressed('bear-piece', 'puzzle-representative'),
    suppressed('lion-piece', 'puzzle-representative'),
    suppressed('whale-piece', 'puzzle-representative'),
  ]);
});

Deno.test('supports multiple independent sets and an unrelated toy', () => {
  assertValid([
    accepted('puzzle-a'),
    suppressed('piece-a1', 'puzzle-a'),
    accepted('puzzle-b'),
    suppressed('piece-b1', 'puzzle-b'),
    accepted('car'),
  ]);
});

Deno.test('keeps two identical cars as independent accepted items', () => {
  assertValid([accepted('car-1'), accepted('car-2')]);
});

Deno.test('rejects unknown parents, self references, and accepted relationships', () => {
  assertInvalid([accepted('truck'), suppressed('remote', 'missing')]);
  assertInvalid([accepted('truck'), suppressed('remote', 'remote')]);
  assertInvalid([accepted('truck'), accepted('remote', 'truck')]);
});

Deno.test('rejects association chains and preserves independent toys', () => {
  assertInvalid([
    accepted('truck'),
    suppressed('remote', 'ladder'),
    suppressed('ladder', 'truck'),
  ]);
  assertValid([accepted('truck'), accepted('car')]);
});

function assertValid(value: readonly { candidateId: string; isToy: boolean; belongsToCandidateId: string | null }[]): void {
  if (!areCandidateAssociationsValid(value, value.map((candidate) => candidate.candidateId))) {
    throw new Error('Expected associations to be valid.');
  }
}

function assertInvalid(value: readonly { candidateId: string; isToy: boolean; belongsToCandidateId: string | null }[]): void {
  if (areCandidateAssociationsValid(value, value.map((candidate) => candidate.candidateId))) {
    throw new Error('Expected associations to be invalid.');
  }
}
