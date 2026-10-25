# Foreign net selling record label

Tracking rows and event details show `외국인 20일 최대 순매도` only when the signal day's foreign net selling amount exceeds every value in the immediately preceding 20 trading sessions. The signal day is excluded from the baseline; an equal maximum is not a new record. Amounts are KRW, not traded shares.

The protected-data build annotates existing tracking shards using historical foreign flows. It stores the signal-day net amount, prior maximum, window length and coverage. Missing observations or insufficient history yield `missing`, never an assumed zero or a record. Existing upstream absent-zero conventions remain unchanged.

The label does not alter registration, score, ordering, simulations or purchase eligibility. The list tooltip and visible detail text explain both amounts. Data are computed at build time without additional browser requests. Both current and historical tracking manifests are handled; missing historical detail safely suppresses the label.

Validation: strict comparison, ties, future exclusion, moving-window boundaries, insufficient history, missing and nonfinite values, all-zero history. Existing research event labels match the production annotation, and generated shard sizes remain below the response budget. Verify light/dark rendering and keyboard detail selection before release.
