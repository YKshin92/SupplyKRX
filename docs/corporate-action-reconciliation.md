# Corporate action reconciliation, stage 1

Do not treat unresolved positions as ordinary losses or silently remove their capital. The existing account engine remains unchanged until quantities, tradability, cost and cash rights are integrated and validated in both engines.

## Verified diagnostic evidence

- Dongwha: [KRX split listing](https://kind.krx.co.kr/external/2024/05/02/000682/20240502001733/70764.htm), [trading resumption](https://kind.krx.co.kr/external/2024/05/02/000685/20240502001738/70799.htm). Face value 500 to 200; resumed 2024-05-03. The first affected observation in the private audit is 2024-04-12.
- DN Automotive: [merger/split disclosure](https://kind.krx.co.kr/external/2024/07/19/000307/20240719000759/00591.htm). 1:5 split, halt from 2024-09-25; scheduled listing 2024-10-07. The listing schedule and actual price coverage must be checked before engine activation.
- Vaxcell: [offering/bonus terms](https://kind.krx.co.kr/external/2023/10/30/000604/20231030001503/10601.htm), [actual additional listing](https://kind.krx.co.kr/external/2023/11/27/000543/20231127001403/70791.htm). Bonus 0.2 shares per share, record 2023-11-13, listed 2023-11-30. The first affected price observation is 2023-11-10; it is not a tradable-new-share date. Fractional-share cash follows a separate settlement timetable.
- Samyang: [split issuance report](https://kind.krx.co.kr/external/2025/11/03/000668/20251103001533/10810.htm), [allocation terms](https://kind.krx.co.kr/external/2025/09/02/000079/20250902000123/10601.htm). Retained 0.9039233 and new-company 0.960767 shares per original share. Halt and relisting, both assets, fractional rights and cost allocation must be reconciled together.

## Implemented now

1. A diagnostic entitlement planner uses exact rational arithmetic, separates whole shares and fractional rights, and keeps bonus shares locked until listing. It credits no cash, does not settle positions, and is not called by the trading engine.
2. Build-time tracking annotations check the complete signal-to-current price interval with the existing price-quality rule. A missing bar, zero-volume uncertainty or price-basis break suppresses the raw-price return. Normal later signals remain independent of earlier issues.
3. Tracking sorts unknown returns last. Rows and details explain deferred comparison instead of showing a split-induced percentage as performance. Simulation details perform the same check when loaded. All four account diagnostic cards identify the known corporate action and link its public source.
4. An incomplete history or legacy payload does not certify a return while loading. Charts keep observed raw data; they are not adjusted-price charts. The warning explicitly states that the return is pending verification.
5. Annotation can increase file size. Repartition both historical and recent fallback events into bounded 1.5 MB shards after enrichment, write manifests last, and use the same validated parallel reader for both roots. Do not raise the response limit or omit events to make a build pass. Integration fixtures check byte limits, complete event order and safe repeat annotation.

## Remaining work

- Preserve original acquisition price while maintaining separate adjusted cost/threshold bases.
- Implement suspension and resumption as states, not as permanently absorbing missing-price states; genuine unknown quotes must not recover automatically.
- Credit fractional proceeds only on verified payment dates. Unlisted shares and cash receivables remain separate assets.
- Model spinoff assets jointly; do not apply a parent's price alone to the original whole position.
- Verify entry-day timing, repeated corporate events, idempotency, next-session cash reuse, gaps and same-day barriers in Python and TypeScript. Rerun the actual private portfolio before enabling an action.

Scope: no strategy/scoring changes, fabricated settlement, source quote publication or actual trading. This stage improves diagnostics and display; it does not resolve the four account valuations.
