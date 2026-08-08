import { corsHeaders } from './http.ts';

const response = (body: unknown, status: number, headers: Record<string, string>) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders,
    'content-type': 'application/json',
    ...headers,
  },
});

export const trustAssuranceCommandResponse = (body: unknown, status = 200) => response(body, status, {
  'cache-control': 'no-store',
});

export const trustAssuranceQueryResponse = (body: unknown, status = 200) => response(body, status, {
  'cache-control': 'private, no-store',
  vary: 'authorization',
});
