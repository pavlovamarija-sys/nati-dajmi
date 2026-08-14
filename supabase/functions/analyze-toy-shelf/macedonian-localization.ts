export type LocalizationRecommendation = 'KEEP' | 'ROTATE' | 'PASS_ON';

export type LocalizationPlayIdea = {
  readonly title: string;
  readonly description: string;
};

export type MacedonianLocalizationCandidateInput = {
  readonly candidateId: string;
  readonly name: string;
  readonly category: string | null;
  /** Translation context only. Localization output must never contain this field. */
  readonly recommendation: LocalizationRecommendation;
  readonly reason: string;
  readonly playIdeas: readonly LocalizationPlayIdea[];
};

export type MacedonianLocalizationInput = {
  readonly candidates: readonly MacedonianLocalizationCandidateInput[];
};

export type MacedonianLocalizedCandidate = {
  readonly candidateId: string;
  readonly name: string;
  readonly category: string | null;
  readonly reason: string;
  readonly playIdeas: readonly LocalizationPlayIdea[];
};

export type MacedonianLocalizationResult = {
  readonly candidates: readonly MacedonianLocalizedCandidate[];
};

export interface MacedonianLocalizationProvider {
  localize(input: MacedonianLocalizationInput): Promise<MacedonianLocalizationResult>;
}

export const MACEDONIAN_LOCALIZATION_INSTRUCTIONS = `
Localize only name, category, reason, and play-idea titles and descriptions into
natural contemporary Macedonian written in Cyrillic. Write as a native speaker from
North Macedonia for a parent: use standard Macedonian grammar and morphology,
simple, clear, warm wording, and avoid Bulgarian or Serbian-influenced substitutions
when a normal Macedonian form exists.

The source may be in English, already in Macedonian, awkward Macedonian, or
Macedonian with Bulgarian or Serbian influence. Do not assume Cyrillic source text is
already correct. Translate non-Macedonian text, and normalize Macedonian text into
clear, idiomatic, standard Macedonian by correcting spelling, grammar, morphology,
and word order. Replace foreign-influenced wording with a normal Macedonian
equivalent where possible. You may substantially rewrite a sentence for naturalness,
but preserve the exact underlying fact, rationale, capability, and play action.
For example, express "The toy encourages imaginative role play" with the natural
Macedonian equivalent, and clarify "Играта со фигури е корисна, но не е единствена
играчка за детето" without changing its reason into duplication or any other new
argument.

Prefer simple parent-facing Macedonian over literal English, corporate, educational,
or marketing language. Do not mechanically translate constructions such as
"promotes engagement", "promotes early learning", "developmental stage", "offers
opportunities for", "provides comfort", or "encourages participation". Rewrite the
complete sentence as a natural contemporary Macedonian parent would say it, while
preserving exactly the same fact and rationale. Avoid awkward noun stacking and
translated-sounding phrasing.

Preserve the source meaning exactly. Do not reinterpret the toy or recommendation.
Do not infer, remove, or generalize a brand, character, capability, or play mechanic.
Do not add or remove movement, lights, sounds, dancing, electronics, accessories,
educational functions, or any other functionality. Do not change what the child is
instructed to do, and do not merge, split, add, or remove play ideas. Preserve clearly
identified brand, franchise, product, and character names. Preserve established
Latin-script brand, franchise, product, and character sequences exactly as written in
the source name: do not translate, transliterate, omit, or generalize them. For example,
keep Paw Patrol Marshall as Paw Patrol Marshall. Recommendation is read-only context
for translating the reason and must not appear in the output. Do not add facts
absent from the semantic source. Return only candidateId, name, category, reason, and
playIdeas for every supplied candidate.
`.trim();

const RESULT_KEYS = ['candidates'] as const;
const CANDIDATE_KEYS = ['candidateId', 'name', 'category', 'reason', 'playIdeas'] as const;
const PLAY_IDEA_KEYS = ['title', 'description'] as const;
const MACEDONIAN_CYRILLIC_LETTERS = new Set(
  'АБВГДЃЕЖЗЅИЈКЛЉМНЊОПРСТЌУФХЦЧЏШабвгдѓежзѕијклљмнњопрстќуфхцчџшЍѝ',
);
const CYRILLIC_CHARACTER = /\p{Script=Cyrillic}/u;
const LATIN_CHARACTER = /\p{Script=Latin}/u;
const LETTER_OR_MARK_CHARACTER = /[\p{L}\p{M}]/u;

