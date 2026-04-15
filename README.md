# Codex Workspace

本仓库使用 Bun 管理依赖，推荐直接使用开发模式运行。

## 项目结构

- `codex-web`: 前端（Vite+ / Vue）
- `codex-gateway`: 网关服务（Fastify）

## 一键开发启动（推荐）

```bash
bun install && bun run dev
```

说明：

- `bun run dev` 会并行启动 `codex-web` 与 `codex-gateway`

## 分开启动（可选）

```bash
bun run dev:gateway
bun run dev:web
```

或：

```bash
bun run --cwd ./codex-gateway dev
bun run --cwd ./codex-web dev
```

## 默认端口

- Web: `http://127.0.0.1:5173`
- Gateway API: `http://127.0.0.1:4000`
- Gateway 内部管理端口: `127.0.0.1:4010`

## VSCode Codex 接入本地 Gateway（自动）

1. 启动开发环境：

```bash
bun run dev
```

2. 网关会自动查找并接管 Codex 配置文件：

- Windows: `%USERPROFILE%\\.codex\\config.toml`
- macOS/Linux: `~/.codex/config.toml`
- 自动写入受管 provider，并切换 `model_provider`

3. 可通过接口查看自动配置状态：

```bash
curl http://127.0.0.1:4000/admin/codex-auto-config
```

4. 网关退出时会自动还原配置（基于 `config.toml.back`）。
