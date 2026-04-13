# Local Quota Gateway MVP

This subproject is a compliant local routing gateway skeleton for multi-profile quota scheduling.

What it includes:

- Fastify localhost gateway
- SQLite persistence with quota snapshots, session bindings, reservations, decision logs, and request logs
- Account manager, session manager, scheduler, quota virtualizer, and quota poller
- HTTP proxy entrypoints (`/proxy/*`, `/v1/*`, `/backend-api/*`) and SSE-compatible upstream forwarding
- Scheduler preview API (`/admin/scheduler/preview`) for dry-run routing diagnostics
- ChatGPT browser login capture workflow (`/admin/chatgpt-capture/*`) for local session/token import

Default behavior:

- No demo accounts are injected by default.
- To enable mock demo accounts, start with `ENABLE_DEMO_SEEDS=1`.
- Default upstream is `https://chatgpt.com` and default quota path is `/backend-api/wham/usage`.
- `GET /backend-api/wham/usage` is served locally as a **virtual aggregated quota** endpoint by default (`EXPOSE_VIRTUAL_WHAM_USAGE=1`).
- Proxy endpoints require a local gateway access token by default (`REQUIRE_GATEWAY_ACCESS_TOKEN=1`).

What it intentionally does not include:

- Third-party consumer cookie scraping
- Session injection against chatgpt.com, codex, or other services
- Quota bypass logic for unsupported providers

## Run

From workspace root:

```bash
bun install
bun run dev:gateway
```

Or inside this subproject only:

```bash
cd codex-gateway
bun install
bun run start
```

## Try

```bash
curl http://127.0.0.1:4000/admin/accounts
curl http://127.0.0.1:4000/admin/virtual-quota
curl "http://127.0.0.1:4000/admin/scheduler/preview?session_id=dev-1&path=/v1/chat/completions&method=POST&estimated_units=3"

# Get token
curl http://127.0.0.1:4000/admin/access-token
curl http://127.0.0.1:4000/admin/tokens

# Create an extra managed token (7 days)
curl -X POST http://127.0.0.1:4000/admin/tokens \
  -H "content-type: application/json" \
  -d "{\"name\":\"ci-token\",\"ttlSeconds\":604800}"

# Update managed token TTL (never expire => ttlSeconds: null)
curl -X PATCH http://127.0.0.1:4000/admin/tokens/<tokenId> \
  -H "content-type: application/json" \
  -d "{\"ttlSeconds\":null}"

# Revoke managed token
curl -X DELETE http://127.0.0.1:4000/admin/tokens/<tokenId>

# Then call protected endpoints with Authorization: Bearer <token>
curl http://127.0.0.1:4000/backend-api/wham/usage \
  -H "authorization: Bearer <token>"

curl -X POST http://127.0.0.1:4000/proxy/v1/chat/completions ^
  -H "authorization: Bearer <token>" ^
  -H "content-type: application/json" ^
  -H "x-session-id: session-demo-1" ^
  -d "{\"stream\":false,\"messages\":[{\"role\":\"user\",\"content\":\"hello gateway\"}]}"
```

VSCode / Codex plugin integration tip:

- If the plugin can configure base URL only, point base URL to `http://127.0.0.1:4000`.
- OpenAI-compatible requests can go directly to `/v1/...`.
- ChatGPT web-like requests can go directly to `/backend-api/...`.
- For token auth, call `GET /admin/access-token` for the default token, or use `POST /admin/tokens` to create additional managed tokens.
- Fill token into plugin-side auth (`Authorization: Bearer <token>`).

## Codex token wiring (step 2)

1) Get token

```powershell
$token = (Invoke-RestMethod http://127.0.0.1:4000/admin/access-token).token
$env:QUOTA_GATEWAY_TOKEN = $token
```

2) Add provider in Codex config (`~/.codex/config.toml`)

```toml
model_provider = "quota_gateway"

[model_providers.quota_gateway]
name = "Local Quota Gateway"
base_url = "http://127.0.0.1:4000"
env_key = "QUOTA_GATEWAY_TOKEN"
# Optional per provider protocol:
# wire_api = "responses"
```

Alternative: command-based token (no manual env export):

```toml
[model_providers.quota_gateway.auth]
command = "bun"
args = ["run", "--cwd", "D:/your-workspace/codex-gateway", "print-token"]
```

You can also read a generated snippet from:

```bash
curl http://127.0.0.1:4000/admin/access-token
```

## Browser login capture

This flow opens a local browser window, waits for manual login on `chatgpt.com`, then captures session/access token and saves to account pool.

```bash
# 1) start capture task (opens browser)
curl -X POST http://127.0.0.1:4000/admin/chatgpt-capture/start \
  -H "content-type: application/json" \
  -d "{\"profileKey\":\"default\"}"

# 2) poll capture status
curl http://127.0.0.1:4000/admin/chatgpt-capture/<taskId>

# 3) save captured session as account
curl -X POST http://127.0.0.1:4000/admin/chatgpt-capture/<taskId>/save \
  -H "content-type: application/json" \
  -d "{\"name\":\"my-chatgpt-account\"}"
```

Environment variables for capture:

- `BROWSER_EXECUTABLE_PATH` (optional): explicit Edge/Chrome executable path
- `BROWSER_PROFILE_DIR` (optional): profile data directory
- `CHATGPT_CAPTURE_TIMEOUT_MS` (default `600000`)
- `CHATGPT_CAPTURE_POLL_INTERVAL_MS` (default `3000`)

Extra gateway env vars:

- `EXPOSE_VIRTUAL_WHAM_USAGE` (default `1`): when enabled, `/backend-api/wham/usage` returns the virtual pooled quota computed from all non-invalid accounts.
- `REQUIRE_GATEWAY_ACCESS_TOKEN` (default `1`): require valid token for `/proxy/*`, `/v1/*`, and `/backend-api/*`.
- `GATEWAY_ACCESS_TOKEN` (optional): explicitly set token value.
- `GATEWAY_ACCESS_TOKEN_FILE` (optional): token file path. Default is `data/gateway-access-token.txt`.
- `PREEMPTIVE_WEEKLY_RESERVE_RATIO` (default `0.05`): keep at least this weekly quota ratio as safety headroom before scheduling to other accounts.
- `PREEMPTIVE_WINDOW_RESERVE_RATIO` (default `0.05`): keep at least this 5h-window quota ratio as safety headroom.
- `PREEMPTIVE_WEEKLY_RESERVE_UNITS` (default `0`): optional absolute weekly reserve units (takes max with ratio threshold).
- `PREEMPTIVE_WINDOW_RESERVE_UNITS` (default `0`): optional absolute 5h-window reserve units.
- `ESTIMATED_UNIT_BYTES` (default `2500`): request-size bytes mapped to one virtual unit.
- `ESTIMATED_CONTEXT_OVERHEAD_UNITS` (default `2`): extra context units added on top of latest-user-text estimate.
- `MAX_ESTIMATED_UNITS_PER_REQUEST` (default `12`): cap of virtual units per request to avoid overestimation.

Notes:

- When `EXPOSE_VIRTUAL_WHAM_USAGE=1`, `GET /backend-api/wham/usage` is intentionally readable without gateway token so local status panels can always fetch quota.
