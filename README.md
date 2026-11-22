# Social Platform connection tester

This prototype checks the deployed Vercel frontend, Railway API, Gemini-powered claim checker,
Brevo email, and Supabase Postgres connection. Provider credentials stay on Railway; the browser
only receives the API URL and a tester token entered by the operator.

## Deployment configuration

### Vercel frontend

Set the project root directory to `frontend` and add:

| Variable | Value |
| --- | --- |
| `VITE_API_URL` | The public Railway API origin, for example `https://your-api.up.railway.app` |

`VITE_API_URL` is used at build time, so redeploy Vercel after changing it.

### Railway backend

Set the service root directory to `backend`. Configure these server-only variables on this service:

| Variable | Purpose |
| --- | --- |
| `BREVO_API_KEY` | Brevo v3 API key (used with the `api-key` header); do not use an SMTP key |
| `BREVO_SENDER_EMAIL` | Sender address verified in Brevo |
| `SUPABASE_URL` | Supabase project URL, if used by the API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key, if used by the API |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_SEC` | API rate-limit settings |
| `GEMINI_API_KEY` | Server-only Gemini API key for the claim checker |
| `GEMINI_MODEL` | Optional Gemini model override (defaults to `gemini-3.5-flash-lite`) |
| `TAVILY_API_KEY` | Server-only Tavily API key used to retrieve web evidence for the claim checker |

The connection tester additionally requires:

| Variable | Purpose |
| --- | --- |
| `TESTER_TOKEN` | Random operator-only token required for email and database test actions |
| `SUPABASE_DB_URL` | Supabase Postgres connection URI, kept only on Railway |

For `SUPABASE_DB_URL`, copy the URI from Supabase **Connect → Session pooler**. Railway may not be
able to reach Supabase's direct IPv6 database endpoint; the shared session pooler is reachable over
IPv4 and uses port `5432`. Copy the displayed host and username exactly, replace the password, and
percent-encode reserved characters in the password. Keep TLS enabled. Configure `FRONTEND_URL` with
the exact Vercel origin (no trailing slash). For preview deployments, a comma-separated list of
allowed origins is supported.

Generate `TESTER_TOKEN` locally, then paste it directly into Railway Variables; do not commit it or
put it in a `VITE_` variable. For example, run this locally:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Railway builds with `npm run build` and starts with `npm start`.

## Running the checks

Open the deployed Vercel site and:

1. Select **Check API connection** to test the browser-to-Railway request and CORS.
   Select **Test rate limit** to send up to 75 lightweight health checks, stopping when the API
   returns HTTP 429. This shares the same per-IP quota as other API requests.
2. Enter a factual claim in **Check a claim** to get Gemini's grounded assessment and source links.
   The checker uses the API's configured rate limit and does not require the tester token.
3. Enter the Railway `TESTER_TOKEN` and a recipient, then select **Send test email**.
4. Check Supabase Postgres, then create or delete the dedicated
   `public.social_platform_connection_smoke_test` table.

The table actions accept no table name from the browser and are protected by `TESTER_TOKEN`.
Deleting requires browser confirmation and only drops that dedicated smoke-test table.

## CI (Phase 0)

GitHub Actions runs on pull requests and pushes to `main`. It installs dependencies from each
package lockfile, builds the backend, and lints and builds the frontend. These checks need no
deployment credentials.

## CD (Phase 1)

Use the existing provider Git integrations for deployment rather than adding a second deploy
pipeline in GitHub Actions. This avoids duplicate builds and keeps provider credentials out of
GitHub. Configure both production services to deploy from `main`, then enable the provider-side CI
gates:

- **Railway:** In the backend service settings, set the GitHub trigger branch to `main` and enable
  **Wait for CI**. Railway will skip the deployment if a GitHub Actions workflow on that commit
  fails.
- **Vercel:** Set `main` as the production branch. In the project's **Deployment Checks** settings,
  add the GitHub Actions checks **Backend build** and **Frontend lint and build**. Vercel will hold
  the production deployment from reaching the production domain until those checks pass.

The GitHub workflow only runs CI for pushes to `main` and pull requests. Vercel preview deployments
for other branches remain managed by Vercel. No deployment tokens or provider secrets are needed
in GitHub Actions.

## Tests and smoke checks (Phase 2)

The backend CI job runs `npm test` for route-level and Gemini-adapter checks that do not contact
Gemini, Brevo, or Supabase. The tests cover the health response, tester-token rejection, claim
validation, grounded-source parsing, and the configured API rate limit.

Railway's existing deployment health check probes `/api/health` on each new backend deployment
before marking it active. The endpoint reports `RAILWAY_GIT_COMMIT_SHA` as `version` when deployed
from GitHub, making the running backend revision visible. Vercel's Phase 1 Deployment Checks keep
production promotion gated on CI. These provider-native checks avoid adding a workflow that could
hold Railway's **Wait for CI** deployment gate open while waiting for the deployment itself.

## Monitoring and recovery (Phase 3)

Configure read-only uptime monitors for the production API and frontend, and follow the manual
provider rollback steps in [docs/operations.md](./docs/operations.md). The runbook covers expected
health responses, alert setup, investigation, and recovery. External monitor and alert accounts
must be configured by an operator; no automatic rollback is configured.

## Local development

Run the backend from `backend` with `npm run dev`, and the frontend from `frontend` with
`npm run dev`. Configure the backend environment locally without committing secret files, and set
the frontend's `VITE_API_URL` to the local backend origin.