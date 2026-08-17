// @ts-ignore Deno resolves npm: specifiers when the Edge Function is bundled.
import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { isValidCropRegistrationPath, TOY_IMAGE_BUCKET, type CropRegistrationInput } from './crop-registration.ts';
// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import type { ToyLocalization, ToyLocalizationQuery } from './localization.ts';
// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { ReplicateGroundingDinoProvider } from './replicate-grounding-dino.ts';
// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { OpenAIMacedonianLocalizationProvider, MacedonianLocalizationProviderError } from './openai-macedonian-localization.ts';
// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import type { MacedonianLocalizedCandidate as LocalizedCandidateText } from './macedonian-localization.ts';
// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { PHYSICAL_TOY_RECONCILIATION_INSTRUCTIONS } from './physical-toy-instructions.ts';
// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { unionCandidateRegions, type NormalizedCandidateRegion } from './candidate-region.ts';
// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { areCandidateAssociationsValid } from './candidate-associations.ts';
// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { buildCropRefinementRequestCandidates, CROP_REFINEMENT_INSTRUCTIONS, cropRefinementSchema, finalizeCropRefinementRegion, isCropCompleteness, selectCropRefinementCandidateIds, shouldEscalateCropRefinement, trustedPrimarySourceBoundaryEdges, validateCropRefinementOutput, type CropCompleteness, type CropRefinementEscalationReason, type SourceBoundaryEdge } from './crop-refinement.ts';

type SupportedMimeType = 'image/jpeg' | 'image/png' | 'image/webp';
type Recommendation = 'KEEP' | 'ROTATE' | 'PASS_ON';

type AnalyzeToyShelfRequest = {
  mode?: 'full-photo';
  imageBase64: string;
  mimeType: SupportedMimeType;
  childAgeMonths: number;
  imageWidth: number;
  imageHeight: number;
};

type CandidateSemanticImage = {
  candidateId: string;
  imageBase64: string;
  mimeType: 'image/jpeg';
  boundingBox: BoundingBox;
};

type AnalyzeDetectedCandidatesRequest = {
  mode: 'detected-candidates';
  childAgeMonths: number;
  sourceImageBase64: string;
  includeDebug?: boolean;
  candidateImages: CandidateSemanticImage[];
};

type RegisterCropRequest = CropRegistrationInput & {
  mode: 'register-crop';
};

type PlayIdea = {
  title: string;
  description: string;
};

type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ModelToy = {
  name: string;
  category: string | null;
  recommendation: Recommendation;
  reason: string;
  confidence: number | null;
  playIdeas: PlayIdea[];
};

type ToyAnalysisItem = ModelToy & {
  id: string;
  boundingBox: BoundingBox | null;
  candidateId?: string;
};

type ToyAnalysisResult = {
  analysisId: string;
  childAgeMonths: number;
  toys: ToyAnalysisItem[];
};

type CropRefinementDebug = {
  candidateId: string;
  cropCompleteness: CropCompleteness;
  primaryModel: string;
  primaryAttempted: boolean;
  primarySucceeded: boolean;
  primaryRefinedBoundingBox: BoundingBox | null;
  primarySourceBoundaryEdges: SourceBoundaryEdge[];
  primarySourceBoundarySuspicious: boolean;
  terraEscalated: boolean;
  terraEscalationReason: CropRefinementEscalationReason | null;
  fallbackModel: string;
  fallbackAttempted: boolean;
  fallbackSucceeded: boolean;
  fallbackRefinedBoundingBox: BoundingBox | null;
  fallbackSourceBoundaryEdges: SourceBoundaryEdge[];
  originalCombinedBoundingBox: BoundingBox;
  finalBoundingBox: BoundingBox;
};

type DenoRuntime = {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

declare const Deno: DenoRuntime;

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const OPENAI_MODEL = 'gpt-5.6-sol';
const CROP_REFINEMENT_PRIMARY_MODEL = 'gpt-4o-mini';
const CROP_REFINEMENT_FALLBACK_MODEL = 'gpt-5.6-terra';
const MAX_TOY_ITEMS = 20;
const supportedMimeTypes = new Set<SupportedMimeType>([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    toys: {
      type: 'array',
      maxItems: MAX_TOY_ITEMS,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          category: { type: ['string', 'null'] },
          recommendation: {
            type: 'string',
            enum: ['KEEP', 'ROTATE', 'PASS_ON'],
          },
          reason: { type: 'string' },
          confidence: {
            type: ['number', 'null'],
            minimum: 0,
            maximum: 1,
          },
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
        required: [
          'name',
          'category',
          'recommendation',
          'reason',
          'confidence',
          'playIdeas',
        ],
      },
    },
  },
  required: ['toys'],
} as const;

