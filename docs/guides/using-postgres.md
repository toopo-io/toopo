# Using Postgres

SQLite is the default and is right for a personal or small-team instance ([self-host guide](../getting-started/self-host.md)). For heavier or multi-writer load, run Toopo on Postgres via the compose overlay. Toopo's storage is dual-backend by design ([ADR-0017](../adr/0017-storage-strategy.md)) — the application code is identical; only the backend changes.

## Run with the overlay

```bash
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up --build
```

Always pass **both** compose files together. Running the base `docker compose up` alone while pointing `DATABASE_URL` at Postgres leaves no `db` service to connect to — the overlay is what brings one up.

The overlay adds a `postgres:16` service and repoints the stack at it. The SQLite volume is simply unused in this mode.

## Set the password first

`POSTGRES_PASSWORD` has **no default** — the `db` container refuses to start without it. Set it in `.env` before bringing the stack up:

| Variable | Default | Notes |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | *(none — required)* | The `db` won't start without it. |
| `POSTGRES_USER` | `toopo` | Adjust as needed. |
| `POSTGRES_DB` | `toopo` | Adjust as needed. |

These propagate to both the `db` service and the connection URL, which the overlay assembles as `postgres://<user>:<password>@db:5432/<db>`.

## Migrations

Migrations run as the one-shot `migrate` service on `docker compose up`, before the API and worker start — never on boot of the app containers ([ADR-0008](../adr/0008-env-validation-at-module-load.md), [ADR-0030](../adr/0030-self-host-deployment-topology.md)). This is the same flow as the SQLite default; only the target database differs.

---

**See also:** [Self-host with Docker Compose](../getting-started/self-host.md) · [Environment variables](../reference/environment-variables.md) · [ADR-0017](../adr/0017-storage-strategy.md).
