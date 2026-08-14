/** 
 * Motion Edit Academy — Gemini API Proxy
 * Cloudflare Worker
 *
 * Routes:
 *   GET  /models
 *   POST /models/{model}:generateContent
 *
 * The member's Gemini API key is supplied per request in
 * x-goog-api-key and is NOT stored by this Worker.
 */

const GEMINI_ORIGIN = "https://generativelanguage.googleapis.com/v1beta";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-goog-api-key",
  "Access-Control-Max-Age": "86400",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function isAllowedPath(pathname) {
  return /^\/models(?:\/[^/]+:generateContent)?$/.test(pathname);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (!["GET", "POST"].includes(request.method)) {
      return json({ error: { message: "Method not allowed" } }, 405);
    }

    const apiKey = env.GEMINI_API_KEY;

if (!apiKey) {
  return json({ error: { message: "GEMINI_API_KEY belum dipasang di Cloudflare" } }, 500);
}

    const incoming = new URL(request.url);
    if (!isAllowedPath(incoming.pathname)) {
      return json({
        error: {
          message: "Only /models and /models/{model}:generateContent are allowed"
        }
      }, 404);
    }

    const target = GEMINI_ORIGIN + incoming.pathname + incoming.search;

    const headers = new Headers();
    headers.set(
      "Content-Type",
      request.headers.get("Content-Type") || "application/json"
    );
    headers.set("x-goog-api-key", apiKey);

    try {
      const upstream = await fetch(target, {
        method: request.method,
        headers,
        body: request.method === "POST" ? await request.arrayBuffer() : undefined,
      });

      const responseHeaders = new Headers(CORS);
      responseHeaders.set(
        "Content-Type",
        upstream.headers.get("Content-Type") ||
          "application/json; charset=utf-8"
      );

      return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    } catch (error) {
      return json({
        error: {
          message: "Proxy gagal menghubungi Gemini",
          detail: String(error?.message || error),
        },
      }, 502);
    }
  },
};