const analysisInstructions = `
You analyze a photo of a toy shelf for a parent.

First, silently perform a systematic visual inventory of the entire image. Carefully
scan the top, middle, and bottom, and within each area scan the left, center, and
right. Do not output scan notes or hidden reasoning.

Look carefully for small toys as well as large, obvious toys. Consider toys that are
partially occluded, inside baskets, stacked, or next to other toys. Make a careful
effort to inspect small visible objects before deciding they cannot be identified.

Identify visually distinct physical toys separately when reasonably possible. Do not
group separate objects merely because they are the same toy type. Group only when
objects are too visually overlapping to distinguish reliably as separate toys or
form a genuine inseparable toy group in the image.

${PHYSICAL_TOY_RECONCILIATION_INSTRUCTIONS}

Inspect only toys visibly present in the supplied image. Do not invent toys that
cannot reasonably be seen. Missing a toy is preferable to confidently inventing one.

When an object is visibly a toy but its exact identity is uncertain, prefer a cautious
generic Macedonian description such as "мало возило играчка", "дрвена животинска
фигура", "играчка за редење", or "мека играчка". Do not infer a brand name or specific product identity unless it
is clearly visible in the image. A lower confidence score is appropriate for an
uncertain-but-visible toy; omit an object if it cannot reasonably be identified as a
toy.

Return no more than ${MAX_TOY_ITEMS} visible toy items or groups. This is a maximum,
not a target. If more are visible, prioritize the clearest distinguishable toys
without inventing details. Consider the child's age supplied by the user.

For each visible toy or group, choose exactly one recommendation:

KEEP: The toy appears age-appropriate, useful, engaging, open-ended,
developmentally valuable, or worth keeping accessible.

ROTATE: The toy may still be useful but could be temporarily stored to reduce
clutter, duplication, or overstimulation and reintroduced later.

PASS_ON: The toy appears clearly outgrown, substantially duplicated, poorly matched
to the child's current developmental stage, or unlikely to provide continued value.

For every KEEP toy, return exactly 2 or 3 play ideas in playIdeas. Make each idea
appropriate for the supplied child age in months and specifically use the detected
toy in a varied, creative, or interesting way. Keep titles short and descriptions
concise so a parent can understand them quickly. Avoid generic parenting advice and
do not recommend buying extra products. Do not invent capabilities the visible toy
clearly does not have. When identification is uncertain, use safe, generic play ideas
that match the visible toy or category.

For every ROTATE or PASS_ON toy, return playIdeas as an empty array. Do not generate
play ideas for those recommendations.

Never recommend disposal based on unsupported assumptions. Use a short,
parent-friendly reason focused only on why the recommendation fits the child and toy.
Do not discuss recognition uncertainty, visibility, occlusion, or image quality in the
reason. Set category to null when a useful category is unclear. Set confidence to a
number from 0 to 1 when reasonable, otherwise null. Return an empty toys array if no
toys can be identified with reasonable confidence.
`.trim();

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, {
      Allow: 'POST, OPTIONS',
    });
  }

  const authentication = await authenticateRequest(request);

  if (!authentication.ok) {
    return jsonResponse(
      { error: authentication.status === 401 ? 'Authentication required.' : 'Authentication service is not configured.' },
      authentication.status,
    );
  }

  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return jsonResponse({ error: 'Request body must be valid JSON.' }, 400);
  }

  const input = validateRequest(requestBody);

  if (!input.ok) {
    return jsonResponse({ error: input.error }, 400);
  }

  if (input.value.mode === 'register-crop') {
    return registerCropImage(
      input.value,
      authentication.userId,
    );
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY')?.trim();

  if (!apiKey) {
    console.error('analyze-toy-shelf is missing its OPENAI_API_KEY secret.');
    return jsonResponse({ error: 'Analysis service is not configured.' }, 500);
  }

  if (input.value.mode === 'detected-candidates') {
    return analyzeDetectedCandidates(
      input.value,
      authentication.userId,
      apiKey,
    );
  }

  let openAIResponse: Response;

  try {
    openAIResponse = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        store: false,
        max_output_tokens: 4000,
        input: [
          {
            role: 'developer',
            content: [{ type: 'input_text', text: analysisInstructions }],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: `The child is ${input.value.childAgeMonths} months old.`,
              },
              {
                type: 'input_image',
                image_url: `data:${input.value.mimeType};base64,${input.value.imageBase64}`,
                detail: 'high',
              },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'toy_shelf_analysis',
            strict: true,
            schema: responseSchema,
          },
        },
      }),
    });
  } catch (error) {
    console.error('OpenAI request failed before receiving a response.', safeError(error));
    return jsonResponse({ error: 'Analysis provider is unavailable.' }, 502);
  }

  if (!openAIResponse.ok) {
    console.error('OpenAI returned an error.', {
      status: openAIResponse.status,
      requestId: openAIResponse.headers.get('x-request-id'),
    });
    return jsonResponse({ error: 'Analysis provider request failed.' }, 502);
  }

  let openAIResponseBody: unknown;

  try {
    openAIResponseBody = await openAIResponse.json();
  } catch {
    console.error('OpenAI returned a non-JSON response.');
    return jsonResponse({ error: 'Analysis provider returned an invalid response.' }, 502);
  }

  const outputText = extractOutputText(openAIResponseBody);

  if (!outputText) {
    console.error('OpenAI response did not contain structured output text.');
    return jsonResponse({ error: 'Analysis provider returned an invalid response.' }, 502);
  }

  let modelOutput: unknown;

  try {
    modelOutput = JSON.parse(outputText);
  } catch {
    console.error('OpenAI structured output could not be parsed.');
    return jsonResponse({ error: 'Analysis provider returned malformed data.' }, 502);
  }

  const validatedOutput = validateModelOutput(modelOutput);

  if (!validatedOutput.ok) {
    console.error('OpenAI structured output failed server validation.');
    return jsonResponse({ error: 'Analysis provider returned malformed data.' }, 502);
  }

  const semanticToys = validatedOutput.toys.map((toy) => ({
    id: crypto.randomUUID(),
    ...toy,
  }));
  const localizations = await localizeSemanticToys(
    semanticToys,
    input.value,
  );
  const localizationByToyId = new Map(
    localizations.map((localization) => [localization.toyId, localization]),
  );

  const result: ToyAnalysisResult = {
    analysisId: '',
    childAgeMonths: input.value.childAgeMonths,
    toys: semanticToys.map((toy) => ({
      ...toy,
      boundingBox: localizationByToyId.get(toy.id)?.boundingBox ?? null,
    })),
  };

  const persistenceResult = await persistAnalysis(result, authentication.userId);

  if (!persistenceResult.ok) {
    return jsonResponse({ error: 'Analysis could not be saved.' }, 500);
  }

  result.analysisId = persistenceResult.analysisId;

  return jsonResponse(result, 200);
});

async function localizeSemanticToys(
  toys: Array<ModelToy & { id: string }>,
  input: AnalyzeToyShelfRequest,
): Promise<ToyLocalization[]> {
  if (toys.length === 0) {
    return [];
  }

  const apiToken = Deno.env.get('REPLICATE_API_TOKEN')?.trim();

  console.info('[toy-analysis] replicate_config', {
    tokenConfigured: Boolean(apiToken),
  });

  if (!apiToken) {
    console.warn('[toy-analysis] localization_missing', {
      reason: 'provider_not_configured',
      toyCount: toys.length,
    });
    return [];
  }

  const configuredDebugQuery = Deno.env.get('GROUNDING_DINO_DEBUG_QUERY')?.trim();
  const toyQueries: ToyLocalizationQuery[] = configuredDebugQuery
    ? [{ toyId: toys[0].id, query: configuredDebugQuery }]
    : toys.map((toy) => ({
        toyId: toy.id,
        query: createLocalizationQuery(toy),
      }));

  console.info('[toy-analysis] localization_started', {
    toyCount: toys.length,
    queryCount: toyQueries.length,
  });

  try {
    const provider = new ReplicateGroundingDinoProvider(apiToken);
    const localizations = await provider.localizeToys({
      imageDataUrl: `data:${input.mimeType};base64,${input.imageBase64}`,
      imageWidth: input.imageWidth,
      imageHeight: input.imageHeight,
      toyQueries,
    });
    const localizationByToyId = new Map(
      localizations.map((localization) => [localization.toyId, localization]),
    );

    for (const toy of toys) {
      const localization = localizationByToyId.get(toy.id);

      if (localization) {
        console.info('[toy-analysis] localization_result', {
          toyName: toy.name,
          query: localization.query,
          detectionsReturned: localizations.length,
          detectorConfidence: localization.confidence,
          accepted: true,
          normalizedBoundingBox: localization.boundingBox,
        });
      } else {
        console.info('[toy-analysis] localization_missing', {
          toyName: toy.name,
          query: toyQueries.find((item) => item.toyId === toy.id)?.query,
          detectionsReturned: localizations.length,
          bestConfidence: null,
          accepted: false,
        });
      }
    }

    console.info('[toy-analysis] localization_completed', {
      toyCount: toys.length,
      localizedCount: localizations.length,
    });

    return localizations;
  } catch (error) {
    console.warn('[toy-analysis] localization_completed', {
      toyCount: toys.length,
      localizedCount: 0,
      error: safeError(error),
    });
    return [];
  }
}

