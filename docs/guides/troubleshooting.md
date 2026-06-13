# Troubleshooting

Common self-host issues and what they mean. Most "it's broken" symptoms are actually Toopo failing **closed** on purpose — an unset integration disables a feature rather than crashing the stack.

## The API won't start

`BETTER_AUTH_SECRET` is the one required value — the API refuses to boot without it (minimum 32 characters). Generate one with `openssl rand -base64 32` and set it in `.env`. Every other setting has a working default. See [environment variables](../reference/environment-variables.md).

## The webhook returns 503

The GitHub webhook fails closed when `GITHUB_WEBHOOK_SECRET` is unset ([ADR-0024](../adr/0024-github-push-webhook-ingestion.md)). This is deliberate: with no secret there is no way to verify a delivery, so the endpoint rejects everything rather than process unsigned input. Set the secret to the same value configured on your GitHub App. A `401`/`403` instead means the signature did not match — check that the App's secret and `GITHUB_WEBHOOK_SECRET` are identical.

## Private repositories won't clone

Cloning a private repository needs a GitHub App: the worker mints a short-lived installation token and feeds it to `git`. Without the App configured, the worker clones **public** repositories only. Set `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` on the worker (and the full set on the API) per [Connect a repository](../getting-started/connect-a-repo.md). The worker logs `github app auth: enabled` when it is configured.

## A push didn't update the graph

Only pushes to the repository's **default branch** enqueue a scan ([ADR-0024](../adr/0024-github-push-webhook-ingestion.md)). Pushes to other branches are intentionally ignored. Also confirm the project exists — the webhook resolves an existing project and ignores a push for an unknown one (a miss returns `200`, not an error); projects are created only by the [connect flow](../getting-started/connect-a-repo.md).

## A file or language is missing from the graph

Only **React + TypeScript** (`.ts`, `.tsx`) is analysed today. Files in other languages — including plain JavaScript (`.js`/`.jsx`) — are marked and skipped, never fatal. See [what Toopo cannot do](../concepts/what-toopo-cannot-do.md).

## New version, schema changed

Migrations are an explicit step, run by the one-shot `migrate` service on the next `docker compose up` ([ADR-0008](../adr/0008-env-validation-at-module-load.md)). They never run automatically on app-container boot. Pulling a new version and running `docker compose up` applies any pending migrations before the API and worker start.

## Inspecting the stack

```bash
docker compose ps                 # service health
docker compose logs -f api worker # tail the API and worker
```

---

**See also:** [Self-host with Docker Compose](../getting-started/self-host.md) · [Connect a repository](../getting-started/connect-a-repo.md) · [Environment variables](../reference/environment-variables.md).
