// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { validateValueToyRequest } from './validation.ts';
// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { buildOpenAIValuationRequest, extractStructuredOutputText, OPENAI_RESPONSES_URL, parseModelValuation, VALUATION_METHOD, VALUATION_VERSION } from './openai-valuation.ts';

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
        buildOpenAIValuationRequest(input.value.name, input.value.category),
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

  return jsonResponse({
    ...valuation,
    metadata: {
      valuationMethod: VALUATION_METHOD,
      valuationVersion: VALUATION_VERSION,
    },
  }, 200);
});

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
