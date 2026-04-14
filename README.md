# Codex Workspace

This repository uses Bun as the package manager.
For `codex-gateway`, runtime execution is Node.js (to avoid Windows/Bun + Playwright issues).

## Subprojects

- `codex-web`: Vite+ frontend
- `codex-gateway`: Fastify gateway service

## Setup

```bash
bun install
```

## Root commands

```bash
bun run dev
bun run dev:web
bun run dev:gateway
bun run build
bun run typecheck
```

## Per-subproject commands

```bash
bun run --cwd ./codex-web dev
bun run --cwd ./codex-gateway dev
```

Gateway note:

- `bun run dev:gateway` / `bun run --cwd ./codex-gateway dev` now build with Bun and run with Node.

## Gateway quick check

```bash
curl http://127.0.0.1:4000/admin/access-token
curl http://127.0.0.1:4000/admin/virtual-quota
```

## VSCode Codex 配置教程（接入本地 Gateway）

1. 启动服务

```bash
bun run dev:gateway
bun run dev:web
```

2. 在 Web 设置页获取 token

- 打开 `http://127.0.0.1:5173/settings`
- 在“访问 Token”卡片中点击“复制 Token”

3. 编辑 Codex 配置文件

- Windows: `%USERPROFILE%\\.codex\\config.toml`
- macOS/Linux: `~/.codex/config.toml`

加入以下配置：

```toml
model_provider = "quota_gateway"

[model_providers.quota_gateway]
name = "Local Quota Gateway"
base_url = "http://127.0.0.1:4000"
env_key = "QUOTA_GATEWAY_TOKEN"
# Optional when protocol mismatch:
# wire_api = "responses"
```

4. 二选一配置 token

方式 A（简单）: 环境变量

```powershell
$env:QUOTA_GATEWAY_TOKEN = "从设置页复制的token"
```

方式 B（推荐）: 自动取 token（无需手动维护环境变量）

```toml
[model_providers.quota_gateway.auth]
command = "bun"
args = ["run", "--cwd", "D:/桌面/codex/codex-gateway", "print-token"]
```

5. 重启 VSCode/Codex 扩展后验证

- 直接发起一次普通对话请求
- 如果返回 401，优先检查 `QUOTA_GATEWAY_TOKEN` 是否生效
- 如果返回协议不匹配，再尝试启用 `wire_api = "responses"`