function createLocalizationQuery(toy: ModelToy): string {
  const name = toy.name.replace(/[,.;]+/g, ' ').replace(/\s+/g, ' ').trim();
  const category = toy.category
    ?.replace(/[,.;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const combined = category && !name.toLowerCase().includes(category.toLowerCase())
    ? `${name} ${category}`
    : name;

  return /\b(toy|plush|figure|doll|blocks?|puzzle|vehicle|car|truck)\b/i.test(combined)
    ? combined
    : `${combined} toy`;
}

type CandidateModelResult = {
  candidateId: string;
  isToy: boolean;
  belongsToCandidateId: string | null;
  cropCompleteness: CropCompleteness | null;
  name: string | null;
  category: string | null;
  recommendation: Recommendation | null;
  reason: string | null;
  confidence: number | null;
  playIdeas: PlayIdea[];
};

async function analyzeDetectedCandidates(
  input: AnalyzeDetectedCandidatesRequest,
  userId: string,
  apiKey: string,
): Promise<Response> {
  const candidateIds = input.candidateImages.map((candidate) => candidate.candidateId);
  const content: Array<Record<string, unknown>> = [
    {
      type: 'input_text',
      text: `The child is ${input.childAgeMonths} months old. Analyze exactly the ${candidateIds.length} supplied candidate crops. Return exactly one result for every supplied candidateId and no other IDs.`,
    },
  ];
  for (const candidate of input.candidateImages) {
    content.push(
      { type: 'input_text', text: `candidateId: ${candidate.candidateId}` },
      {
        type: 'input_image',
        image_url: `data:image/jpeg;base64,${candidate.imageBase64}`,
        detail: 'high',
      },
    );
  }

  console.info('[toy-analysis] semantic_batch_started', {
    candidateCount: candidateIds.length,
    candidateIds,
  });
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        store: false,
        max_output_tokens: 4000,
        input: [
          {
            role: 'developer',
            content: [{ type: 'input_text', text: candidateSemanticInstructions }],
          },
          { role: 'user', content },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'candidate_semantic_analysis',
            strict: true,
            schema: candidateSemanticSchema(candidateIds),
          },
        },
      }),
    });
  } catch (error) {
    console.warn('[toy-analysis] semantic_batch_completed', {
      candidateCount: candidateIds.length,
      latencyMs: Date.now() - startedAt,
      error: safeError(error),
    });
    return jsonResponse({ error: 'Analysis provider is unavailable.' }, 502);
  }

  if (!response.ok) {
    console.warn('[toy-analysis] semantic_batch_completed', {
      candidateCount: candidateIds.length,
      latencyMs: Date.now() - startedAt,
      status: response.status,
      requestId: response.headers.get('x-request-id'),
    });
    return jsonResponse({ error: 'Analysis provider request failed.' }, 502);
  }

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    return jsonResponse({ error: 'Analysis provider returned an invalid response.' }, 502);
  }
  const outputText = extractOutputText(responseBody);
  if (!outputText) {
    return jsonResponse({ error: 'Analysis provider returned an invalid response.' }, 502);
  }

  let rawOutput: unknown;
  try {
    rawOutput = JSON.parse(outputText);
  } catch {
    return jsonResponse({ error: 'Analysis provider returned malformed data.' }, 502);
  }
  const semantic = validateCandidateSemanticOutput(rawOutput, candidateIds);
  if (!semantic.ok) {
    return jsonResponse({ error: 'Analysis provider returned malformed data.' }, 502);
  }

  const usage = extractUsage(responseBody);
  for (const candidate of semantic.candidates) {
    console.info('[toy-analysis] semantic_candidate_result', {
      candidateId: candidate.candidateId,
      isToy: candidate.isToy,
      name: candidate.name,
      recommendation: candidate.recommendation,
      confidence: candidate.confidence,
      playIdeaCount: candidate.playIdeas.length,
    });
  }
  const rejectedCandidateIds = semantic.candidates
    .filter((candidate) => !candidate.isToy)
    .map((candidate) => candidate.candidateId);
  console.info('[toy-analysis] semantic_filter_completed', {
    suppliedCandidateCount: candidateIds.length,
    acceptedToyCount: semantic.candidates.filter((candidate) => candidate.isToy).length,
    rejectedCandidateIds,
  });
  console.info('[toy-analysis] semantic_batch_completed', {
    candidateCount: candidateIds.length,
    acceptedToyCount: semantic.candidates.filter((candidate) => candidate.isToy).length,
    latencyMs: Date.now() - startedAt,
    usage,
  });

  const acceptedCandidates = semantic.candidates.filter((candidate): candidate is CandidateModelResult & {
    isToy: true;
    name: string;
    recommendation: Recommendation;
    reason: string;
  } => candidate.isToy);

  const candidateRegions = new Map(
    input.candidateImages.map((candidate) => [candidate.candidateId, candidate.boundingBox]),
  );
  const originalRegions = new Map(
    acceptedCandidates.map((candidate) => [
      candidate.candidateId,
      getCombinedCandidateRegion(candidate.candidateId, semantic.candidates, candidateRegions),
    ]),
  );
  const primaryRefinement = await refineAcceptedCandidates(
    input,
    acceptedCandidates,
    originalRegions,
    apiKey,
    CROP_REFINEMENT_PRIMARY_MODEL,
  );
  const escalation = acceptedCandidates.map((candidate) => {
    const primary = primaryRefinement.diagnostics.get(candidate.candidateId)!;
    const decision = shouldEscalateCropRefinement({
      cropCompleteness: candidate.cropCompleteness!,
      originalRegion: originalRegions.get(candidate.candidateId)!,
      primaryRefinedRegion: primary.refined,
      primarySourceBoundaryEdges: primary.sourceBoundaryEdges,
      primarySucceeded: primary.succeeded,
    });
    const trustedPrimaryEdges = trustedPrimarySourceBoundaryEdges(
      originalRegions.get(candidate.candidateId)!,
      primary.refined,
      primary.sourceBoundaryEdges,
    );
    return {
      candidate,
      ...decision,
      primarySourceBoundarySuspicious:
        decision.reason === 'SUSPICIOUS_PRIMARY_SOURCE_BOUNDARY',
      trustedPrimaryEdges,
    };
  });
  const escalatedCandidates = escalation
    .filter((item) => item.shouldEscalate)
    .map((item) => item.candidate);
  const fallbackInputRegions = new Map<string, BoundingBox>();
  for (const candidate of escalatedCandidates) {
    const primary = primaryRefinement.diagnostics.get(candidate.candidateId)!;
    const decision = escalation.find((item) =>
      item.candidate.candidateId === candidate.candidateId
    )!;
    fallbackInputRegions.set(candidate.candidateId, getFinalCandidateRegion(
      originalRegions.get(candidate.candidateId)!,
      primary.refined,
      decision.trustedPrimaryEdges,
      undefined,
      [],
    ));
  }
  const fallbackRefinement = escalatedCandidates.length > 0
    ? await refineAcceptedCandidates(input, escalatedCandidates, fallbackInputRegions, apiKey, CROP_REFINEMENT_FALLBACK_MODEL)
    : emptyRefinementRun(acceptedCandidates);

  let localizedCandidates: Map<string, LocalizedCandidateText>;
  if (acceptedCandidates.length === 0) {
    localizedCandidates = new Map();
  } else {
    const localizationProvider = new OpenAIMacedonianLocalizationProvider(apiKey);
    try {
      const localizationResult = await localizationProvider.localize({
        candidates: acceptedCandidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          name: candidate.name,
          category: candidate.category,
          recommendation: candidate.recommendation,
          reason: candidate.reason,
          playIdeas: candidate.playIdeas,
        })),
      });
      localizedCandidates = new Map(
        localizationResult.candidates.map((candidate) => [candidate.candidateId, candidate]),
      );
    } catch (error) {
      const providerError = error instanceof MacedonianLocalizationProviderError
        ? {
            code: error.code,
            status: error.status,
            requestId: error.requestId,
            message: error.message,
          }
        : safeError(error);
      console.error('[toy-analysis] macedonian_localization_failed', providerError);
      return jsonResponse({ error: 'Analysis presentation is unavailable.' }, 502);
    }
  }

  if (
    localizedCandidates.size !== acceptedCandidates.length ||
    acceptedCandidates.some((candidate) => !localizedCandidates.has(candidate.candidateId))
  ) {
    console.error('[toy-analysis] macedonian_localization_failed', {
      code: 'candidate_set_mismatch',
    });
    return jsonResponse({ error: 'Analysis presentation is unavailable.' }, 502);
  }

  const result: ToyAnalysisResult = {
    analysisId: '',
    childAgeMonths: input.childAgeMonths,
    toys: acceptedCandidates.map((candidate) => {
      const localized = localizedCandidates.get(candidate.candidateId)!;
      return {
        id: crypto.randomUUID(),
        candidateId: candidate.candidateId,
        name: localized.name,
        category: localized.category,
        recommendation: candidate.recommendation,
        reason: localized.reason,
        confidence: candidate.confidence,
        playIdeas: localized.playIdeas.map((playIdea) => ({
          title: playIdea.title,
          description: playIdea.description,
        })),
        boundingBox: getFinalCandidateRegion(
          originalRegions.get(candidate.candidateId)!,
          primaryRefinement.regions.get(candidate.candidateId),
          escalation.find((item) => item.candidate.candidateId === candidate.candidateId)!.trustedPrimaryEdges,
          fallbackRefinement.regions.get(candidate.candidateId),
          fallbackRefinement.sourceBoundaryEdges.get(candidate.candidateId),
        ),
      };
    }),
  };
  const persistence = await persistAnalysis(result, userId);
  if (!persistence.ok) {
    return jsonResponse({ error: 'Analysis could not be saved.' }, 500);
  }
  result.analysisId = persistence.analysisId;
  return jsonResponse({
    ...result,
    usage,
    ...(input.includeDebug ? { cropRefinementDebug: buildCropRefinementDebug(
      acceptedCandidates,
      originalRegions,
      primaryRefinement,
      fallbackRefinement,
      escalation,
    ) } : {}),
  }, 200);
}

