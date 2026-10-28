---
name: pharos-trend-watcher
description: Persist Pharos Atlantic gas observations across runs and issue an exactly-once durable alert only after a configurable multi-observation trend. Public read-only live RPC and clearly marked synthetic proof.
---
# Trend Watcher Skill

The public Cloudflare Worker provides `GET /api/state?stream=ID`, `POST /api/rule`, `POST /api/check-live`, and `POST /api/observe-demo`.

1. Use a unique notebook stream ID (minimum eight allowed characters), so independent agents do not contaminate each other's history.
2. Configure mode `below` with `thresholdGwei` and `minObservations >= 3`, or `falling` for strictly decreasing observations.
3. Use `/api/check-live` to sample actual Pharos Atlantic `eth_gasPrice` with chain ID 688689 and block number, or `/api/observe-demo` for explicitly synthetic demonstration values; never mix their identity labels.
4. Each submission includes a stable observation ID, so retries cannot append duplicate readings. All journal state transitions and action logs are durably committed by a single Durable Object storage transaction.
5. The condition is confirmed only after N distinct qualifying observations. One low reading followed by a higher one resets the counter. On first confirmation, append exactly one UTC `ALERT_FIRED` event, then hold a latch until the condition breaks.
6. Read `/api/state` after restart or from a fresh browser to recover the same journal and alert log. The browser does not own monitoring history.
7. Export JSON from the UI for reviewer evidence; mention that the action is an alert record, not a blockchain transaction.
8. The hourly cron independently checks the public Pharos RPC on a separate read-only notebook, which can take hours to accumulate enough observations.

No signing or trading, no private keys, and no assurance of price prediction. Hosted Pharos MCP covers mainnet 1672; this Skill intentionally uses Atlantic testnet RPC instead.
