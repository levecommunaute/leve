# LEVE — P1 blocking tests (pre go-live)

Manual / automated checks that must pass before production launch.

1. **Google OAuth login works** — Sign in with Google completes without error; session is established and protected routes load.
2. **Profile created automatically after login** — A `profiles` row exists for the new `auth.users` id immediately after first successful OAuth callback.
3. **Member type assigned correctly based on `numero_membre`** — Pionnier (1–99), Fondateur (1000–9999), Communaute (≥10000), Collaborateur (business rules) match stored `member_type` and expected `multiplier` where applicable.
4. **Code submission validates correctly** — Entering a valid four-character fragment for the active video succeeds; wrong code, expired window, or wrong video fails with the intended error.
5. **Quiz scores calculated correctly** — Submitting quiz answers produces a score consistent with the number of correct responses and the configured weighting for that video.
6. **PMQ pool formula: 45% of revenue distributed** — Monthly redistribution uses `total_revenue * 0.45` as the PMQ pool and allocates it across members in proportion to `points * multiplier` (sum of payouts equals pool within rounding tolerance).
7. **PA transaction tax 2% applied correctly** — PA-related movements deduct (or reserve) exactly 2% where the product spec requires it; ledger and member-facing amounts stay in sync.
8. **Transfer blocked if `solde` < $100** — Any bank transfer or external payout request with balance under 100.00 USD (or configured currency) is rejected before execution.
9. **Classement updates in real time** — After points or PMQ-affecting actions, the leaderboard reflects new ordering without a full app restart (Realtime subscription or equivalent refresh).
10. **Admin can generate codes and trigger redistribution** — Authorized admin flows can mint video codes and invoke monthly redistribution (and related notifications) without manual SQL.
