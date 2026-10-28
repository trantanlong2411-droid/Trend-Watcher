# Trend Watcher — user-generated 12-observation proof (28 October 2026)

This is the user's **original browser-exported JSON**, preserved in this repo together with an independent, reproducible internal consistency test. It is **not** a record of 12 real on-chain gas fluctuations: every observation is explicitly tagged `SYNTHETIC_DEMO`.

- Original uploaded filename: `pharos-trend-proof-1793214023206.json`
- Original source file SHA-256: `3e6778dcd17c7cd8b87e62344d8585028240165dd691aec984c78e448a443bdd`
- Original export UTC: `2026-10-28T19:00:23.204Z`
- Persistent notebook: [Open the user's saved 12-check timeline](https://trend-watcher.trantanlong2411.workers.dev/?stream=demo-42371df8-3821-4d54-b4b2-e22837f714de)
- Source: [Full browser JSON](./user-trend-proof-2026-10-28.json)
- Verification: `node scripts/verify-user-demo.mjs`, and `node scripts/verify-user-demo.mjs --live` to re-fetch Durable Object state

## Verified outcomes in the file

The saved configuration requires three or more consecutive readings strictly below **5 Gwei**.

| Step(s) | Simulated Gwei | Decision |
|---|---|---|
| 1–3 | 10, 3, 10 | No alert: the isolated reading at step 2 is below threshold but step 3 resets the streak |
| 4–5 | 4, 3 | `OBSERVE_ONLY` at streaks 1 and 2 |
| 6 | 2 | `ALERT_FIRED`, streak 3, event ID `alert-1` |
| 7–12 | 4, 3, 2, 1, 1, 1 | No duplicate alert while condition remains continuously true |

- Total persisted records: **12**.
- Alerts: **1**, with zero duplicate alerts.
- Exact alert timestamp: `2026-10-28T18:59:48.902Z` (UTC).
- Triggering observation ID: `obs-35d68bac-3351-41a8-81d8-08c3dd23ea1a`.
- Record-level source for all 12 observations: `SYNTHETIC_DEMO`.
- Event's action: `PERSISTED_ALERT_ONLY` (a stored alert, **not an on-chain transaction**).
- Stored journal policy revision: `2`.

## Evidence boundaries

The JSON directly demonstrates that one isolated threshold breach cannot cause an alert, while three consecutive breaches do, and that continuing low readings do not generate duplicate alerts.

The `persistentStorage: CLOUDFLARE_SQLITE_DURABLE_OBJECT` field is an application-reported storage type. Source code, separate multi-request GitHub CI runs, and Cloudflare documentation support the implementation; the exported file alone cannot independently prove an actual process restart.

Because this notebook is a publicly writable demonstration stream, the live notebook URL may be extended later. The original JSON in GitHub remains an immutable historical snapshot for reviewers.

[Previously verified CI on-chain gas + durable storage proof](./README.md). The real gas RPC and separate CI streams are separate from this intentionally synthetic trend demonstration.
