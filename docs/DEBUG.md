# Debug and verbose mode

## IDE debugging (VS Code / Cursor)

Use the Bun debugger via `.vscode/launch.json`:

- **Debug Main** – Run main pipeline (`src/index.ts`, entrypoint `run`) with breakpoints.
- **Debug Bot** – Run Telegram bot (`src/index.ts` with `TRENDRADAR_ENTRYPOINT=bot`).
- **Debug File** – Run the currently open file with the debugger.
- **Attach Bun** – Attach to a Bun process already running with inspector (e.g. `bun --inspect`).

Select a configuration in the Run and Debug view and press F5.

## Runtime debug (logging)

- **Log level:** Set `LOG_LEVEL=debug` (or leave unset in development; default is `debug` when `NODE_ENV !== 'production'`). See [src/utils/logger.ts](../src/utils/logger.ts).
- **Verbose (config):** In `config/config.yaml`, set `runtime.verbose: true` to enable debug logging and app-level verbose messages.
- **Verbose (env):** Set `TRENDRADAR_VERBOSE=1` to enable verbose without editing YAML (e.g. in a launch config: `"env": { "TRENDRADAR_VERBOSE": "1" }`).

## Entrypoint override

To force entrypoint from the environment (e.g. for **Debug Bot** in launch.json):

- `TRENDRADAR_ENTRYPOINT=run` – main pipeline (default)
- `TRENDRADAR_ENTRYPOINT=bot` – Telegram bot only
- `TRENDRADAR_ENTRYPOINT=both` – run pipeline then start bot

Valid values: `run`, `bot`, `both`.
