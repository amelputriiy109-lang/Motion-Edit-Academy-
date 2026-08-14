/**
 * Motion Edit Academy — Gemini API Proxy + Online Leaderboard
 * Cloudflare Pages Advanced Mode Worker
 *
 * Required binding in Cloudflare:
 *   KV Namespace binding name: LEADERBOARD
 *
 * API:
 *   GET  /api/leaderboard
 *   POST /api/member   { id, name }
 *   POST /api/xp       { id, delta }
 */
const GEMINI_ORIGIN = "https://generativelanguage.googleapis.com/v1beta";
const MEMBERS_KEY = "members:index:v1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function isGeminiPath(pathname) {
  return /^\/models(?:\/[^/]+:generateContent)?$/.test(pathname);
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 30);
}

function validId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(value);
}

function cleanAvatar(value) {
  if (!value || typeof value !== "string") return "";
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) return "";
  return value.slice(0, 120000);
}

function dateKey(offsetDays = 0) {
  const d = new Date(Date.now() - offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

function getKV(env) {
  return env.LEADERBOARD || env.MEA_LEADERBOARD || null;
}

async function readMembers(env) {
  const kv = getKV(env);
  if (!kv) throw new Error("KV binding belum dipasang. Gunakan variable LEADERBOARD atau MEA_LEADERBOARD.");
  return (await kv.get(MEMBERS_KEY, "json")) || [];
}

async function saveMembers(env, members) {
  const kv = getKV(env);
  if (!kv) throw new Error("KV binding belum dipasang. Gunakan variable LEADERBOARD atau MEA_LEADERBOARD.");
  await kv.put(MEMBERS_KEY, JSON.stringify(members));
}

async function leaderboard(env, period = 'all') {
  const kv = getKV(env);
  if (!kv) throw new Error("KV binding belum dipasang. Gunakan variable LEADERBOARD atau MEA_LEADERBOARD.");
  const ids = await readMembers(env);
  const rows = [];
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 0;
  for (const id of ids) {
    const member = await kv.get(`member:${id}`, "json");
    if (!member || !member.name) continue;
    let xp = Number(member.xp) || 0;
    if (days) {
      xp = 0;
      for (let i = 0; i < days; i++) xp += Number(await kv.get(`xpday:${id}:${dateKey(i)}`)) || 0;
    }
    rows.push({ ...member, xp });
  }
  rows.sort((a,b)=>(Number(b.xp)||0)-(Number(a.xp)||0)||String(a.name).localeCompare(String(b.name)));
  return rows.slice(0,100).map((m,i)=>({rank:i+1,id:m.id,name:m.name,xp:Number(m.xp)||0,avatar:m.avatar||''}));
}

async function handleOnlineApi(request, env, pathname) {
  const kv = getKV(env);
  if (!kv) return json({ ok: false, error: "KV_LEADERBOARD_NOT_BOUND", message: "Binding KV belum dipasang. Gunakan variable LEADERBOARD atau MEA_LEADERBOARD." }, 503);

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  if (pathname === "/api/health" && request.method === "GET") {
    return json({ ok: true, kv: true, binding: env.LEADERBOARD ? "LEADERBOARD" : (env.MEA_LEADERBOARD ? "MEA_LEADERBOARD" : null) });
  }

  if (pathname === "/api/leaderboard" && request.method === "GET") {
    const period = new URL(request.url).searchParams.get('period') || 'all';
    return json({ ok: true, period, members: await leaderboard(env, period) });
  }

  if (pathname === "/api/member" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "");
    const name = cleanName(body.name);
    const avatar = cleanAvatar(body.avatar);
    if (!validId(id) || !name) return json({ ok: false, error: "INVALID_MEMBER" }, 400);

    const key = `member:${id}`;
    const old = await kv.get(key, "json");
    const member = { id, name, xp: Number(old?.xp) || 0, avatar: avatar || old?.avatar || '', updatedAt: Date.now() };
    await kv.put(key, JSON.stringify(member));

    const ids = await readMembers(env);
    if (!ids.includes(id)) {
      ids.push(id);
      await saveMembers(env, ids);
    }
    return json({ ok: true, member });
  }

  if (pathname === "/api/xp" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "");
    const delta = Math.max(0, Math.min(100, Number(body.delta) || 0));
    if (!validId(id) || !delta) return json({ ok: false, error: "INVALID_XP" }, 400);

    const key = `member:${id}`;
    const member = await kv.get(key, "json");
    if (!member) return json({ ok: false, error: "MEMBER_NOT_FOUND" }, 404);
    member.xp = Math.max(0, (Number(member.xp) || 0) + delta);
    member.updatedAt = Date.now();
    await kv.put(key, JSON.stringify(member));
    const dayKey = `xpday:${id}:${dateKey(0)}`;
    const dayXp = (Number(await kv.get(dayKey)) || 0) + delta;
    await kv.put(dayKey, String(dayXp), { expirationTtl: 60 * 60 * 24 * 45 });
    return json({ ok: true, xp: member.xp });
  }

  return json({ ok: false, error: "NOT_FOUND" }, 404);
}

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    let geminiPath = incoming.pathname;
    if (geminiPath.startsWith('/v1beta/')) geminiPath = geminiPath.slice('/v1beta'.length);

    // Online leaderboard API
    if (incoming.pathname.startsWith('/api/')) {
      try { return await handleOnlineApi(request, env, incoming.pathname); }
      catch (error) { return json({ ok: false, error: "SERVER_ERROR", message: String(error?.message || error) }, 500); }
    }

    // Gemini proxy endpoints
    if (isGeminiPath(geminiPath)) {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
      if (!["GET", "POST"].includes(request.method)) return json({ error: { message: "Method not allowed" } }, 405);
      const apiKey = env.GEMINI_API_KEY;
      if (!apiKey) return json({ error: { message: "GEMINI_API_KEY belum dipasang di Cloudflare" } }, 500);
      const target = GEMINI_ORIGIN + geminiPath + incoming.search;
      const headers = new Headers();
      headers.set("Content-Type", request.headers.get("Content-Type") || "application/json");
      headers.set("x-goog-api-key", apiKey);
      try {
        const upstream = await fetch(target, { method: request.method, headers, body: request.method === "POST" ? await request.arrayBuffer() : undefined });
        const responseHeaders = new Headers(CORS);
        responseHeaders.set("Content-Type", upstream.headers.get("Content-Type") || "application/json; charset=utf-8");
        return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
      } catch (error) {
        return json({ error: { message: "Proxy gagal menghubungi Gemini", detail: String(error?.message || error) } }, 502);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
