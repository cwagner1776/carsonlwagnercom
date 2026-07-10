/**
 * POST /api/subscribe   { "email": "..." }
 *
 * Subscribes the address to BOTH Substack publications server-side.
 * Runs on Cloudflare's edge, so there is no CORS restriction and we
 * can actually read each response instead of firing blind.
 *
 * Responses:
 *   200 { ok:true,  results:{...} }  at least one publication accepted
 *   400 { ok:false, error:"..." }    bad / missing email
 *   429 { ok:false, error:"..." }    rate limited
 *   502 { ok:false, error:"..." }    both publications failed
 */
 
const PUBS = [
  { key: "show", host: "thecarsonwagnershow.substack.com" },
  { key: "blog", host: "carsonwagner.substack.com" },
];
 
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";
 
// Deliberately strict-ish but not RFC-complete; catches typos, not edge cases.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
 
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
 
/**
 * Substack's public subscribe endpoint. Returns 200 on success; on an
 * already-subscribed address it also returns 200, which is what we want
 * (idempotent from the reader's perspective).
 */
async function subscribe(host, email) {
  const url = `https://${host}/api/v1/free`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
 
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": UA,
        Origin: `https://${host}`,
        Referer: `https://${host}/`,
      },
      body: JSON.stringify({
        email,
        first_url: `https://${host}/`,
        first_referrer: "https://carsonlwagner.com/",
        current_url: `https://${host}/`,
        current_referrer: "https://carsonlwagner.com/",
        referral_code: "",
        source: "cover_page",
        referring_pub_id: "",
        additional_referring_pub_ids: [],
      }),
    });
 
    // Some Substack configs answer 302 on success.
    if (res.status === 200 || res.status === 201 || res.status === 302) {
      return { ok: true, status: res.status };
    }
    return { ok: false, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: err.name === "AbortError" ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}
 
/** Crude per-IP throttle using the edge cache. ~5 signups / 10 min / IP. */
async function throttled(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = new Request(`https://ratelimit.local/sub/${encodeURIComponent(ip)}`);
  const cache = caches.default;
 
  const hit = await cache.match(key);
  let count = 0;
  if (hit) {
    try {
      count = Number(await hit.text()) || 0;
    } catch (_) {}
  }
  if (count >= 5) return true;
 
  const next = new Response(String(count + 1), {
    headers: { "Cache-Control": "max-age=600" },
  });
  await cache.put(key, next);
  return false;
}
 
export async function onRequest(context) {
  const { request } = context;
 
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Allow": "POST, OPTIONS",
        "Cache-Control": "no-store",
      },
    });
  }
 
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed." }, 405);
  }
 
  let email = "";
  try {
    const ct = request.headers.get("Content-Type") || "";
    if (ct.includes("application/json")) {
      const body = await request.json();
      email = String(body?.email || "").trim().toLowerCase();
    } else {
      const form = await request.formData();
      email = String(form.get("email") || "").trim().toLowerCase();
    }
  } catch (_) {
    return json({ ok: false, error: "Malformed request." }, 400);
  }
 
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return json({ ok: false, error: "Please enter a valid email address." }, 400);
  }
 
  try {
    if (await throttled(request)) {
      return json({ ok: false, error: "Too many attempts. Try again shortly." }, 429);
    }
  } catch (_) {
    // If the throttle itself breaks, don't block a real signup.
  }
 
  const settled = await Promise.all(PUBS.map((p) => subscribe(p.host, email)));
 
  const results = {};
  PUBS.forEach((p, i) => {
    results[p.key] = settled[i].ok;
  });
 
  const anyOk = settled.some((r) => r.ok);
 
  if (!anyOk) {
    return json(
      {
        ok: false,
        error: "Subscription service is unavailable. Please try again later.",
        results,
      },
      502
    );
  }
 
  // Partial success still counts — the reader is on at least one list.
  return json({ ok: true, results, partial: !settled.every((r) => r.ok) });
}
 