const candidateSemanticInstructions = `
You analyze only the supplied candidate crop images. They have already been selected
by a toy-focused object detector. The detector has defined the complete candidate
inventory; do not search for additional objects or infer objects outside these crops.

Write all source fields in clear, concise, literal English: name, category, reason,
and playIdeas titles and descriptions. Preserve recognized proper names, brands, and
characters such as Paw Patrol Marshall. A separate localization step handles
Macedonian presentation; do not generate Macedonian-language text here.

Treat a candidate as a toy when it reasonably appears to contain a toy, toy figure,
animal figure, plush or stuffed toy, doll, toy vehicle, block or construction toy,
puzzle piece or toy, interactive toy, or a recognizable visible portion of a toy
that is itself the candidate's physical object. A candidate
does not need to be perfectly framed or completely visible. Partial visibility,
cropped legs, ears, or wheels, occlusion, an unusual viewing angle, or uncertainty
about the exact product identity are not sufficient reasons to set isToy to false.

${PHYSICAL_TOY_RECONCILIATION_INSTRUCTIONS}

Because the response must contain one record for every supplied candidateId, use
isToy false with the normal null fields and empty playIdeas for a candidate suppressed
as an attached component, detachable member of one sellable set, duplicate view, or
less-complete view when another candidate represents the complete toy or set. This
suppression means the candidate is not an independent sellable item; it does not mean
that partially visible separate toys should be rejected.

If a candidate clearly appears toy-like but its exact identity is uncertain, set
isToy to true, use a cautious generic English name such as "plastic animal figure",
"soft toy dog", "small toy vehicle", or "toy figure", and lower semantic confidence
when appropriate. Use isToy false only when the visible candidate clearly appears to be a
non-toy object such as furniture, wall or background, a container or basket with no
toy as the actual candidate, a household object, clothing, or another unrelated
object. When uncertain between a partially visible toy and a non-toy, prefer the toy
classification only when there is reasonable visual evidence of a toy. Do not
hallucinate a specific brand or character merely to avoid rejection.

For every supplied candidateId, decide whether the crop represents a toy. If isToy
is false, return null for name, category, recommendation, reason, and confidence,
return belongsToCandidateId as the accepted representative candidateId when this
candidate is an attached component, detachable set piece, associated accessory,
duplicate, or partial view of that same sellable toy or set; otherwise return null.
If isToy is true, return
belongsToCandidateId as null and return a cautious useful
name, category or null, exactly one KEEP/ROTATE/PASS_ON recommendation, one short
concrete parent-friendly reason, and confidence from 0 to 1 or null. Use a brand or licensed
character only when clearly recognizable; otherwise use a generic visual name.

For every accepted candidate, also return cropCompleteness. Use COMPLETE unless
there is positive visual evidence that a meaningful part of the complete sellable
toy continues beyond the crop boundary. Use LIKELY_CLIPPED when a ladder, boom,
wing, rotor, tail, handle, vehicle body, or other structural part is visibly cut by
an image edge. Do not mark a toy clipped merely because it is near an edge. If
uncertain, use COMPLETE. Suppressed candidates must return cropCompleteness as null.

Use the most specific identity clearly supported by the crop. Apply this naming
hierarchy in order: (1) a clearly recognizable brand, character, or product identity;
(2) a specific toy or object identity; (3) a specific animal or object type; and
(4) a generic toy category only when necessary. For example, use "plastic horse
figure" rather than "plastic animal figure" when the animal is clearly a horse. If a
licensed character such as Paw Patrol Marshall is clearly recognizable, use that
identity rather than reducing it to a generic "soft toy dog". Never invent a brand,
character, or product identity that the crop does not support. When identity is
genuinely uncertain, use a generic visual name and lower confidence. Do not become
more generic than the visible evidence requires. Keep names concise and useful,
preferably "[recognized identity or product] + [toy type]", such as "Marshall Paw
Patrol plush toy", "VTech interactive dog", or "plastic horse figure". Do not write
long product descriptions. Use a simple category such as "plush toy", "interactive
toy", "animal figure", "building toy", or "toy vehicle", never a marketing phrase.

Choose recommendations using this stable rubric:

KEEP: The toy is clearly age-appropriate and has meaningful continued play value,
such as open-ended use, developmental value, strong imaginative or play potential,
repeated useful engagement, or a distinctive role that is not obviously duplicated.

ROTATE: The toy is still age-appropriate and potentially useful, but there is a
reasonable reason not to keep it continuously available, such as narrow or repetitive
play, likely duplication with similar toys, lower novelty, usefulness mainly when
periodically reintroduced, or temporarily reducing clutter or overstimulation.

PASS_ON: Use only when there is reasonably strong evidence that the toy is clearly
outgrown, poorly suited to the supplied child age, substantially redundant or
duplicated, or unlikely to provide meaningful continued play value. Do not use
PASS_ON merely because a toy is simple.

When evidence is ambiguous between KEEP and ROTATE, compare the candidate against
these criteria consistently and choose the best-supported recommendation rather than
arbitrarily varying the decision.

For KEEP, return exactly 2 or 3 short practical play ideas appropriate for the
supplied child age that use that toy and require no purchase. Each idea must be
concrete, practical, understandable without interpretation, directly related to the
specific toy, and meaningfully different from the other ideas. The title and
description must describe the same activity. Avoid vague titles such as "mini game",
"fun activity", or "play together" unless the description defines a specific action.
Use a short title and one short instruction, preferably one sentence, that tells the
parent exactly what to do. The activity itself is enough: do not append developmental,
educational, social, creativity, engagement, exploration, or movement commentary.
Do not add generic developmental filler. Base ideas only on capabilities visibly
supported by the crop, capabilities explicitly supported by a clearly identified toy,
or basic play uses naturally inherent to that toy type.

Visible feature does not mean known functionality. Seeing buttons does not establish
what pressing them does; printed numbers do not establish speech or number-teaching;
musical-looking symbols do not establish songs; a speaker-like area does not
establish sound; printed icons do not establish functionality; and controls do not
establish lights, speech, music, movement, or electronic behavior. Mention a
capability only when the crop genuinely supports it
or it is safely known from a clearly identified toy or product. Do not claim or
invent sounds, songs or music, lights, speech, movement, dancing, electronic
interaction, educational content, transformation, or accessories otherwise.

When functionality is uncertain, use only visibly safe actions. Visible numbers may
support pointing to, finding, or naming numbers, but not pressing a button to hear
numbers, listening to songs, or activating sounds. Visible buttons may support
pressing the visible buttons, but no claim about the result. A simple horse figure
supports imaginative role-play; a plush character supports hugging and pretend play.
For ROTATE and PASS_ON, return an empty playIdeas array. Never recommend disposal
based on an unsupported assumption.

For a detached accessory, associate it only when there is strong semantic evidence
that it belongs to the accepted parent toy, such as a matching brand/design,
obvious remote-control relationship, or recognizable accessory-to-product relation.
Do not associate a nearby object merely because it is close, overlaps, or looks
similar. A matching remote beside a HUINA fire truck belongs to the truck; two
unrelated cars or a car beside an unrelated remote remain independent toys.

Every reason must explain why the selected recommendation fits this specific toy.
Normally use one short sentence of about 8 to 20 words; use at most two short
sentences only when genuinely necessary. Prefer concrete play characteristics and
practical value. Do not write a mini developmental assessment, and do not justify a
recommendation merely by saying the toy matches the child's age. Avoid abstract,
marketing-like phrases such as "promotes engagement", "supports development",
"developmental stage", "valuable addition", "provides opportunities", "encourages
participation", "suitable for continued engagement", "educational benefits",
"enhances creativity", or "fosters social skills".

Use only the crop, toy identity/category, child age, and genuinely visible
relationships among the supplied candidates. Do not imply knowledge of usage
frequency, boredom, favorites, ownership or purchase history, invisible condition,
or household behavior. Do not compare which candidate receives more play, infer that
a toy has been unused recently, or infer that the child prefers another candidate.
Several candidates appearing in one photo provide no usage-history evidence. For
KEEP, state the actual continued play value. For ROTATE,
use a concrete reason such as narrow or repetitive play, visible overlap with another
similar candidate, or the toy-specific value of periodically varying the available
play opportunities. ROTATE does not require evidence that the child stopped using the
toy, and do not mechanically say to bring it back later in every ROTATE reason. Do not
claim that it offers fewer experiences, receives less engagement, is more boring, or
is used less than other toys. Do not claim the toy is used less often, and do not use circular
reasoning such as "rotate because it need not be available all the time." For
PASS_ON, state the evidence for being outgrown, poorly suited, substantially
redundant, or unlikely to provide continued value. Use cross-candidate duplication
only when it is genuinely visible, such as clearly duplicate cars or nearly identical
figures. Describe the visible overlap rather than inventing child behavior. Do not use
vague comparisons such as "the other toys are more engaging" or "offers fewer
experiences than the other toys".
`.trim();

