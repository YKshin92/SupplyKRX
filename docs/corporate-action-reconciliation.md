# Corporate action reconciliation

Current status (2026-10-29, C7): all four audited actions (DN split, Dongwha split, Vaxcell bonus issue, Samyang spinoff) are settled by the account engines under the explicit `corporate-v2` policy below. Fractional cash is valued at 0 won because no payment date is disclosed. Earlier paragraphs, including C6, describe historical stages; use the latest C7 section and implementation-progress for current completion.

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

Latest integration status: both account engines now accept an explicit optional corporate reconciliation context; the production/default call still supplies none. Synthetic account parity verifies a resumed split exit and next-session cash reuse, and leaves halt NAV/fractional rights unknown. A private TS rerun settles DN's existing position, leaving three unresolved positions totaling 8,939,300 won. Whole-account NAV remains unknown. Actual-data Python/TS parity, further input hardening, the other rights and production activation remain unfinished. Earlier statements that helpers are not called by either engine describe the earlier stage only.

Actual-data parity is now complete for this explicit DN context: Python/TS match all 1,058 events and the 731-session cash ledger, including unknown NAV. Independent context validators reject 15 shared malformed/future/credential-bearing inputs; evidence dates and pending fractional claims are retained separately in outputs. Production activation still awaits UI labels for original price versus adjusted basis, protected data/worker integration, and browser verification. The three remaining unverified rights remain unresolved and do not permit a whole-account return. Keep progressing on independent collection work while obtaining those sources.

Staged B2 helpers (`collector/split_lifecycle.py`, `src/split-lifecycle.ts`) now distinguish verified halts from absorbing unknown-price failures, preserve original cost and maintain a separate split-adjusted basis. They are not wired into either account engine. Whole-share splits credit no cash; fractional claims remain unresolved. Four Python and three Node boundary tests plus TypeScript checking pass.

DN actual changed-listing date is now corroborated by the issuer's [2026-05-15 quarterly report, issuance history note 2](https://kind.krx.co.kr/external/2026/05/15/001819/20260515004049/11013.htm): 2024-10-08. Preserve 2024-10-07 as the original scheduled date and label the later report as retrospective reconciliation evidence, not information known at the 2024 signal. Both the private archive and a separate Naver quote show zero volume on October 7 and positive volume on October 8. The Naver response adjusts earlier prices and volumes, so it must not overwrite pre-event raw bars. The exchange's contemporaneous resumption notice remains to be obtained.

Shared synthetic fixtures compare every Python/TypeScript transition field for six scenarios (`npm run test:split`, Python required). An additional private DN replay preserves the actual 36-share acquisition, then validates 180 shares, adjusted basis 16,240 won and zero cash credited on October 8. This replay ends at resumption; it does not integrate barriers, sale proceeds, ledger valuation or whole-account performance. Outputs remain private.

The replay now additionally evaluates the post-resumption barrier path with staged `split_valuation.py`/`split-valuation.ts`. Six shared valuation scenarios agree field-for-field: open, take/stop opening gaps, dual touches, halt reference and unresolved rights. DN reaches the adjusted take price 21,112 on 2025-01-24: proposed proceeds 3,800,160 and gross single-position P&L 876,960. This supersedes the earlier resumption-only stopping point. Neither account engine calls this evaluator yet, and no proceeds have been credited to a portfolio. Halt reference values remain distinct from confirmed equity; unresolved rights remain unknown. Account integration and next-session cash reuse remain required before deployment.

- Preserve original acquisition price while maintaining separate adjusted cost/threshold bases.
- Implement suspension and resumption as states, not as permanently absorbing missing-price states; genuine unknown quotes must not recover automatically.
- Credit fractional proceeds only on verified payment dates. Unlisted shares and cash receivables remain separate assets.
- Model spinoff assets jointly; do not apply a parent's price alone to the original whole position.
- Verify entry-day timing, repeated corporate events, idempotency, next-session cash reuse, gaps and same-day barriers in Python and TypeScript. Rerun the actual private portfolio before enabling an action.

Scope: no strategy/scoring changes, fabricated settlement, source quote publication or actual trading. This stage improves diagnostics and display; it does not resolve the four account valuations.

### C6 unresolved-rights audit (2026-10-29)

Current status supersedes the earlier staged notes: DN reconciliation is already active in production. The other three positions still require settlement inputs and lifecycle integration; their entire original capital must not be silently written off or released as cash.

The simulation now expands each affected position into exact whole-share and fractional rights, using the same public action registry as the Python rational planner. Quantities derive from the actual simulated holding, rather than a hardcoded example. Later purchases and unrelated missing-price events do not acquire past rights. The view is a diagnostic plan, not an account entry or a certification that securities were credited. It changes no cash, position state, threshold or return. The bonus new-share leg remains separate before listing.

