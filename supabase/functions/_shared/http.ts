export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

export const handleOptions = (request: Request) =>
  request.method === 'OPTIONS' ? new Response('ok', { headers: corsHeaders }) : null;

export const safeErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/g, 'Bearer [redacted]')
    .replace(/key=[A-Za-z0-9._~+/-]+/g, 'key=[redacted]')
    .slice(0, 600);
};