function candidateSemanticSchema(candidateIds: string[]): Record<string, unknown> {
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
            candidateId: { type: 'string', enum: candidateIds },
            isToy: { type: 'boolean' },
            belongsToCandidateId: { type: ['string', 'null'], enum: [...candidateIds, null] },
            cropCompleteness: { type: ['string', 'null'], enum: ['COMPLETE', 'LIKELY_CLIPPED', null] },
            name: { type: ['string', 'null'] },
            category: { type: ['string', 'null'] },
            recommendation: {
              type: ['string', 'null'],
              enum: ['KEEP', 'ROTATE', 'PASS_ON', null],
            },
            reason: { type: ['string', 'null'] },
            confidence: { type: ['number', 'null'], minimum: 0, maximum: 1 },
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
          required: [
            'candidateId', 'isToy', 'belongsToCandidateId', 'cropCompleteness', 'name', 'category', 'recommendation',
            'reason', 'confidence', 'playIdeas',
          ],
        },
      },
    },
    required: ['candidates'],
  };
}

function validateCandidateSemanticOutput(
  value: unknown,
  expectedIds: string[],
): { ok: true; candidates: CandidateModelResult[] } | { ok: false } {
  if (!isRecord(value) || !Array.isArray(value.candidates) || value.candidates.length !== expectedIds.length) {
    return { ok: false };
  }
  const expected = new Set(expectedIds);
  const byId = new Map<string, CandidateModelResult>();
  for (const raw of value.candidates) {
    const parsed = validateCandidateSemanticItem(raw);
    if (!parsed || !expected.has(parsed.candidateId) || byId.has(parsed.candidateId)) {
      return { ok: false };
    }
    byId.set(parsed.candidateId, parsed);
  }
  if (byId.size !== expected.size) {
    return { ok: false };
  }
  if (!areCandidateAssociationsValid([...byId.values()], expectedIds)) {
    return { ok: false };
  }
  return { ok: true, candidates: expectedIds.map((id) => byId.get(id)!) };
}

function validateCandidateSemanticItem(value: unknown): CandidateModelResult | null {
  if (!isRecord(value) || typeof value.candidateId !== 'string' || typeof value.isToy !== 'boolean') {
    return null;
  }
  const candidateId = value.candidateId.trim();
  if (!candidateId) return null;
  if (!value.isToy) {
    if (
      !(value.belongsToCandidateId === null || typeof value.belongsToCandidateId === 'string') ||
      value.cropCompleteness !== null ||
      value.name !== null || value.category !== null || value.recommendation !== null ||
      value.reason !== null || value.confidence !== null ||
      !Array.isArray(value.playIdeas) || value.playIdeas.length !== 0
    ) return null;
    return { candidateId, isToy: false, belongsToCandidateId: value.belongsToCandidateId, cropCompleteness: null, name: null, category: null, recommendation: null, reason: null, confidence: null, playIdeas: [] };
  }
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const reason = typeof value.reason === 'string' ? value.reason.trim() : '';
  const category = value.category === null ? null : typeof value.category === 'string' && value.category.trim() ? value.category.trim() : undefined;
  const confidence = value.confidence;
  if (
    value.belongsToCandidateId !== null ||
    !isCropCompleteness(value.cropCompleteness) ||
    !name || !reason || category === undefined || !isRecommendation(value.recommendation) ||
    !(confidence === null || (typeof confidence === 'number' && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1))
  ) return null;
  const playIdeas = validatePlayIdeas(value.playIdeas, value.recommendation);
  if (!playIdeas) return null;
  return { candidateId, isToy: true, belongsToCandidateId: null, cropCompleteness: value.cropCompleteness, name, category, recommendation: value.recommendation, reason, confidence, playIdeas };
}

function getCombinedCandidateRegion(
  acceptedCandidateId: string,
  candidates: readonly CandidateModelResult[],
  regions: ReadonlyMap<string, BoundingBox>,
): BoundingBox {
  const associatedIds = candidates
    .filter((candidate) => candidate.belongsToCandidateId === acceptedCandidateId)
    .map((candidate) => candidate.candidateId);
  const regionList: NormalizedCandidateRegion[] = [
    acceptedCandidateId,
    ...associatedIds,
  ].map((candidateId) => {
    const region = regions.get(candidateId);
    if (!region) {
      throw new Error('Candidate region is unavailable.');
    }
    return region;
  });

  return unionCandidateRegions(regionList);
}

