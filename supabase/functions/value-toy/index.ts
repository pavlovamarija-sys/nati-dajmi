// @ts-ignore Deno resolves npm: specifiers when the Edge Function is bundled.
import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { isExpectedAuthoritativeToyImagePath, TOY_IMAGE_BUCKET, validateAuthoritativeToyImage, type AuthoritativeToyImageResult } from './authoritative-toy-image.ts';
// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { parseAuthoritativeToy, type AuthoritativeToy } from './authoritative-toy.ts';
// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { validateValueToyRequest } from './validation.ts';
// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { buildOpenAIValuationRequest, extractStructuredOutputText, finalizeToyValuation, OPENAI_RESPONSES_URL, parseModelValuation } from './openai-valuation.ts';

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

  const input = validateValueToyRequest(requestBody);

  if (!input.ok) {
    return jsonResponse({ error: input.error }, 400);
  }

  const authentication = await authenticateRequest(request);

  if (!authentication.ok) {
    return jsonResponse(
      { error: authentication.status === 401 ? 'Authentication required.' : 'Valuation service is unavailable.' },
      authentication.status,
    );
  }

  const lookup = await loadAuthoritativeToy(
    authentication.client,
    input.value.toyAnalysisItemId,
  );

  if (!lookup.ok) {
    return jsonResponse(
      { error: lookup.status === 404 ? 'Toy is unavailable.' : 'Valuation service is unavailable.' },
      lookup.status,
    );
  }

  const imageResult = await loadAuthoritativeToyImage(
    authentication.client,
    authentication.userId,
    lookup.toy,
  );
  if (!imageResult.available) {
    console.warn('value-toy authoritative image is unavailable.', {
      reason: imageResult.reason,
    });
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY')?.trim();

  if (!apiKey) {
    console.error('value-toy is missing its OPENAI_API_KEY secret.');
    return jsonResponse({ error: 'Valuation service is not configured.' }, 500);
  }

  let openAIResponse: Response;

  try {
    openAIResponse = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        buildOpenAIValuationRequest(
          lookup.toy.name,
          lookup.toy.category,
          imageResult.available ? imageResult.image : undefined,
        ),
      ),
    });
  } catch (error) {
    console.error('OpenAI valuation request failed before receiving a response.', safeError(error));
    return jsonResponse({ error: 'Valuation provider is unavailable.' }, 502);
  }

  if (!openAIResponse.ok) {
    console.error('OpenAI valuation request returned an error.', {
      status: openAIResponse.status,
      requestId: openAIResponse.headers.get('x-request-id'),
    });
    return jsonResponse({ error: 'Valuation provider request failed.' }, 502);
  }

  let openAIResponseBody: unknown;

  try {
    openAIResponseBody = await openAIResponse.json();
  } catch {
    console.error('OpenAI valuation response was not JSON.');
    return jsonResponse({ error: 'Valuation provider returned an invalid response.' }, 502);
  }

  const outputText = extractStructuredOutputText(openAIResponseBody);

  if (!outputText) {
    console.error('OpenAI valuation response contained no structured output text.');
    return jsonResponse({ error: 'Valuation provider returned an invalid response.' }, 502);
  }

  let modelOutput: unknown;

  try {
    modelOutput = JSON.parse(outputText);
  } catch {
    console.error('OpenAI valuation structured output was malformed JSON.');
    return jsonResponse({ error: 'Valuation provider returned malformed data.' }, 502);
  }

  const valuation = parseModelValuation(modelOutput);

  if (!valuation) {
    console.error('OpenAI valuation structured output failed server validation.');
    return jsonResponse({ error: 'Valuation provider returned malformed data.' }, 502);
  }

  return jsonResponse(finalizeToyValuation(valuation, imageResult.available), 200);
});

type UserSupabaseClient = ReturnType<typeof createClient>;

type AuthenticationResult =
  | { ok: true; client: UserSupabaseClient; userId: string }
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
    console.error('value-toy authentication configuration is missing.', {
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
    console.warn('value-toy request authentication failed.', {
      errorCode: readErrorCode(error),
    });
    return { ok: false, status: 401 };
  }

  return { ok: true, client, userId: data.user.id };
}

type ToyLookupResult =
  | { ok: true; toy: AuthoritativeToy }
  | { ok: false; status: 404 | 500 };

async function loadAuthoritativeToy(
  client: UserSupabaseClient,
  toyAnalysisItemId: string,
): Promise<ToyLookupResult> {
  const { data, error } = await client
    .from('toy_analysis_items')
    .select('id, analysis_id, name, category, image_path')
    .eq('id', toyAnalysisItemId)
    .maybeSingle();

  if (error) {
    console.error('value-toy authoritative item lookup failed.', {
      errorCode: readErrorCode(error),
    });
    return { ok: false, status: 500 };
  }

  if (data === null) {
    return { ok: false, status: 404 };
  }

  const toy = parseAuthoritativeToy(data);
  if (!toy) {
    console.error('value-toy authoritative item row was malformed.');
    return { ok: false, status: 500 };
  }

  return { ok: true, toy };
}

async function loadAuthoritativeToyImage(
  client: UserSupabaseClient,
  userId: string,
  toy: AuthoritativeToy,
): Promise<AuthoritativeToyImageResult> {
  if (toy.imagePath === null) {
    return { available: false, reason: 'missing-path' };
  }

  if (!isExpectedAuthoritativeToyImagePath(
    toy.imagePath,
    userId,
    toy.analysisId,
    toy.toyAnalysisItemId,
  )) {
    return { available: false, reason: 'invalid-payload' };
  }

  let downloaded: Blob;
  try {
    const { data, error } = await client.storage
      .from(TOY_IMAGE_BUCKET)
      .download(toy.imagePath);

    if (error || !data) {
      return { available: false, reason: 'download-failed' };
    }
    downloaded = data;
  } catch {
    return { available: false, reason: 'download-failed' };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await downloaded.arrayBuffer());
  } catch {
    return { available: false, reason: 'invalid-payload' };
  }

  const image = validateAuthoritativeToyImage(downloaded.type, bytes);
  return image
    ? { available: true, image }
    : { available: false, reason: 'invalid-payload' };
}

function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }

  return typeof error.code === 'string' ? error.code : undefined;
}

function safeError(error: unknown): { name: string; message: string } {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: 'UnknownError', message: 'Unknown network error' };
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
