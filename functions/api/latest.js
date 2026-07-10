/**
 * GET /api/latest
 * Fetches the newest Substack post + newest podcast episode.
 * Cached at the edge for 30 minutes. Never throws — on failure
 * it returns nulls and the page simply hides the block.
 */

const SUBSTACK_FEEDS = [
  "https://thecarsonwagnershow.substack.com/feed",
  "https://carsonwagner.substack.com/feed",
];

const PODCAST_ID = "1848040165";

const UA = "Mozilla/5.0 (compatible; carsonlwagner.com/1.0)";

function pick(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!m) return "";
  let v = m[1].trim();
  const c = v.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (c) v = c[1];
  return v.trim();
}

function decode(s) {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function minutes(s) {
  if (!s) return "";
  if (s.includes(":")) {
    const p = s.split(":").map(Number);
    if (p.some(isNaN)) return "";
    const sec = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
    return Math.round(sec / 60) + " min";
  }
  const n = parseInt(s, 10);
  return isNaN(n) ? "" : Math.round(n / 60) + " min";
}

function firstItem(xml) {
  const parts = xml.split(/<item[\s>]/i);
  if (parts.length < 2) return null;
  const b = "<item " + parts[1];
  const title = decode(pick(b, "title"));
  if (!title) return null;
  return {
    title,
    link: pick(b, "link") || pick(b, "guid"),
    date: pick(b, "pubDate"),
    duration: minutes(pick(b, "itunes:duration")),
  };
}

async function getText(url, ms = 6000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: c.signal,
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, */*" },
      cf: { cacheTtl: 1800, cacheEverything: true },
    });
    if (!r.ok) return null;
    return await r.text();
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function getSubstack() {
  for (const url of SUBSTACK_FEEDS) {
    const xml = await getText(url);
    if (xml && /<item[\s>]/i.test(xml)) {
      const it = firstItem(xml);
      if (it) return it;
    }
  }
  return null;
}

async function getPodcast() {
  try {
    const look = await getText(
      `https://itunes.apple.com/lookup?id=${PODCAST_ID}&entity=podcast`
    );
    if (!look) return null;
    const j = JSON.parse(look);
    const feed = j?.results?.[0]?.feedUrl;
    if (!feed) return null;
    const xml = await getText(feed);
    if (!xml) return null;
    return firstItem(xml);
  } catch (_) {
    return null;
  }
}

export async function onRequestGet(context) {
  const cache = caches.default;
  const key = new Request(new URL("/api/latest", context.request.url).toString());

  const hit = await cache.match(key);
  if (hit) return hit;

  let post = null, episode = null;
  try {
    [post, episode] = await Promise.all([getSubstack(), getPodcast()]);
  } catch (_) {}

  const res = new Response(JSON.stringify({ post, episode }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=600, s-maxage=1800",
      "Access-Control-Allow-Origin": "*",
    },
  });

  context.waitUntil(cache.put(key, res.clone()));
  return res;
}
