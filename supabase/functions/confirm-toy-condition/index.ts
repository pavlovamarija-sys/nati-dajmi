// @ts-ignore Deno resolves npm: specifiers when the Edge Function is bundled.
import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { buildToyConditionConfirmationUpdate, classifyPersistedValuationRow, serializePersistedV2Valuation, type PersistedV2ToyValuation } from './confirmation.ts';
// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { validateConfirmToyConditionRequest } from './validation.ts';

type DenoRuntime = {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

declare const Deno: DenoRuntime;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const VALUATION_SELECT = `
  id,
  toy_analysis_item_id,
  base_second_hand_value_denars,
  base_value_confidence,
  ai_condition,
  ai_condition_confidence,
  ai_condition_notes,
  confirmed_condition,
  condition_confirmation_type,
  condition_confirmed_at,
  parent_reported_issues,
  parent_condition_note,
  condition_adjustment_basis_points,
  estimated_value_denars,
  confidence,
  valuation_method,
  valuation_version,
  created_at,
  updated_at
`;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, {
      Allow: 'POST, OPTIONS',
    });
  }

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return jsonResponse({ error: 'Request body must be valid JSON.' }, 400);
  }

  const input = validateConfirmToyConditionRequest(requestBody);
  if (!input.ok) {
    return jsonResponse({ error: input.error }, 400);
  }

  const authentication = await authenticateRequest(request);
  if (!authentication.ok) {
    return jsonResponse(
      {
        error: authentication.status === 401
          ? 'Authentication required.'
          : 'Condition confirmation is unavailable.',
      },
      authentication.status,
    );
  }

  const lookup = await loadPersistedValuation(
    authentication.client,
    input.value.toyAnalysisItemId,
  );
  if (!lookup.ok) {
    const message = lookup.status === 404
      ? 'Toy valuation is unavailable.'
      : lookup.status === 409
      ? 'This valuation must be refreshed before its condition can be confirmed.'
      : 'Condition confirmation is unavailable.';
    return jsonResponse({ error: message }, lookup.status);
  }

  const update = buildToyConditionConfirmationUpdate(
    lookup.valuation,
    input.value,
    new Date().toISOString(),
  );
  const persisted = await persistConfirmation(
    authentication.client,
    input.value.toyAnalysisItemId,
    update,
  );

  if (!persisted.ok) {
    return jsonResponse(
      { error: persisted.status === 404 ? 'Toy valuation is unavailable.' : 'Condition confirmation is unavailable.' },
      persisted.status,
    );
  }

  return jsonResponse(serializePersistedV2Valuation(persisted.valuation), 200);
});

type UserSupabaseClient = ReturnType<typeof createClient>;

type AuthenticationResult =
  | { ok: true; client: UserSupabaseClient }
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
    console.error('confirm-toy-condition authentication configuration is missing.', {
      supabaseUrlConfigured: Boolean(supabaseUrl),
      anonKeyConfigured: Boolean(anonKey),
    });
    return { ok: false, status: 500 };
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user?.id) {
    console.warn('confirm-toy-condition request authentication failed.', {
      errorCode: readErrorCode(error),
    });
    return { ok: false, status: 401 };
  }

  return { ok: true, client };
}

type ValuationLookupResult =
  | { ok: true; valuation: PersistedV2ToyValuation }
  | { ok: false; status: 404 | 409 | 500 };

async function loadPersistedValuation(
  client: UserSupabaseClient,
  toyAnalysisItemId: string,
): Promise<ValuationLookupResult> {
  const { data, error } = await client
    .from('toy_analysis_item_valuations')
    .select(VALUATION_SELECT)
    .eq('toy_analysis_item_id', toyAnalysisItemId)
    .maybeSingle();

  if (error) {
    console.error('confirm-toy-condition valuation lookup failed.', {
      errorCode: readErrorCode(error),
    });
    return { ok: false, status: 500 };
  }

  if (data === null) {
    return { ok: false, status: 404 };
  }

  const classification = classifyPersistedValuationRow(data);
  if (classification.generation === 'v1') {
    return { ok: false, status: 409 };
  }

  if (classification.generation === 'invalid') {
    console.error('confirm-toy-condition persisted valuation was malformed.');
    return { ok: false, status: 500 };
  }

  return { ok: true, valuation: classification.valuation };
}

type PersistConfirmationResult =
  | { ok: true; valuation: PersistedV2ToyValuation }
  | { ok: false; status: 404 | 500 };

async function persistConfirmation(
  client: UserSupabaseClient,
  toyAnalysisItemId: string,
  update: ReturnType<typeof buildToyConditionConfirmationUpdate>,
): Promise<PersistConfirmationResult> {
  const { data, error } = await client
    .from('toy_analysis_item_valuations')
    .update({
      confirmed_condition: update.confirmedCondition,
      condition_confirmation_type: update.conditionConfirmationType,
      condition_confirmed_at: update.conditionConfirmedAt,
      parent_reported_issues: update.parentReportedIssues,
      parent_condition_note: update.parentConditionNote,
      condition_adjustment_basis_points: update.conditionAdjustmentBasisPoints,
      estimated_value_denars: update.estimatedValueDenars,
      confidence: update.confidence,
    })
    .eq('toy_analysis_item_id', toyAnalysisItemId)
    .select(VALUATION_SELECT)
    .maybeSingle();

  if (error) {
    console.error('confirm-toy-condition valuation update failed.', {
      errorCode: readErrorCode(error),
    });
    return { ok: false, status: 500 };
  }

  if (data === null) {
    return { ok: false, status: 404 };
  }

  const classification = classifyPersistedValuationRow(data);
  if (classification.generation !== 'v2') {
    console.error('confirm-toy-condition updated valuation was malformed.');
    return { ok: false, status: 500 };
  }

  return { ok: true, valuation: classification.valuation };
}

function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }

  return typeof error.code === 'string' ? error.code : undefined;
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
