export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
}

export function html(body: string, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(body, { ...init, headers });
}

export function text(body: string, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "text/plain; charset=utf-8");
  return new Response(body, { ...init, headers });
}

export function withCors(resp: Response, request: Request) {
  const origin = request.headers.get("Origin");
  if (!origin) return resp;
  const headers = new Headers(resp.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
}

