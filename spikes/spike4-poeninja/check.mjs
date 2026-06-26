// Spike 4 — poe.ninja reachability from Linux/Node.
// STOP-gate criteria: all 5 economy types return non-empty JSON (items[]/lines[]),
// NOT a Cloudflare challenge. Also confirms the current league slug.
//
// Usage:
//   node check.mjs                       # default league "Runes of Aldur"
//   node check.mjs "Some League Name"    # override league
//
// No game, no Electron, no deps — plain Node fetch.

const LEAGUE = process.argv[2] || "Runes of Aldur";

// The 5 economy types the C# app queries (plan §9).
const TYPES = ["Currency", "Runes", "Expedition", "Verisium", "UncutGems"];

// A current desktop Chrome UA. poe.ninja sits behind Cloudflare; the C# app
// spoofs a browser UA + Referer to avoid the bot challenge.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// Referer slug = league with spaces removed, lowercased (plan: buildReferer).
const slug = (league) => league.replace(/\s+/g, "").toLowerCase();

const buildUrl = (league, type) =>
  `https://poe.ninja/poe2/api/economy/exchange/current/overview` +
  `?league=${encodeURIComponent(league)}&type=${type}`;

const buildReferer = (league, type) =>
  `https://poe.ninja/poe2/economy/${slug(league)}/${type.toLowerCase()}`;

function classify(status, contentType, bodyText) {
  const ct = contentType || "";
  const looksHtml = ct.includes("text/html") || /^\s*</.test(bodyText);
  const cf =
    /cloudflare|cf-ray|just a moment|challenge-platform|attention required/i.test(
      bodyText,
    );
  if (status !== 200) return { ok: false, reason: `HTTP ${status}` };
  if (cf) return { ok: false, reason: "Cloudflare challenge" };
  if (looksHtml) return { ok: false, reason: "HTML (not JSON)" };
  return { ok: true };
}

function countItems(json) {
  if (!json || typeof json !== "object") return 0;
  if (Array.isArray(json.lines)) return json.lines.length;
  if (Array.isArray(json.items)) return json.items.length;
  // some overview payloads nest under .currencyDetails / .lines
  for (const v of Object.values(json)) if (Array.isArray(v)) return v.length;
  return 0;
}

async function hit(league, type) {
  const url = buildUrl(league, type);
  const headers = {
    "User-Agent": UA,
    Referer: buildReferer(league, type),
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
  };
  const t0 = performance.now();
  try {
    const res = await fetch(url, { headers });
    const text = await res.text();
    const ms = Math.round(performance.now() - t0);
    const verdict = classify(res.status, res.headers.get("content-type"), text);
    let count = 0;
    let parseErr = null;
    if (verdict.ok) {
      try {
        count = countItems(JSON.parse(text));
        if (count === 0) {
          verdict.ok = false;
          verdict.reason = "empty JSON (0 items)";
        }
      } catch (e) {
        verdict.ok = false;
        verdict.reason = "JSON parse error";
        parseErr = e.message;
      }
    }
    return { type, url, ms, status: res.status, count, verdict, parseErr,
      snippet: verdict.ok ? null : text.slice(0, 160).replace(/\s+/g, " ") };
  } catch (e) {
    return { type, url, ms: Math.round(performance.now() - t0),
      verdict: { ok: false, reason: `network: ${e.message}` } };
  }
}

console.log(`\nSpike 4 — poe.ninja reachability`);
console.log(`League: "${LEAGUE}"  (referer slug: "${slug(LEAGUE)}")\n`);

const results = [];
for (const type of TYPES) {
  const r = await hit(LEAGUE, type);
  results.push(r);
  const mark = r.verdict.ok ? "PASS" : "FAIL";
  const detail = r.verdict.ok
    ? `${r.count} items, ${r.ms}ms`
    : `${r.verdict.reason}${r.snippet ? ` :: ${r.snippet}` : ""}`;
  console.log(`  [${mark}] ${type.padEnd(11)} ${detail}`);
}

const passed = results.filter((r) => r.verdict.ok).length;
console.log(`\n  ${passed}/${TYPES.length} types reachable with non-empty JSON.`);
if (passed === TYPES.length) {
  console.log("  => SPIKE 4 PASS\n");
} else {
  console.log(
    "  => SPIKE 4 FAIL — if Cloudflare/HTML: route via Electron net/proxy (Flag F4).",
  );
  console.log(
    "     If all fail, the league slug is likely stale — pass the current league as arg.\n",
  );
}
process.exit(passed === TYPES.length ? 0 : 1);