Evidence reviewed:
- Vaxcell: the [offering terms](https://kind.krx.co.kr/external/2023/10/30/000604/20231030001503/10601.htm), section on bonus issuance, explicitly price fractional cash using the first listing day's close. The [exchange additional-listing notice](https://kind.krx.co.kr/external/2023/11/27/000543/20231127001403/70791.htm) confirms 2023-11-30. Neither establishes the actual fractional-payment date, so no cash is credited. Before whole-position backtesting, existing tradable shares, locked bonus entitlement, allocation of original cost and joint exit decisions must be modelled explicitly.
- Dongwha: the [changed-listing notice](https://kind.krx.co.kr/external/2024/05/02/000682/20240502001733/70764.htm) confirms 500-to-200 face-value conversion and 2024-05-03 listing. It does not state fractional settlement proceeds/date. Even while that receivable is unresolved, future engine work must separate tradable whole shares from the unpaid fractional claim; do not pretend all original capital is untradable forever.
- Samyang: the [split issuance report](https://kind.krx.co.kr/external/2025/11/03/000668/20251103001533/10810.htm), section VI, confirms new-company allocation 0.960767 and fractional cash based on the new company's first relisting close, with no actual payment date. It describes November 24 as scheduled, so passing that date does not by itself certify actual listing or availability. Retained-company ratio remains the earlier allocation contract; both actual listing notices, new-company raw prices, both fractional settlements and a documented joint exit/cost policy are still required. Do not infer cash availability from a payment valuation rule.

Validation: three new tests compare all three diagnostic plans field-for-field with Python Fraction, verify pre-listing locks, entry/event guards, no mutation/cash and safe quantities. Related JS20/Python14 tests and TypeScript pass. No simulated NAV or profit improvement is claimed. This audit is not completion of all three account settlements.

### C7 account settlement policy `corporate-v2` (2026-10-29)

User decisions (2026-10-29): joint close-based evaluation for the spinoff, entitlement-basis for the bonus issue, fractional shares valued at 0 won, applied as the production default after Python/TS parity and an actual-data replay.

Evidence rechecked on DART/KIND:
- Vaxcell bonus: ex-rights 2023-11-10 (price change_pct 6.25% equals the close against the theoretical 5/6 reference), new-share listing 2023-11-30 ([exchange notice](https://kind.krx.co.kr/external/2023/11/27/000543/20231127001403/70791.htm), evidence date 2023-11-27). Fractional cash rule (first listing-day close) is disclosed; the payment date is not.
- Dongwha split: [split decision, corrected 2024-04-16](https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20240416900356) (500 to 200 won, 20,220,816 to 50,552,040 shares, halt 04-12 to 05-02), [trading resumption 2024-05-03](https://kind.krx.co.kr/external/2024/05/02/000685/20240502001738/70799.htm), confirmed by the 2024-05-16 quarterly report. No fractional rule or payment date is disclosed.
- Samyang spinoff: the [2025 annual report filed 2026-03-23](https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260323001299) states the changed listing and relisting were completed on 2025-11-24 and that 5,231 retained-company fractional shares were bought as treasury stock; Samyang Biopharm's annual report records 5,850. The new company's raw daily prices (code 0120G0) exist in the private projection from 2025-11-24 with positive volume. This is retrospective evidence (evidence_on 2026-03-23), not information available at the 2025 signal; neither report gives a fractional payment date.

Rules (identical in `collector/corporate_lifecycle.py` and `src/corporate-lifecycle.ts`):
1. Only positions entered before the action's first affected session are changed. Signal scores, registration and entry decisions never use this evidence.
2. Fractional entitlements (`fraction_policy: "zero"`) are floored to whole shares, recorded as `fractional_forfeit` and valued at 0 won. No cash is ever credited for them. This is conservative by a small amount per position; it is not an estimate of the actual payment.
3. Split: whole shares after the ratio; adjusted basis = original invested amount / whole shares. Original entry price is preserved. Without the zero policy the previous strict behaviour (unresolved fractional claim) is unchanged.
4. Bonus issue: on the ex-rights session the price is validated against the theoretical reference (previous close × d/(d+n)). Total entitled whole shares define the basis; ordinary gap/intraday barriers apply to the same security. If a barrier triggers before listing, tradable shares are sold at the barrier and the locked new shares are sold at the listing-day open. Cash arrives on each actual sale day.
5. Spinoff: halted sessions keep NAV unknown (reference value only). On the relisting day both securities must have valid quotes. Retained × close + new × close is compared with the original invested amount at each close; when +take%/−stop% is reached, both securities are sold at the next session's open. Intraday simultaneity across two securities is unknowable and is not used.
6. Sale proceeds follow the existing rule: credited after that session's buys, reusable from the next session.
7. Any missing or broken quote still makes the position unresolved; nothing is filled synthetically.

Validation:
- New shared fixtures `tests/fixtures/corporate-lifecycle.json` (7 scenarios) compare every field of every Python/TS step; `scripts/corporate-account-fixture.py` checks an integrated bonus+spinoff account, NAV restoration, halted NAV unknown and next-session cash reuse; context validators reject malformed bonus/spinoff shapes.
- Private actual-data replay (2023-10-23 to 2026-10-29, 1,063 signals, default 20M/3M/+30/−10): Python and TS match on all trades and all 735 ledger sessions. Unresolved positions 3 → 0, whole-account NAV is computable again. Releasing the locked capital changes later entries, so later trade lists differ from the previous release; this is the intended consequence, not a strategy change. Values remain in private audit outputs only.
- In the default replay the earlier capital release means the Dongwha position no longer coincides with its split. The real Dongwha path was therefore replayed separately from the previous release's actual holding (55 shares entered 2024-04-08): both engines give 137 whole shares, a 1/2-share forfeit and the same adjusted basis, and the same stop on 2024-05-08.

Remaining limits: actual fractional payment dates/amounts, costs, taxes, dividends and slippage are still not modelled. The spinoff rule is a documented policy choice, not a claim about how a real investor would have traded.