function getFinalCandidateRegion(
  originalRegion: BoundingBox,
  primaryRefinedRegion: BoundingBox | null | undefined,
  primarySourceBoundaryEdges: readonly SourceBoundaryEdge[] = [],
  fallbackRefinedRegion: BoundingBox | null | undefined,
  fallbackSourceBoundaryEdges: readonly SourceBoundaryEdge[] = [],
): BoundingBox {
  const primaryRegion = finalizeCropRefinementRegion(
    originalRegion,
    primaryRefinedRegion ?? undefined,
    primarySourceBoundaryEdges,
  );
  return finalizeCropRefinementRegion(
    primaryRegion,
    fallbackRefinedRegion ?? undefined,
    fallbackSourceBoundaryEdges,
  );
}

type RefinementRunResult = {
  regions: Map<string, BoundingBox>;
  sourceBoundaryEdges: Map<string, SourceBoundaryEdge[]>;
  diagnostics: Map<string, { attempted: boolean; succeeded: boolean; refined: BoundingBox | null; sourceBoundaryEdges: SourceBoundaryEdge[] }>;
};

async function refineAcceptedCandidates(
  input: AnalyzeDetectedCandidatesRequest,
  acceptedCandidates: readonly CandidateModelResult[],
  originalRegions: ReadonlyMap<string, BoundingBox>,
  apiKey: string,
  model: string,
): Promise<RefinementRunResult> {
  const diagnostics = new Map<string, { attempted: boolean; succeeded: boolean; refined: BoundingBox | null; sourceBoundaryEdges: SourceBoundaryEdge[] }>(
    acceptedCandidates.map((candidate) => [
      candidate.candidateId,
      { attempted: false, succeeded: false, refined: null, sourceBoundaryEdges: [] },
    ]),
  );
  const candidateIds = selectCropRefinementCandidateIds(acceptedCandidates);
  if (candidateIds.length === 0) {
    return { regions: new Map(), sourceBoundaryEdges: new Map(), diagnostics };
  }
  const requestCandidates = buildCropRefinementRequestCandidates(
    acceptedCandidates,
    originalRegions,
  );

  const content: Array<Record<string, unknown>> = [
    {
      type: 'input_text',
      text: [
        CROP_REFINEMENT_INSTRUCTIONS,
        JSON.stringify(requestCandidates),
      ].join('\n'),
    },
    {
      type: 'input_image',
      image_url: `data:image/jpeg;base64,${input.sourceImageBase64}`,
      detail: 'high',
    },
  ];

  const startedAt = Date.now();
  console.info('[toy-analysis] crop_refinement_started', {
    candidateCount: acceptedCandidates.length,
    candidateIds,
    model,
    detail: 'high',
  });
  for (const candidate of acceptedCandidates) {
    diagnostics.set(candidate.candidateId, { attempted: true, succeeded: false, refined: null, sourceBoundaryEdges: [] });
  }

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 1200,
        input: [{
          role: 'developer',
          content: [{
            type: 'input_text',
            text: 'Return only strict JSON geometry. Positive visual evidence is required before expanding beyond the current region.',
          }],
        }, { role: 'user', content }],
        text: {
          format: {
            type: 'json_schema',
            name: 'toy_crop_refinement',
            strict: true,
            schema: cropRefinementSchema(candidateIds),
          },
        },
      }),
    });

    if (!response.ok) {
      console.warn('[toy-analysis] crop_refinement_completed', {
        refinedCount: 0,
        latencyMs: Date.now() - startedAt,
        status: response.status,
      });
      return { regions: new Map(), sourceBoundaryEdges: new Map(), diagnostics };
    }

    const body: unknown = await response.json();
    const outputText = extractOutputText(body);
    const parsed = outputText ? JSON.parse(outputText) : null;
    const validated = validateCropRefinementOutput(parsed, candidateIds);
    if (!validated) {
      console.warn('[toy-analysis] crop_refinement_completed', {
        refinedCount: 0,
        latencyMs: Date.now() - startedAt,
        reason: 'invalid_geometry',
      });
      return { regions: new Map(), sourceBoundaryEdges: new Map(), diagnostics };
    }

    const result = new Map(validated.map((candidate) => [
      candidate.candidateId,
      candidate.refinedBoundingBox,
    ]));
    const sourceBoundaryEdges = new Map(validated.map((candidate) => [
      candidate.candidateId,
      candidate.sourceBoundaryEdges,
    ]));
    for (const candidate of validated) {
      diagnostics.set(candidate.candidateId, {
        attempted: true,
        succeeded: true,
        refined: candidate.refinedBoundingBox,
        sourceBoundaryEdges: candidate.sourceBoundaryEdges,
      });
    }
    console.info('[toy-analysis] crop_refinement_completed', {
      refinedCount: result.size,
      latencyMs: Date.now() - startedAt,
      usage: extractUsage(body),
    });
    return { regions: result, sourceBoundaryEdges, diagnostics };
  } catch (error) {
    console.warn('[toy-analysis] crop_refinement_completed', {
      refinedCount: 0,
      latencyMs: Date.now() - startedAt,
      error: safeError(error),
    });
    return { regions: new Map(), sourceBoundaryEdges: new Map(), diagnostics };
  }
}

function emptyRefinementRun(
  candidates: readonly CandidateModelResult[],
): RefinementRunResult {
  return {
    regions: new Map(),
    sourceBoundaryEdges: new Map(),
    diagnostics: new Map(candidates.map((candidate) => [
      candidate.candidateId,
      { attempted: false, succeeded: false, refined: null, sourceBoundaryEdges: [] },
    ])),
  };
}

function buildCropRefinementDebug(
  acceptedCandidates: readonly CandidateModelResult[],
  originalRegions: ReadonlyMap<string, BoundingBox>,
  primary: RefinementRunResult,
  fallback: RefinementRunResult,
  escalation: readonly {
    candidate: CandidateModelResult;
    shouldEscalate: boolean;
    reason: CropRefinementEscalationReason | null;
    primarySourceBoundarySuspicious: boolean;
    trustedPrimaryEdges: SourceBoundaryEdge[];
  }[],
): CropRefinementDebug[] {
  return acceptedCandidates.map((candidate) => {
    const original = originalRegions.get(candidate.candidateId)!;
    const primaryDiagnostic = primary.diagnostics.get(candidate.candidateId)!;
    const fallbackDiagnostic = fallback.diagnostics.get(candidate.candidateId)!;
    const escalationDecision = escalation.find((item) => item.candidate.candidateId === candidate.candidateId)!;
    return {
      candidateId: candidate.candidateId,
      cropCompleteness: candidate.cropCompleteness!,
      primaryModel: CROP_REFINEMENT_PRIMARY_MODEL,
      primaryAttempted: primaryDiagnostic.attempted,
      primarySucceeded: primaryDiagnostic.succeeded,
      primaryRefinedBoundingBox: primaryDiagnostic.refined,
      primarySourceBoundaryEdges: primaryDiagnostic.sourceBoundaryEdges,
      primarySourceBoundarySuspicious: escalationDecision.primarySourceBoundarySuspicious,
      terraEscalated: escalationDecision.shouldEscalate,
      terraEscalationReason: escalationDecision.reason,
      fallbackModel: CROP_REFINEMENT_FALLBACK_MODEL,
      fallbackAttempted: fallbackDiagnostic.attempted,
      fallbackSucceeded: fallbackDiagnostic.succeeded,
      fallbackRefinedBoundingBox: fallbackDiagnostic.refined,
      fallbackSourceBoundaryEdges: fallbackDiagnostic.sourceBoundaryEdges,
      originalCombinedBoundingBox: original,
      finalBoundingBox: getFinalCandidateRegion(
        original,
        primary.regions.get(candidate.candidateId),
        escalationDecision.trustedPrimaryEdges,
        fallback.regions.get(candidate.candidateId),
        fallback.sourceBoundaryEdges.get(candidate.candidateId),
      ),
    };
  });
}

