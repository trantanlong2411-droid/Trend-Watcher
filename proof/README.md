# Trend Watcher — verified public execution evidence

## Proven 200-point challenge features

Network: Pharos Atlantic Testnet (chain ID 688689).

Web app: https://trend-watcher.trantanlong2411.workers.dev/

Source: https://github.com/trantanlong2411-droid/Trend-Watcher

Stored evidence notebook: https://trend-watcher.trantanlong2411.workers.dev/?stream=ci-1793213298789-w0ivrzl

Original on-chain gas and persistent journal verification: https://github.com/trantanlong2411-droid/Trend-Watcher/actions/runs/40748381939

Re-read of the existing saved notebook after another GitHub commit: https://github.com/trantanlong2411-droid/Trend-Watcher/actions/runs/40748680875

The reviewer can open the first notebook link without connecting a wallet. The proof streams are now read-only to protect the historic alert timestamps against anonymous modification. The production demo supports creating fresh mutable notebooks.

## Observed results from real deployed Worker

- 12 distinct simulated gas observations sent in **separate HTTP requests** to a SQLite-backed Durable Object, not in-memory or only local browser storage.
- Single isolated spike **10 → 3 → 10 Gwei** with threshold 5 and confirmation count 3: **0 alerts**.
- Three consecutive readings **4 → 3 → 2 Gwei**: the third yielded **ALERT_FIRED**, timestamp `2026-10-28T18:48:20.510Z`.
- Two continued low readings created **0 extra alerts** (latch remained disarmed).
- After a nonqualifying 10 Gwei reading, a new run of 4 → 3 → 2 created exactly a second alert at `2026-10-28T18:48:21.812Z`.
- Retrying an already persisted observation ID returned `duplicate:true` and did not append a row or fire a second alert.
- A separate independent LIVE notebook read actual Pharos Atlantic gas **10 Gwei** from RPC, with a genuine block number and source `PHAROS_ATLANTIC_LIVE`. This was not part of the simulated trigger sequence.
- Both CI runs checked state via multiple new HTTP GETs. Run 40748680875 additionally confirmed the earlier original notebook still contained the same 12 observations and the two exact UTC timestamps.

The two fixed example notebooks are accessible to reviewers:

- [Original trend confirmation proof](https://trend-watcher.trantanlong2411.workers.dev/?stream=ci-1793213298789-w0ivrzl)
- [Subsequent independently persisted proof](https://trend-watcher.trantanlong2411.workers.dev/?stream=ci-1793213375304-jlvun2b)

All deployed alerts are persisted `PERSISTED_ALERT_ONLY` audit actions. This application does not send transactions, place trades or use private keys.

## Reviewer reproduction

1. Open the app and click New notebook.
2. Save the below-threshold rule: threshold 5 Gwei, 3 confirmations.
3. Click Demo: one spike. Confirm no alert.
4. Click Demo: three lows. Confirm one ALERT_FIRED at the third low and a stored UTC time.
5. Click Demo: more lows. Confirm the alert count stays 1.
6. Refresh the browser and click Reload persisted state. Confirm history remains.
7. Save or export the JSON evidence. Use a fresh notebook if switching from demo to live gas to avoid mixing synthetic values with real on-chain observations.

The separate hourly scheduled gas watcher is configured, but an hourly cron needs time to accumulate observations; the confirmed proof above comes from deliberate per-request runs. The tests do not falsely claim to have forcibly rebooted Cloudflare's runtime.

## Independent CI artifacts

A successful GitHub Actions deployed-persistence-proof job publishes the `pharos-trend-watcher-durable-proof` artifact (JSON; 30-day retention). The example proof link is persistent and remains available after artifact expiration.

Official Cloudflare persistence documentation: https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/
