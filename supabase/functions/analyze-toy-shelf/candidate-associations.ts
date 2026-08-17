export type CandidateAssociation = {
  candidateId: string;
  isToy: boolean;
  belongsToCandidateId: string | null;
};

export function areCandidateAssociationsValid(
  candidates: readonly CandidateAssociation[],
  expectedCandidateIds: readonly string[],
): boolean {
  const expected = new Set(expectedCandidateIds);
  if (candidates.length !== expected.size) {
    return false;
  }

  const byId = new Map<string, CandidateAssociation>();
  for (const candidate of candidates) {
    if (
      !expected.has(candidate.candidateId) ||
      byId.has(candidate.candidateId) ||
      (candidate.belongsToCandidateId !== null &&
        !expected.has(candidate.belongsToCandidateId)) ||
      candidate.belongsToCandidateId === candidate.candidateId
    ) {
      return false;
    }
    byId.set(candidate.candidateId, candidate);
  }

  if (byId.size !== expected.size) {
    return false;
  }

  for (const candidate of candidates) {
    if (candidate.belongsToCandidateId === null) {
      continue;
    }

    const parent = byId.get(candidate.belongsToCandidateId);
    if (!parent || candidate.isToy || !parent.isToy || parent.belongsToCandidateId !== null) {
      return false;
    }
  }

  return true;
}
