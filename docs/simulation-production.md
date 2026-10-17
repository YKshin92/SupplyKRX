# Authenticated simulation tab

The production dashboard lazy-loads `Simulation.tsx`. A Web Worker executes the pure TypeScript engine so changes to capital, budget, start date and thresholds do not block stock exploration. A sequence number rejects stale calculations. Numeric inputs debounce for 650 ms; the banner names the settings that produced the visible result.

The private data repository's build runs `scripts/publish-simulation.py --root <private-checkout> --target <app>/public/data/live`. Only qualifying candidate histories, all qualifying signal dates, and aligned index prices enter `simulation-input.json`. Keeping every qualifying event allows the earliest event **within a chosen start period** to be selected. Warm-up history is preserved. It never exports raw files into the public source repository.

`/data/live/simulation-input.json` uses the existing authenticated `/data/*` proxy, private/no-store cache policy and HttpOnly session. Existing CSV restrictions and owner-only collection remain in force. Do not publish this input file or private supplementary prices in the public source repository.

Daily collection refreshes NAVER price indices and attempts verified missing-price supplements in the private repository before committing. Supplement failures do not discard KRX flows; unavailable prices remain explicit and can make account totals unknown. The input is regenerated on each deployment, including when supplement collection is unavailable. Index provenance and its actual coverage date are shown in the tab.

Validation: `npm test`, `python -m unittest discover -s tests`, `npm run build`. For local/private parity, generate `public/data/live/simulation-input.json`, run `python scripts/verify-simulation-parity.py`, then set `SIMULATION_PARITY=1` and run `node --experimental-strip-types --test scripts/test-simulation.mjs`. Parity fixtures contain real data and stay in ignored `work/`.

The simulation is gross of costs, uses raw OHLC, and is not an order system. Capital mode buys before the day's exits and reuses sale proceeds from the next session. Missing held prices lock capital rather than fabricating a sale or marking it at zero. The monitoring score based on latest market capitalization is deliberately replaced by the frozen signal-day flow score for historical priority.