export function hasOnlyAllowedMacedonianCyrillic(value: string): boolean {
  for (const character of value) {
    if (CYRILLIC_CHARACTER.test(character) && !MACEDONIAN_CYRILLIC_LETTERS.has(character)) {
      return false;
    }
  }

  return true;
}

export function hasNoMixedCyrillicLatinWords(value: string): boolean {
  let containsMacedonianCyrillic = false;
  let containsLatin = false;

  for (const character of value) {
    if (!LETTER_OR_MARK_CHARACTER.test(character)) {
      containsMacedonianCyrillic = false;
      containsLatin = false;
      continue;
    }

    if (MACEDONIAN_CYRILLIC_LETTERS.has(character)) {
      containsMacedonianCyrillic = true;
    } else if (LATIN_CHARACTER.test(character)) {
      containsLatin = true;
    }

    if (containsMacedonianCyrillic && containsLatin) {
      return false;
    }
  }

  return true;
}

export function parseMacedonianLocalizationResult(
  value: unknown,
  expectedCandidates: readonly MacedonianLocalizationCandidateInput[],
): MacedonianLocalizationResult {
  if (!isRecord(value) || !hasExactKeys(value, RESULT_KEYS) || !Array.isArray(value.candidates)) {
    throw new Error('Invalid Macedonian localization result.');
  }

  const expectedById = new Map<string, MacedonianLocalizationCandidateInput>();
  for (const candidate of expectedCandidates) {
    if (!isNonblankString(candidate.candidateId) || expectedById.has(candidate.candidateId)) {
      throw new Error('Invalid expected localization candidates.');
    }
    expectedById.set(candidate.candidateId, candidate);
  }

  if (value.candidates.length !== expectedById.size) {
    throw new Error('Localization candidate IDs do not match the expected candidates.');
  }

  const seenIds = new Set<string>();
  const candidates = value.candidates.map((candidate) => {
    if (!isRecord(candidate) || !hasExactKeys(candidate, CANDIDATE_KEYS)) {
      throw new Error('Invalid localized candidate.');
    }

    const candidateId = candidate.candidateId;
    if (typeof candidateId !== 'string') {
      throw new Error('Localization candidate IDs do not match the expected candidates.');
    }
    const expected = expectedById.get(candidateId);
    if (!expected || seenIds.has(candidateId)) {
      throw new Error('Localization candidate IDs do not match the expected candidates.');
    }
    seenIds.add(candidateId);

    if (
      !isValidLocalizedText(candidate.name) ||
      !(candidate.category === null || isValidLocalizedText(candidate.category)) ||
      !isValidLocalizedText(candidate.reason) ||
      !Array.isArray(candidate.playIdeas) ||
      candidate.playIdeas.length !== expected.playIdeas.length
    ) {
      throw new Error(`Invalid localization for candidate ${candidateId}.`);
    }

    const playIdeas = candidate.playIdeas.map((playIdea) => {
      if (
        !isRecord(playIdea) ||
        !hasExactKeys(playIdea, PLAY_IDEA_KEYS) ||
        !isValidLocalizedText(playIdea.title) ||
        !isValidLocalizedText(playIdea.description)
      ) {
        throw new Error(`Invalid play idea localization for candidate ${candidateId}.`);
      }

      return { title: playIdea.title, description: playIdea.description };
    });

    return {
      candidateId,
      name: candidate.name,
      category: candidate.category,
      reason: candidate.reason,
      playIdeas,
    };
  });

  if (seenIds.size !== expectedById.size) {
    throw new Error('Localization candidate IDs do not match the expected candidates.');
  }

  return { candidates };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonblankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidLocalizedText(value: unknown): value is string {
  return isNonblankString(value) &&
    hasOnlyAllowedMacedonianCyrillic(value) &&
    hasNoMixedCyrillicLatinWords(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
