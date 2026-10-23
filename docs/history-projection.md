# Historical tracking and repeated-signal simulation

`scripts/build-history-web.py` reads the private archive without changing it and writes a private, authenticated web projection. Never commit its output to the public application repository.

The archive date set must exactly match its request, every daily file hash and row count is checked, duplicate investor/ticker/day records fail generation, and historical metadata hashes are checked when present. `history-quality.json` exposes missing metadata, unverified historical instrument classification, raw-price quality issues, and benchmark coverage. Do not describe this broader historical universe as a verified common-stock-only universe.

The existing ten-session low-activity rule remains the standard strategy: each day's pension gross purchases and sales are below KRW 100 million, then the signal day's net purchase is at least KRW 300 million. Tracking additionally supports KRW 100 million signals. The historical projection supports quiet-period thresholds up to KRW 100 million and keeps missing values separate from actual/reported zero and `absent_zero`.

Each qualifying ticker/date pair is a distinct signal. The first qualifying registration date is displayed separately. An event observed while the stock remains held is skipped, a new event after exit may enter again, and queued same-stock signals cannot create overlapping positions. Entries precede exits in the daily ledger, so sale proceeds are available to buy from the following session. Scores use signal-day pension/foreign flows, never current capitalization or future returns.

Optional research filters require (1) pension purchases equal zero over the preceding three calendar months, with complete session coverage, or (2) that condition plus signal volume at most three times its preceding twenty-session average. Missing features fail these additional conditions. These filters are exploratory, retain `absent_zero` semantics, and do not claim a calibrated win probability. Base-strategy results remain available.

Historical tracking, simulation stocks, and stock details are split into small authenticated JSON files. Publish the manifest after all parts; overlay it onto the normal private web build only when its as-of date matches the live dataset. A stale or unavailable projection must fall back to the live dataset and show that historical refresh is pending. The normal login proxy and administrator-only collection endpoint remain unchanged.

Prices are unadjusted archive observations. Trading halts, delistings, corporate actions and missing bars can leave capital unresolved. Do not manufacture an exit, fill missing prices, or report a complete NAV in that case. Benchmarks use matching observed sessions and exclude dividends; costs and market impact are not included.

