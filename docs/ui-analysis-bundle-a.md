# Analysis UI bundle A

- Share an event-centred detail window: 20 prior and 40 following observations, extending through ten observations after a later exit or diagnostic date. Missing event dates never become a recent-only substitute.
- Reformat the existing v2 score explanation as three contribution cards. This does not change the formula or introduce the future eight-rank score.
- Name the existing date-descending ordering explicitly as signal-date order.
- Share accessible loading placeholders between historical details and tracking.
- Explain unresolved holdings by issue, date, invested principal and a link to the affected interval. Known corporate-action diagnostics do not fabricate settlement, quotes, shares or performance.
- Display unbought prices as unbought, and unresolved account totals as pending calculation. Preserve missing observations and the existing simulation rules.

Validation: Node tests include event-window boundaries, late exits, missing anchors, diagnostic categories and existing simulation/authentication invariants. Review both themes and keyboard interactions before release. Corporate-action reconciliation remains a separate follow-up; this UI bundle must not be described as resolving missing account valuations.
