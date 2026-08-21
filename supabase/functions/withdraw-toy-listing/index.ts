// @ts-ignore Deno resolves npm: specifiers when bundled.
import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
// @ts-ignore Deno requires explicit TypeScript extensions.
import { buildWithdrawalUpdate, classifyWithdrawableListing, parseBearerAccessToken, serializeWithdrawalResponse, validateWithdrawToyListingRequest } from './withdrawal.ts';

type DenoRuntime = { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Response | Promise<Response>): void };
declare const Deno: DenoRuntime;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405, { Allow: 'POST, OPTIONS' });

  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: { code: 'INVALID_REQUEST' } }, 400); }
  const input = validateWithdrawToyListingRequest(body);
  if (!input.ok) return json({ error: { code: 'INVALID_REQUEST' } }, 400);

  const authentication = await authenticate(request);
  if (!authentication.ok) return json({ error: { code: authentication.status === 401 ? 'UNAUTHENTICATED' : 'WITHDRAWAL_FAILED' } }, authentication.status);

  const { data: current, error: lookupError } = await authentication.client
    .from('toy_exchange_listings').select('id, status').eq('id', input.value.listingId).maybeSingle();
  if (lookupError) {
    console.error('withdraw-toy-listing lookup failed.', { errorCode: readErrorCode(lookupError) });
    return json({ error: { code: 'WITHDRAWAL_FAILED' } }, 500);
  }
  const classification = classifyWithdrawableListing(current);
  if (!classification.ok) {
    return json({ error: { code: classification.reason } }, classification.reason === 'LISTING_NOT_FOUND' ? 404 : 409);
  }

  const { data: updated, error: updateError } = await authentication.client
    .from('toy_exchange_listings')
    .update(buildWithdrawalUpdate())
    .eq('id', classification.id)
    .eq('status', 'AVAILABLE')
    .select('id, status, withdrawn_at')
    .maybeSingle();
  if (updateError) {
    console.error('withdraw-toy-listing update failed.', { errorCode: readErrorCode(updateError) });
    return json({ error: { code: 'WITHDRAWAL_FAILED' } }, 500);
  }
  if (updated === null) return json({ error: { code: 'NOT_AVAILABLE' } }, 409);
  const response = serializeWithdrawalResponse(updated);
  if (!response) return json({ error: { code: 'WITHDRAWAL_FAILED' } }, 500);
  return json(response, 200);
});

type Client = ReturnType<typeof createClient>;
async function authenticate(request: Request): Promise<{ ok: true; client: Client } | { ok: false; status: 401 | 500 }> {
  const token = parseBearerAccessToken(request.headers.get('Authorization'));
  if (!token) return { ok: false, status: 401 };
  const url = Deno.env.get('SUPABASE_URL')?.trim();
  const key = Deno.env.get('SUPABASE_ANON_KEY')?.trim();
  if (!url || !key) return { ok: false, status: 500 };
  const client = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  return error || !data.user?.id ? { ok: false, status: 401 } : { ok: true, client };
}
function readErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}
function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, ...headers, 'Content-Type': 'application/json' } });
}
