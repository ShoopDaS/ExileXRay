# Spike 4 — poe.ninja reachable from Linux ✅ PASS

Blocks **M2's PriceRepository**. The only spike with no game/hardware dependency.

## Run

```bash
node spikes/spike4-poeninja/check.mjs                  # default league "Runes of Aldur"
node spikes/spike4-poeninja/check.mjs "Current League" # re-confirm each new season
```

Exit code 0 = all 5 types reachable.

## Result (2026-06-26, on the dev machine)

```
[PASS] Currency    49 items, 222ms
[PASS] Runes       142 items, 38ms
[PASS] Expedition  24 items, 32ms
[PASS] Verisium    24 items, 35ms
[PASS] UncutGems   42 items, 36ms
=> SPIKE 4 PASS
```

No Cloudflare challenge with the spoofed Chrome UA + Referer. **Flag F4 cleared.**
The `buildUrl` / `buildReferer` / slug logic here is the reference for M2's
`PriceRepository.ts`. Re-run with the live league name when the season rolls over.
