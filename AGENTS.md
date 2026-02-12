# Repository Guidelines

## Project Structure & Module Organization

- `src/` contains all TypeScript source. Key areas: `src/core/` (scoring + config), `src/ai/` (LLM providers), `src/crawler/` (RSS fetch), `src/report/`, `src/notification/`, `src/storage/`, `src/bot/`, `src/mcp/`.
- `config/` holds runtime config and keyword dictionaries (YAML + text).
- `docs/` contains migration and planning docs; `dist/` is compiled output.
- `docker/` and `output/` are support/ops artifacts.

## Build, Test, and Development Commands

- `bun install` — install dependencies.
- `bun run dev` — run with watch mode on `src/index.ts`.
- `bun run build` — compile TypeScript to `dist/`.
- `bun run start` — run compiled CLI from `dist/`.
- `bun run bot` / `bun run bot:prod` — run Telegram bot (dev/compiled).
- `bun run mcp` — run the MCP server.
- `bun run typecheck` — TypeScript type-only check.
- `bun run lint` / `bun run lint:fix` / `bun run format` / `bun run check` — Biome lint/format.

## Coding Style & Naming Conventions

- Formatter/linter: Biome (2-space indent, 100-char line width, single quotes, semicolons).
- TypeScript strict mode, ESM modules, path alias `@/*` → `src/*`.
- Code uses `camelCase`; YAML config in `config/config.yaml` uses camelCase to match code.

## Testing Guidelines

- No first-party test suite is configured in this repo currently.
- If you add tests, place them under `src/**/__tests__/` or `tests/` and wire a `bun run test` script in `package.json`.

## Commit & Pull Request Guidelines

- No Git history is available in this workspace, so commit conventions are unknown.
- Use clear, imperative commit subjects (e.g., “Add RSS feed de-duplication”).
- PRs should include: summary, key files touched, config/env changes, and screenshots if HTML reports/UI output changes.

## Configuration & Secrets

- Main config: `config/config.yaml` with `${ENV_VAR}` interpolation.
- Local secrets belong in `.env.local` (do not commit).

## Agent Notes

- See `CLAUDE.md` for architecture details and expanded command descriptions.
