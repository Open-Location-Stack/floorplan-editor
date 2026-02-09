# Client Logging Contract

All client logs emitted through `clientLogger` must follow this structure:

- `event`: stable event identifier (e.g. `ui.unhandled_error`)
- `payload.appVersion`: app version string (`PACKAGE_VERSION` when available, else `dev`)
- `payload.timestamp`: ISO timestamp
- `payload.message`: short error/detail message when available
- `payload.stack`: stack trace when available

## Event naming
- Use dot-separated namespaces by domain and action:
  - `ui.unhandled_error`
  - `persistence.save_failed`
  - `map.source_missing`

## Purpose
- Make browser-only/runtime failures diagnosable from logs.
- Keep telemetry schema stable for downstream dashboards/alerts.