function extractUsage(value: unknown): { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null } {
  const usage = isRecord(value) && isRecord(value.usage) ? value.usage : null;
  return {
    inputTokens: usage && typeof usage.input_tokens === 'number' ? usage.input_tokens : null,
    outputTokens: usage && typeof usage.output_tokens === 'number' ? usage.output_tokens : null,
    totalTokens: usage && typeof usage.total_tokens === 'number' ? usage.total_tokens : null,
  };
}

async function registerCropImage(
  input: RegisterCropRequest,
  authenticatedUserId: string,
): Promise<Response> {
  if (!isValidCropRegistrationPath(authenticatedUserId, input)) {
    return jsonResponse({ error: 'Crop image path is invalid.' }, 400);
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return jsonResponse({ error: 'Crop registration service is not configured.' }, 500);
  }

  const { data: analysis, error: analysisError } = await supabase
    .from('toy_analyses')
    .select('id')
    .eq('id', input.analysisId)
    .eq('user_id', authenticatedUserId)
    .maybeSingle();

  if (analysisError) {
    console.error('[toy-analysis] crop_registration_failed', {
      stage: 'analysis_ownership',
      error: safeDatabaseError(analysisError),
    });
    return jsonResponse({ error: 'Crop image could not be registered.' }, 500);
  }

  if (!analysis) {
    return jsonResponse({ error: 'Analysis is unavailable.' }, 404);
  }

  const { data: toyItem, error: toyItemError } = await supabase
    .from('toy_analysis_items')
    .select('id')
    .eq('id', input.toyItemId)
    .eq('analysis_id', input.analysisId)
    .maybeSingle();

  if (toyItemError) {
    console.error('[toy-analysis] crop_registration_failed', {
      stage: 'toy_item_ownership',
      error: safeDatabaseError(toyItemError),
    });
    return jsonResponse({ error: 'Crop image could not be registered.' }, 500);
  }

  if (!toyItem) {
    return jsonResponse({ error: 'Toy item is unavailable.' }, 404);
  }

  const folder = `${authenticatedUserId}/${input.analysisId}`;
  const fileName = `${input.toyItemId}.jpg`;
  const { data: objects, error: objectError } = await supabase.storage
    .from(TOY_IMAGE_BUCKET)
    .list(folder, { limit: 10, search: fileName });

  if (objectError) {
    console.error('[toy-analysis] crop_registration_failed', {
      stage: 'object_lookup',
      error: safeDatabaseError(objectError),
    });
    return jsonResponse({ error: 'Crop image could not be registered.' }, 500);
  }

  if (!objects?.some((object: { name: string }) => object.name === fileName)) {
    return jsonResponse({ error: 'Crop image does not exist.' }, 404);
  }

  const { error: updateError } = await supabase
    .from('toy_analysis_items')
    .update({ image_path: input.imagePath })
    .eq('id', input.toyItemId)
    .eq('analysis_id', input.analysisId);

  if (updateError) {
    console.error('[toy-analysis] crop_registration_failed', {
      stage: 'image_path_update',
      error: safeDatabaseError(updateError),
    });
    return jsonResponse({ error: 'Crop image could not be registered.' }, 500);
  }

  console.info('[toy-analysis] crop_registration_completed', {
    analysisId: input.analysisId,
    toyItemId: input.toyItemId,
  });
  return jsonResponse({ registered: true }, 200);
}

function createServerSupabaseClient(): ReturnType<typeof createClient> | null {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Server-side Supabase configuration is missing.', {
      supabaseUrlConfigured: Boolean(supabaseUrl),
      serviceRoleKeyConfigured: Boolean(serviceRoleKey),
    });
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

type PersistenceResult =
  | { ok: true; analysisId: string }
  | { ok: false };

async function persistAnalysis(
  result: ToyAnalysisResult,
  userId: string,
): Promise<PersistenceResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Analysis persistence is missing required Supabase server configuration.', {
      supabaseUrlConfigured: Boolean(supabaseUrl),
      serviceRoleKeyConfigured: Boolean(serviceRoleKey),
    });
    return { ok: false };
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const { data: analysis, error: analysisError } = await supabase
    .from('toy_analyses')
    .insert({
      child_age_months: result.childAgeMonths,
      image_path: null,
      status: 'completed',
      user_id: userId,
    })
    .select('id')
    .single();

  if (analysisError || !analysis?.id) {
    console.error('Failed to persist toy analysis.', safeDatabaseError(analysisError));
    return { ok: false };
  }

  const analysisId = analysis.id as string;

  if (result.toys.length === 0) {
    return { ok: true, analysisId };
  }

  const { error: itemsError } = await supabase.from('toy_analysis_items').insert(
    result.toys.map((toy) => ({
      id: toy.id,
      analysis_id: analysisId,
      name: toy.name,
      category: toy.category,
      recommendation: toy.recommendation,
      reason: toy.reason,
      confidence: toy.confidence,
      play_ideas: toy.playIdeas,
    })),
  );

  if (!itemsError) {
    return { ok: true, analysisId };
  }

  console.error('Failed to persist toy analysis items.', safeDatabaseError(itemsError));

  const { error: cleanupError } = await supabase
    .from('toy_analyses')
    .delete()
    .eq('id', analysisId);

  if (cleanupError) {
    console.error('Failed to clean up incomplete toy analysis.', {
      analysisId,
      error: safeDatabaseError(cleanupError),
    });

    const { error: markFailedError } = await supabase
      .from('toy_analyses')
      .update({ status: 'failed' })
      .eq('id', analysisId);

    if (markFailedError) {
      console.error('Failed to mark incomplete toy analysis as failed.', {
        analysisId,
        error: safeDatabaseError(markFailedError),
      });
    }
  }

  return { ok: false };
}

type AuthenticationResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 500 };

