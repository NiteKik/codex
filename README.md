# Codex Workspace

This repository now uses Bun as the only runtime and package manager.

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
