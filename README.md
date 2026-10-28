# Trend Watcher — Pharos Agent Arena (Hard, 200 pts)

Live demonstration: https://trend-watcher.trantanlong2411.workers.dev/

GitHub repository: https://github.com/trantanlong2411-droid/Trend-Watcher

## Objective and honest scope

Build a multi-run, durable trend observer that reads the real Pharos Atlantic gas price (Gwei), persists observations in a SQLite-backed Cloudflare Durable Object, triggers a **persisted alert event only after three or more consecutive observations** satisfy a configurable rule, and suppresses duplicate alerts until the condition breaks.

The alert is a durable in-app record (`PERSISTED_ALERT_ONLY`), not a financial trade, token transfer, signed transaction, notification or Telegram message. No blockchain write is performed. Tests can also inject **explicitly labeled SYNTHETIC_DEMO** values so a reviewer can reliably reproduce a single noisy spike and a confirmed trend, without pretending synthetic prices were read from chain. These are gas prices (not token prices).

Chain: Pharos Atlantic Testnet (688689), RPC `https://atlantic.dplabs-internal.com`. Hosted Pharos MCP is mainnet 1672, so on this testnet the Worker reads `eth_chainId`, `eth_blockNumber`, `eth_gasPrice` directly by read-only JSON-RPC.

## Mapped requirements

| Agent Arena requirement | Verifiable implementation |
| --- | --- |
| Persists state between runs | Cloudflare SQLite-backed Durable Object with one transactional JSON journal per stream. It is read from `ctx.storage.get` for every request, not an in-memory variable or browser-only state. |
| Configurable trend needs 3+ observations | Rule `below` (N consecutive Gwei readings strictly below configured threshold), or `falling` (N strictly falling observations). Configurable `minObservations` between 3 and 12. |
| Restart and deduplication | Persistent state survives Durable Object eviction/restart and Worker deploy. Observation IDs are deduplicated in one transactional update. A latched alert fires once per contiguous episode, then re-arms only after a nonqualifying sample. |
| Stored history and exact trigger time | Each observation stores timestamp UTC, Gwei, source, block for live data, streak, policy revision and decision. `ALERT_FIRED` ledger has UTC trigger timestamp, exact observation ID, rule and count. |
| Single spike must not trigger | The six-request deterministic proof uses 10,3,10 then 4,3,2 Gwei with threshold 5 and N=3. After the spike, 0 alerts; on the final confirmed low, precisely 1 alert. Continuing lows do not duplicate. |

## User-exported browser evidence — October 28, 2026

