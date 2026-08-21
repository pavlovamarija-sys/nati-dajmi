// @ts-ignore Deno resolves npm specifiers when bundled.
import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
// @ts-ignore Deno requires explicit TypeScript extensions.
import { MARKETPLACE_IMAGE_URL_LIFETIME_SECONDS, MARKETPLACE_LISTING_LIMIT, MARKETPLACE_ORDER_ASCENDING, MARKETPLACE_ORDER_COLUMN, parseBearerAccessToken, parseVisibleMarketplaceListing, serializeMarketplaceListing, validateBrowseToyListingsRequest } from './marketplace.ts';

type DenoRuntime = { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Response | Promise<Response>): void };
declare const Deno: DenoRuntime;
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const SELECT = 'id, owner_user_id, name, category, description, condition, image_path, asking_value_stars, status, published_at';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: { code: 'INVALID_REQUEST' } }, 400); }
  if (!validateBrowseToyListingsRequest(body)) return json({ error: { code: 'INVALID_REQUEST' } }, 400);

  const authentication = await authenticate(request);
  if (!authentication.ok) return json({ error: { code: authentication.status === 401 ? 'UNAUTHENTICATED' : 'UNAVAILABLE' } }, authentication.status);
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  if (!serviceRoleKey || !supabaseUrl) return json({ error: { code: 'UNAVAILABLE' } }, 500);
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin.from('toy_exchange_listings').select(SELECT)
    .eq('status', 'AVAILABLE').neq('owner_user_id', authentication.userId)
    .order(MARKETPLACE_ORDER_COLUMN, { ascending: MARKETPLACE_ORDER_ASCENDING }).limit(MARKETPLACE_LISTING_LIMIT);
  if (error || !Array.isArray(data)) {
    console.error('browse-toy-listings query failed.', { errorCode: readErrorCode(error) });
    return json({ error: { code: 'UNAVAILABLE' } }, 500);
  }

  const sources = data.map((row) => parseVisibleMarketplaceListing(row, authentication.userId));
  if (sources.some((source) => source === null)) return json({ error: { code: 'UNAVAILABLE' } }, 500);
  const listings = await Promise.all(sources.map(async (source) => {
    if (!source) return null;
    const { data: signed, error: signError } = await admin.storage.from('toy-shelf-images').createSignedUrl(source.imagePath, MARKETPLACE_IMAGE_URL_LIFETIME_SECONDS);
    if (signError) console.warn('browse-toy-listings image signing failed.', { listingId: source.id, errorCode: readErrorCode(signError) });
    return serializeMarketplaceListing(source, signError ? null : signed?.signedUrl ?? null);
  }));
  if (listings.some((listing) => listing === null)) return json({ error: { code: 'UNAVAILABLE' } }, 500);
  return json({ listings }, 200);
});

type Client = ReturnType<typeof createClient>;
async function authenticate(request: Request): Promise<{ ok: true; userId: string } | { ok: false; status: 401 | 500 }> {
  const token = parseBearerAccessToken(request.headers.get('Authorization'));
  const url = Deno.env.get('SUPABASE_URL')?.trim();
  const key = Deno.env.get('SUPABASE_ANON_KEY')?.trim();
  if (!token) return { ok: false, status: 401 };
  if (!url || !key) return { ok: false, status: 500 };
  const client: Client = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  return error || !data.user?.id ? { ok: false, status: 401 } : { ok: true, userId: data.user.id };
}
function readErrorCode(error: unknown): string | undefined { return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : undefined; }
function json(body: unknown, status: number): Response { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
