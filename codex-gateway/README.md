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
curl -X POST http://127.0.0.1:4000/proxy/v1/chat/completions ^
  -H "content-type: application/json" ^
  -H "x-session-id: session-demo-1" ^
  -d "{\"stream\":false,\"messages\":[{\"role\":\"user\",\"content\":\"hello gateway\"}]}"
```

VSCode / Codex plugin integration tip:

- If the plugin can configure base URL only, point base URL to `http://127.0.0.1:4000`.
- OpenAI-compatible requests can go directly to `/v1/...`.
- ChatGPT web-like requests can go directly to `/backend-api/...`.

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
