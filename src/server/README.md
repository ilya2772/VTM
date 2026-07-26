# Server-only modules

Database access, secrets, market-data credentials, execution, risk calculations and authoritative validation live under `src/server`. Modules in this directory must begin with `import "server-only"` once implemented and must never be imported by Client Components.