async function authenticateRequest(request: Request): Promise<AuthenticationResult> {
  const authorization = request.headers.get('Authorization')?.trim();

  if (!authorization?.startsWith('Bearer ')) {
    return { ok: false, status: 401 };
  }

  const accessToken = authorization.slice('Bearer '.length).trim();

  if (!accessToken) {
    return { ok: false, status: 401 };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim();

  if (!supabaseUrl || !anonKey) {
    console.error('Authentication is missing required Supabase server configuration.', {
      supabaseUrlConfigured: Boolean(supabaseUrl),
      anonKeyConfigured: Boolean(anonKey),
    });
    return { ok: false, status: 500 };
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const { data, error } = await authClient.auth.getUser(accessToken);

  if (error || !data.user?.id) {
    console.warn('Toy analysis request authentication failed.', {
      error: error ? safeDatabaseError(error) : undefined,
    });
    return { ok: false, status: 401 };
  }

  return { ok: true, userId: data.user.id };
}

type RequestValidation =
  | {
      ok: true;
      value: AnalyzeToyShelfRequest | AnalyzeDetectedCandidatesRequest | RegisterCropRequest;
    }
  | { ok: false; error: string };

function validateRequest(value: unknown): RequestValidation {
  if (!isRecord(value)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  if ('user_id' in value || 'userId' in value) {
    return { ok: false, error: 'User ownership is derived from authentication.' };
  }

  if (value.mode === 'register-crop') {
    return validateRegisterCropRequest(value);
  }

  if (value.mode === 'detected-candidates') {
    return validateDetectedCandidatesRequest(value);
  }

  if (typeof value.imageBase64 !== 'string' || value.imageBase64.trim() === '') {
    return { ok: false, error: 'imageBase64 is required.' };
  }

  if (!isSupportedMimeType(value.mimeType)) {
    return { ok: false, error: 'mimeType must be image/jpeg, image/png, or image/webp.' };
  }

  if (!Number.isInteger(value.childAgeMonths) || Number(value.childAgeMonths) <= 0) {
    return { ok: false, error: 'childAgeMonths must be a positive integer.' };
  }

  if (
    !Number.isInteger(value.imageWidth) ||
    Number(value.imageWidth) <= 0 ||
    !Number.isInteger(value.imageHeight) ||
    Number(value.imageHeight) <= 0
  ) {
    return { ok: false, error: 'imageWidth and imageHeight must be positive integers.' };
  }

  return {
    ok: true,
    value: {
      imageBase64: value.imageBase64.trim(),
      mimeType: value.mimeType,
      childAgeMonths: Number(value.childAgeMonths),
      imageWidth: Number(value.imageWidth),
      imageHeight: Number(value.imageHeight),
    },
  };
}

function validateRegisterCropRequest(value: Record<string, unknown>): RequestValidation {
  const analysisId = readNonblankString(value.analysisId);
  const toyItemId = readNonblankString(value.toyItemId);
  const imagePath = readNonblankString(value.imagePath);

  if (!analysisId || !toyItemId || !imagePath) {
    return { ok: false, error: 'analysisId, toyItemId, and imagePath are required.' };
  }

  return {
    ok: true,
    value: {
      mode: 'register-crop',
      analysisId,
      toyItemId,
      imagePath,
    },
  };
}

function validateDetectedCandidatesRequest(
  value: Record<string, unknown>,
): RequestValidation {
  if (!Number.isInteger(value.childAgeMonths) || Number(value.childAgeMonths) <= 0) {
    return { ok: false, error: 'childAgeMonths must be a positive integer.' };
  }

  const sourceImageBase64 = typeof value.sourceImageBase64 === 'string'
    ? value.sourceImageBase64.trim()
    : '';
  if (!sourceImageBase64) {
    return { ok: false, error: 'sourceImageBase64 is required.' };
  }

  if (
    !Array.isArray(value.candidateImages) ||
    value.candidateImages.length === 0 ||
    value.candidateImages.length > MAX_TOY_ITEMS
  ) {
    return { ok: false, error: `candidateImages must contain 1 to ${MAX_TOY_ITEMS} items.` };
  }

  const ids = new Set<string>();
  const candidateImages: CandidateSemanticImage[] = [];
  for (const candidate of value.candidateImages) {
    if (!isRecord(candidate)) {
      return { ok: false, error: 'Each candidate image must be an object.' };
    }
    const candidateId = typeof candidate.candidateId === 'string'
      ? candidate.candidateId.trim()
      : '';
    const imageBase64 = typeof candidate.imageBase64 === 'string'
      ? candidate.imageBase64.trim()
      : '';
    const boundingBox = parseNormalizedBoundingBox(candidate.boundingBox);
    if (
      !candidateId ||
      ids.has(candidateId) ||
      !imageBase64 ||
      candidate.mimeType !== 'image/jpeg' ||
      !boundingBox
    ) {
      return { ok: false, error: 'Candidate IDs and JPEG images must be valid and unique.' };
    }
    ids.add(candidateId);
    candidateImages.push({ candidateId, imageBase64, mimeType: 'image/jpeg', boundingBox });
  }

  return {
    ok: true,
    value: {
      mode: 'detected-candidates',
      childAgeMonths: Number(value.childAgeMonths),
      sourceImageBase64,
      includeDebug: value.includeDebug === true,
      candidateImages,
    },
  };
}

function parseNormalizedBoundingBox(value: unknown): BoundingBox | null {
  if (!isRecord(value)) {
    return null;
  }

  const { x, y, width, height } = value;
  if (
    typeof x !== 'number' || !Number.isFinite(x) ||
    typeof y !== 'number' || !Number.isFinite(y) ||
    typeof width !== 'number' || !Number.isFinite(width) ||
    typeof height !== 'number' || !Number.isFinite(height) ||
    x < 0 || y < 0 || width <= 0 || height <= 0 ||
    x + width > 1 || y + height > 1
  ) {
    return null;
  }

  return { x, y, width, height };
}

function isSupportedMimeType(value: unknown): value is SupportedMimeType {
  return typeof value === 'string' && supportedMimeTypes.has(value as SupportedMimeType);
}

function validateModelOutput(
  value: unknown,
): { ok: true; toys: ModelToy[] } | { ok: false } {
  if (!isRecord(value) || !Array.isArray(value.toys)) {
    return { ok: false };
  }

  if (value.toys.length > MAX_TOY_ITEMS) {
    return { ok: false };
  }

  const toys: ModelToy[] = [];

  for (const toy of value.toys) {
    if (!isRecord(toy)) {
      return { ok: false };
    }

    const name = typeof toy.name === 'string' ? toy.name.trim() : '';
    const reason = typeof toy.reason === 'string' ? toy.reason.trim() : '';
    const category = toy.category === null
      ? null
      : typeof toy.category === 'string' && toy.category.trim()
        ? toy.category.trim()
        : undefined;
    const confidence = toy.confidence;
    const recommendation = toy.recommendation;

    if (
      !name ||
      !reason ||
      category === undefined ||
      !isRecommendation(recommendation) ||
      !(
        confidence === null ||
        (typeof confidence === 'number' &&
          Number.isFinite(confidence) &&
          confidence >= 0 &&
          confidence <= 1)
      )
    ) {
      return { ok: false };
    }

    const playIdeas = validatePlayIdeas(toy.playIdeas, recommendation);

    if (!playIdeas) {
      return { ok: false };
    }

    toys.push({
      name,
      category,
      recommendation,
      reason,
      confidence,
      playIdeas,
    });
  }

  return { ok: true, toys };
}

function validatePlayIdeas(
  value: unknown,
  recommendation: Recommendation,
): PlayIdea[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  if (
    (recommendation === 'KEEP' && (value.length < 2 || value.length > 3)) ||
    (recommendation !== 'KEEP' && value.length !== 0)
  ) {
    return null;
  }

  const playIdeas: PlayIdea[] = [];

  for (const idea of value) {
    if (!isRecord(idea)) {
      return null;
    }

    const keys = Object.keys(idea);
    const title = typeof idea.title === 'string' ? idea.title.trim() : '';
    const description =
      typeof idea.description === 'string' ? idea.description.trim() : '';

    if (
      keys.length !== 2 ||
      !keys.includes('title') ||
      !keys.includes('description') ||
      !title ||
      !description
    ) {
      return null;
    }

    playIdeas.push({ title, description });
  }

  return playIdeas;
}

function isRecommendation(value: unknown): value is Recommendation {
  return value === 'KEEP' || value === 'ROTATE' || value === 'PASS_ON';
}

function extractOutputText(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.output)) {
    return null;
  }

  for (const item of value.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonblankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function safeError(error: unknown): { name: string; message: string } {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: 'UnknownError', message: 'Unknown network error' };
}

function safeDatabaseError(error: unknown): {
  name: string;
  message: string;
  code?: string;
} {
  if (!isRecord(error)) {
    return { name: 'UnknownDatabaseError', message: 'Unknown database error' };
  }

  return {
    name: typeof error.name === 'string' ? error.name : 'DatabaseError',
    message: typeof error.message === 'string' ? error.message : 'Database request failed',
    code: typeof error.code === 'string' ? error.code : undefined,
  };
}

function jsonResponse(
  body: unknown,
  status: number,
  additionalHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      ...additionalHeaders,
      'Content-Type': 'application/json',
    },
  });
}
