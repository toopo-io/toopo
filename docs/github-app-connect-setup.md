# GitHub-App connect — self-hoster setup & validation

Toopo's "connect your repo → live cartography" flow runs on a **GitHub App that
each self-hoster registers themselves** (ADR-0026). There is no shared, Toopo-hosted
App — the App, its private key, and its webhook secret are your instance's
credentials. This guide registers the App, wires the env, and validates the whole
loop locally with a webhook tunnel.

> A self-host with **no** GitHub App still runs fully: the deterministic graph, the
> populate CLI, and the read API all work. Without an App the connect endpoints
> return `503` and the worker clones public repos only — nothing breaks (graceful
> degradation, ADR-0024 §3 / ADR-0026 §1).

## 1. Register the GitHub App

GitHub → **Settings → Developer settings → GitHub Apps → New GitHub App**.

| Field | Value |
| --- | --- |
| **GitHub App name** | anything unique (e.g. `toopo-<your-org>`) |
| **Homepage URL** | your Toopo web origin |
| **Callback URL** | not required for v1 (installation-only; OAuth-during-install is a future enhancement, ADR-0026 fork F6) |
| **Setup URL** | `https://<your-web-origin>/<locale>/connect` (e.g. `https://toopo.example.com/en/connect`) — **check "Redirect on update"** |
| **Webhook → Active** | ✓ |
| **Webhook URL** | `https://<your-api-origin>/v1/webhooks/github` |
| **Webhook secret** | a strong random string (≥16 chars) — this is `GITHUB_WEBHOOK_SECRET` |

**Permissions** (Repository):

| Permission | Access | Why |
| --- | --- | --- |
| **Contents** | Read-only | clone the repo at a commit (ADR-0025) |
| **Metadata** | Read-only | list the installation's repos, resolve the default branch HEAD |

**Subscribe to events:** `Push`, `Installation`, `Installation repositories`.

**Where can this App be installed?** Your choice (only your account, or any).

After creating it, on the App's page:

- Note the **App ID**.
- Generate a **private key** (downloads a `.pem`).
- Note the **Client ID** and generate a **Client secret**.
- Note the App **slug** (the URL-safe name in `https://github.com/apps/<slug>`).

## 2. Configure the environment

The private key is multiline, so it is supplied **base64-encoded** and decoded at
the env boundary (ADR-0026 §7). Encode it:

```bash
# macOS / Linux
base64 -w0 < your-app.private-key.pem      # (-w0: no line wraps)
# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("your-app.private-key.pem"))
```

Set these (all optional; unset ⇒ connect disabled, fail-closed):

| Variable | Consumed by | Notes |
| --- | --- | --- |
| `GITHUB_APP_ID` | api, worker | numeric App ID |
| `GITHUB_APP_PRIVATE_KEY` | api, worker | **base64** of the PEM |
| `GITHUB_APP_CLIENT_ID` | api | from the App page |
| `GITHUB_APP_CLIENT_SECRET` | api | from the App page |
| `GITHUB_APP_SLUG` | api | builds the install redirect URL |
| `GITHUB_WEBHOOK_SECRET` | api | **same** secret you set on the App (ADR-0024) |

The **api** needs all six; the **worker** needs only `GITHUB_APP_ID` +
`GITHUB_APP_PRIVATE_KEY` (to mint installation tokens for private clones). `git`
must be on the worker's `PATH` (ADR-0025).

## 3. The flow, end to end

1. A signed-in user clicks **Connect a repository** → the api returns the install
   URL with a signed, session-bound `state` → the browser goes to GitHub.
2. The user picks repos and installs → GitHub redirects to the **Setup URL**
   (`/connect`) with `installation_id` + `state`, and **also** delivers an
   `installation` webhook.
3. `/connect` posts to the api, which **verifies the state against the session**
   (rejects a forged/mismatched/expired state — links nothing), records the
   `installation_id ⇄ user` link, creates a project per repo, and enqueues each
   repo's default-branch HEAD as a first scan.
4. The worker clones each commit (private repos via a short-lived installation
   token through `GIT_ASKPASS`), ingests the delta, and persists the graph.
5. Subsequent pushes flow through the existing webhook → queue → worker loop.
   Uninstalling, or removing a repo, soft-archives its project.

## 4. Validate locally with a webhook tunnel (smee.io)

GitHub must reach your webhook URL. Locally, forward deliveries with
[smee.io](https://smee.io) (no real GitHub creds live in CI — this is a **manual**
post-merge check by the maintainer; CI covers everything else with a mocked GitHub).

```bash
# 1. Create a channel at https://smee.io/new — copy its URL, set it as the App's
#    Webhook URL (temporarily), and forward to your local api:
npx smee-client --url https://smee.io/<your-channel> \
  --target http://localhost:4000/v1/webhooks/github

# 2. Run the stack with the App env set (api + a worker + the web app):
DATABASE_URL=<url> pnpm --filter @toopo/db db:migrate
pnpm dev:api
DATABASE_URL=<url> pnpm --filter @toopo/worker consume   # logs "github app auth: enabled"
pnpm dev:web
```

Then, signed in to your local Toopo:

1. **Connect** a repo (include a **private** one) → you land on `/connect` → it
   reports *N repositories connected*.
2. Confirm the projects appear in the picker and their graphs build (the worker
   logs a clone + ingest per repo; a private repo proves the installation-token
   clone).
3. Push a commit to a connected repo → the smee terminal shows the `push`
   delivery, the worker re-ingests, and the graph updates.
4. Remove a repo from the installation (or uninstall the App) → its project
   drops out of the picker (soft-archived).

### Negative checks (the security contract)

- **Tamper** a forwarded delivery's body (or send a wrong-secret signature) → the
  api rejects it `401`/`403` and does no work.
- Hit `/v1/github/install` **signed out** → `401`. Hit it with the App env
  **unset** → `503` (and the worker logs `github app auth: disabled`).
- Confirm the installation token never appears in any log line, the clone URL, or
  `.git/config` in the worker sandbox (it is fed only through `GIT_ASKPASS`).

## Related

- [ADR-0026](adr/0026-github-app-connect-and-installation-auth.md) — the connect
  model: install→project, installation tokens, private clone.
- [ADR-0024](adr/0024-github-push-webhook-ingestion.md) — the webhook gate.
- [ADR-0025](adr/0025-worker-ingest-clone-and-incremental-persist.md) — the clone.
- [`apps/worker/README.md`](../apps/worker/README.md) — the consume path.