- [Full original 12-observation exported JSON](./proof/user-trend-proof-2026-10-28.json) and [auditable reviewer summary](./proof/USER-DEMO.md).
- Recorded `10 → 3 → 10` (no alert), then `4 → 3 → 2` (`ALERT_FIRED` at `2026-10-28T18:59:48.902Z` UTC), then six additional below-threshold observations (no duplicate alert).
- Export SHA-256: `3e6778dcd17c7cd8b87e62344d8585028240165dd691aec984c78e448a443bdd`. All user values are **SYNTHETIC_DEMO**, not claimed as independent chain measurements.
- Source-independent state-machine replay: `node scripts/verify-user-demo.mjs`. Optional comparison against persistent hosted notebook: `node scripts/verify-user-demo.mjs --live`.
- [Open user notebook](https://trend-watcher.trantanlong2411.workers.dev/?stream=demo-42371df8-3821-4d54-b4b2-e22837f714de). The GitHub snapshot is authoritative for its state at export time; this public demo notebook may accept later writes.

## Verified public persistent proof

First fully successful run: [GitHub Actions #40748381939](https://github.com/trantanlong2411-droid/Trend-Watcher/actions/runs/40748381939). All logic tests, Cloudflare Worker deploy and deployed HTTP tests passed.

The real deployed test created a saved public notebook containing 12 observations, 2 alert events at exact UTC timestamps, idempotent duplicate-ID rejection, and one separately tagged real Pharos Atlantic gas observation (10 Gwei).

- [Open the persisted proof notebook](https://trend-watcher.trantanlong2411.workers.dev/?stream=ci-1793213298789-w0ivrzl) to inspect the already-saved timeline and both alert events.
- Original first alert: `2026-10-28T18:48:20.510Z`.
- Original second alert: `2026-10-28T18:48:21.812Z`.
- A standalone CI artifact `pharos-trend-watcher-durable-proof` contains the full machine-readable journal and verification trace.
- Later CI jobs explicitly re-read this original notebook and require the same alert timestamps, to check that deploying a newer Worker does not destroy the prior journal.

This verifies persistence across separate HTTP operations and, once a subsequent Worker deployment is complete, across a deployment. No CI test claims to force a Cloudflare Durable Object process eviction or system restart.

## Reviewer walkthrough

1. Open the public Worker. Use **New notebook** for an isolated durable stream. The notebook ID is included in the public proof URL; use **Copy proof link** to share it.
2. Select **Consecutive samples below limit**, threshold **5 Gwei**, confirmation count **3**, and save the rule.
3. Click **Demo: one spike (10 → 3 → 10)**. The UI sends **three separate HTTP requests** that write **three separate persisted observations**. Check the history: alert count remains **0**.
4. Click **Demo: three lows (4 → 3 → 2)**. The system sends three new separate requests. The third below-threshold sample records `ALERT_FIRED` with exact UTC timestamp; alert count becomes **1**.
5. Click **Demo: more lows** to confirm a persisted active alert is **not triggered repeatedly**. The latch prevents duplicates until a condition break. A separate duplicate-ID replay returns `duplicate: true` without appending another observation.
6. Refresh the browser, then press **Reload persisted state**. All saved observations and alert timestamps reappear from Cloudflare, **not from browser localStorage**. This demonstrates state across independent requests and a page reload. Cloudflare guarantees Durable Object storage survives actual restarts; the CI test does not forcibly reboot a Durable Object.
7. Click **Observe LIVE Pharos gas** to record a real on-chain gas quote with block number and clearly labeled source `PHAROS_ATLANTIC_LIVE`. RPC 429 or unavailable responses fail closed without a fake observation.
8. Click **Export JSON evidence** and open the `events` array; it includes time and exact condition met. A background hourly scheduled observation also writes to the public read-only stream `pharos-scheduled-hourly`, once the cron has executed.

If desired, use **Run complete 6-check proof on a new notebook** to create the full scenario with a fresh ID automatically. Preserve the URL as the Proof Link if you want reviewers to see historical alerts without having to reproduce them.

## Safety and limitations

- Public demonstration: notebook IDs are not access control. Do not store wallets, personal secrets, keys or private information. The public interface can change demo notebooks; protect/admin-authenticate the API before using it for production monitoring.
- The backend validates the live chain ID 688689; live values come from actual RPC, never a user-provided number. Synthetic values are only stored with source `SYNTHETIC_DEMO`. A notebook is restricted to one source mode; create a new notebook before switching between synthetic and live checks.
- No wallet, on-chain execution or signing. The action is a **durable alert log**, not an external transaction or automated trade.
- SQLite-backed Durable Objects provide durable storage. Latest 250 observations and 150 events per notebook are displayed; oldest data are bounded, and the most recent 500 observation IDs are deduplicated.
- Scheduled cron is hourly and will not immediately yield 3 live observations. The scheduled public stream is read-only from user-facing endpoints.
- This is not a price oracle. Chain gas may be constant and will not always trigger naturally. Deterministic multi-observation proofs therefore use explicitly synthetic values.

## Reproduce and verify

```sh
npm install
npm test
npm run build-check
npx wrangler deploy
```

GitHub Actions: https://github.com/trantanlong2411-droid/Trend-Watcher/actions/workflows/verify.yml

The deployed persistence proof runs 12 separately persisted demo observations, demonstrates two distinct triggered episodes, replay deduplication and real Pharos Atlantic gas read, and saves a 30-day JSON artifact. The proof script checks stored history through fresh HTTP GET requests but does not claim to force an underlying platform restart.

## References

- [Agent Arena Trend Watcher task](https://pharos-agent-arena.vercel.app/tasks/trend-watcher)
- [Cloudflare Durable Objects storage](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/)
- [Cloudflare SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [Pharos MCP GitHub](https://github.com/PharosNetwork/pharos-mcp)
