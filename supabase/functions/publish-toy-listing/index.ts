// @ts-ignore Deno resolves npm: specifiers when the Edge Function is bundled.
import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { buildAuthoritativeListingInsert, classifyListingInsertError, parseBearerAccessToken, validatePublishToyListingRequest } from './publication.ts';

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

const SOURCE_SELECT = `
  id,
  name,
  category,
  recommendation,
  image_path,
  crop_expected,
  toy_analyses!inner ( user_id ),
  toy_analysis_item_valuations (
    id,
    toy_analysis_item_id,
    estimated_value_denars,
    confidence,
    valuation_method,
    valuation_version,
    created_at,
    updated_at,
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
    condition_adjustment_basis_points
  )
`;

const LISTING_RESPONSE_SELECT = `
  id,
  source_toy_analysis_item_id,
  name,
  category,
  description,
  condition,
  asking_value_stars,
  status,
  published_at
`;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405, {
      Allow: 'POST, OPTIONS',
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: { code: 'INVALID_REQUEST' } }, 400);
  }

  const input = validatePublishToyListingRequest(body);
  if (!input.ok) {
    return jsonResponse({ error: { code: 'INVALID_REQUEST' } }, 400);
  }

  const authentication = await authenticateRequest(request);
  if (!authentication.ok) {
    return jsonResponse(
      { error: { code: authentication.status === 401 ? 'UNAUTHENTICATED' : 'UNAVAILABLE' } },
      authentication.status,
    );
  }

  const { data: sourceData, error: sourceError } = await authentication.client
    .from('toy_analysis_items')
    .select(SOURCE_SELECT)
    .eq('id', input.value.toyAnalysisItemId)
    .maybeSingle();

  if (sourceError) {
    console.error('publish-toy-listing source lookup failed.', {
      errorCode: readErrorCode(sourceError),
    });
    return jsonResponse({ error: { code: 'UNAVAILABLE' } }, 500);
  }
  if (sourceData === null) {
    return jsonResponse({ error: { code: 'SOURCE_NOT_FOUND' } }, 404);
  }

  const ownerUserId = readAnalysisOwnerId(sourceData.toy_analyses);
  const source = ownerUserId
    ? { ...sourceData, owner_user_id: ownerUserId }
    : sourceData;
  const snapshot = buildAuthoritativeListingInsert(
    input.value,
    authentication.userId,
    source,
  );

  if (!snapshot.ok) {
    const status = snapshot.reason === 'SOURCE_NOT_OWNED' ? 404 : 409;
    return jsonResponse({ error: { code: snapshot.reason } }, status);
  }

  const { data: listing, error: insertError } = await authentication.client
    .from('toy_exchange_listings')
    .insert(snapshot.insert)
    .select(LISTING_RESPONSE_SELECT)
    .single();

  if (insertError) {
    const errorCode = readErrorCode(insertError);
    if (classifyListingInsertError(insertError) === 'ACTIVE_LISTING_EXISTS') {
      return jsonResponse({ error: { code: 'ACTIVE_LISTING_EXISTS' } }, 409);
    }
    console.error('publish-toy-listing insert failed.', { errorCode });
    return jsonResponse({ error: { code: 'PUBLICATION_FAILED' } }, 409);
  }

  const response = serializeListingResponse(listing);
  if (!response) {
    console.error('publish-toy-listing returned a malformed listing row.');
    return jsonResponse({ error: { code: 'UNAVAILABLE' } }, 500);
  }

  return jsonResponse({ listing: response }, 201);
});

type UserSupabaseClient = ReturnType<typeof createClient>;
type AuthenticationResult =
  | { ok: true; client: UserSupabaseClient; userId: string }
  | { ok: false; status: 401 | 500 };

async function authenticateRequest(request: Request): Promise<AuthenticationResult> {
  const accessToken = parseBearerAccessToken(request.headers.get('Authorization'));
  if (!accessToken) {
    return { ok: false, status: 401 };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim();
  if (!supabaseUrl || !anonKey) {
    console.error('publish-toy-listing authentication configuration is missing.', {
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
    console.warn('publish-toy-listing authentication failed.', {
      errorCode: readErrorCode(error),
    });
    return { ok: false, status: 401 };
  }
  return { ok: true, client, userId: data.user.id };
}

function readAnalysisOwnerId(value: unknown): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (typeof row !== 'object' || row === null || Array.isArray(row)) {
    return null;
  }
  const userId = 'user_id' in row ? row.user_id : null;
  return typeof userId === 'string' && userId.trim() ? userId.trim() : null;
}

function serializeListingResponse(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== 'string' || !row.id.trim() ||
    typeof row.source_toy_analysis_item_id !== 'string' ||
    typeof row.name !== 'string' || !row.name.trim() ||
    !(row.category === null || typeof row.category === 'string') ||
    !(row.description === null || typeof row.description === 'string') ||
    !['EXCELLENT', 'GOOD', 'FAIR', 'POOR'].includes(String(row.condition)) ||
    !Number.isSafeInteger(row.asking_value_stars) ||
    row.status !== 'AVAILABLE' ||
    typeof row.published_at !== 'string' ||
    Number.isNaN(Date.parse(row.published_at))
  ) {
    return null;
  }
  return {
    id: row.id,
    sourceToyAnalysisItemId: row.source_toy_analysis_item_id,
    name: row.name,
    category: row.category,
    description: row.description,
    condition: row.condition,
    askingValueStars: row.asking_value_stars,
    status: row.status,
    publishedAt: row.published_at,
  };
}

function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  return typeof error.code === 'string' ? error.code : undefined;
}

function jsonResponse(body: unknown, status: number, additionalHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...additionalHeaders, 'Content-Type': 'application/json' },
  });
}
