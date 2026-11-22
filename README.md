# Connection Starter

A small, deployable foundation for a hackathon project, with a React frontend, Express API, CI,
and optional Brevo and Supabase connectivity checks. Use it to validate that your services can
communicate before building your event-specific product.

> **Scope:** this repository is currently an integration tester, not a finished social or
> participant-matching product. It does not include participant accounts, profiles, discovery, or
> connection requests. Build those features for your hackathon rather than treating the tester as
> product functionality.

## What is included

- React 19, TypeScript, and Vite frontend.
- Express 5 and TypeScript API with a health endpoint, security headers, CORS allow-list, and
  rate limiting.
- Operator-protected test endpoints for Brevo email and Supabase Postgres.
- GitHub Actions checks for backend build/tests and frontend lint/build.
- Railway and Vercel deployment configuration and an operations/rollback runbook.

## Get started locally

### Prerequisites

- Node.js 22.12 or newer and npm.
- Optional: a Brevo account and a Supabase Postgres database for testing those integrations.

### Install and configure

Run these commands from the repository root in PowerShell:

```powershell
cd backend
npm ci
Copy-Item .env.example .env
```

In a second terminal:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env
```

Set `frontend/.env`'s `VITE_API_URL` to `http://localhost:3000`. To use the protected integration
checks locally, set `backend/.env`'s `TESTER_TOKEN` to a random value. Generate one with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Add Brevo and Supabase values only if you intend to run those checks. Never commit `.env` files,
put secrets in `VITE_*` variables, or use production credentials for smoke tests.

### Run the app

Start each process in its own terminal:

```powershell
cd backend
npm run dev
```

```powershell
cd frontend
npm run dev
```

Open the Vite URL printed in the frontend terminal (normally `http://localhost:5173`). Check the
API first; the protected email and database actions then require the tester token. Database table
checks create or drop only `public.social_platform_connection_smoke_test`. Use a development
database, not production.

## Configuration

Copy the committed examples to local `.env` files and configure deployment variables in the
provider dashboard. The examples intentionally contain no credentials.

| Variable | Where | Required for |
| --- | --- | --- |
| `VITE_API_URL` | Frontend | The API origin; set to the deployed Railway URL or local API |
| `NODE_ENV` | Backend | Set to `production` on Railway; use `development` locally |
| `PORT` | Backend | Optional locally; Railway supplies it in deployment |
| `FRONTEND_URL` | Backend | The frontend origin allowed by API CORS; comma-separated origins are supported |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_SEC` | Backend | Optional API rate-limit overrides |
| `TESTER_TOKEN` | Backend | Protected integration-check endpoints |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` | Backend | Sending a test email |
| `SUPABASE_DB_URL` | Backend | Supabase Postgres connection/table checks |

`SUPABASE_DB_URL` is used by the current Postgres smoke test. The Supabase client SDK variables
from the package dependencies are not needed for these checks.

## Deploy

1. Deploy the `backend` directory as a Railway service. Configure its variables from
   `backend/.env.example`; set `NODE_ENV=production` and `FRONTEND_URL` to the exact Vercel site
   origin.
2. Deploy the `frontend` directory as a Vercel project. Set `VITE_API_URL` to the public Railway
   API origin, then redeploy whenever it changes (Vite embeds it at build time).
3. Configure both production services to deploy from `main`. In Railway, enable **Wait for CI**.
   In Vercel, add the **Backend build** and **Frontend lint and build** GitHub checks as deployment
   checks.
4. Follow monitoring and rollback steps in [docs/operations.md](./docs/operations.md).
5. Verify `/api/health`, then run protected integration checks manually from the operator UI.

Do not expose the integration endpoints as product features. Keep the tester token and provider
credentials server-side, restrict who can access the operator page, and use non-production
credentials and databases for test actions.

## Make this your GitHub template

1. Create a GitHub repository for this project and push the starter code to its `main` branch.
2. In **Settings → General**, enable **Template repository**.
3. Create a new repository from the template for each hackathon project.
4. In the new repository, rename the project and update this README, app branding, API service
   identity, and smoke-test table name together.
5. Add environment variables in the deployment dashboards; do not copy any real `.env` file.
6. Add the event's product features and tests in small increments, keeping CI green.

## Suggested hackathon build order

1. Write down the event problem, target users, and the smallest demoable outcome.
2. Add the core user flow and data model before adding optional integrations.
3. Add authentication and authorization before storing private user data.
4. Add participant profiles, discovery, and connection requests only if they fit the chosen
   product scope.
5. Seed safe demo data and verify the full demo flow on a fresh deployment.

Treat this as a starting point, not a requirement to use every dependency or provider. Remove
services your project does not need, and keep the first demo path as simple as possible.

## Checks

From `backend`: `npm run build` and `npm test`.

From `frontend`: `npm run lint` and `npm run build`.

GitHub Actions runs these checks on pull requests and pushes to `main`; no deployment credentials
are required in CI.
