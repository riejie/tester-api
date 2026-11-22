# Social Platform connection tester

This prototype checks the deployed Vercel frontend, Railway API, Brevo email, and Supabase
Postgres connection. Provider credentials stay on Railway; the browser only receives the API URL
and a tester token entered by the operator.

## Deployment configuration

### Vercel frontend

Set the project root directory to `frontend` and add:

| Variable | Value |
| --- | --- |
| `VITE_API_URL` | The public Railway API origin, for example `https://your-api.up.railway.app` |

`VITE_API_URL` is used at build time, so redeploy Vercel after changing it.

### Railway backend

Set the service root directory to `backend`. Configure the existing mail, Supabase API, and rate
limit variables on this service. This tester additionally requires:

| Variable | Purpose |
| --- | --- |
| `TESTER_TOKEN` | Random operator-only token required for email and database test actions |
| `SUPABASE_DB_URL` | Supabase Postgres connection URI, kept only on Railway |

Get the Postgres connection URI from Supabase **Project Settings → Database**. Use a connection
option reachable from Railway and keep TLS enabled. Configure `FRONTEND_URL` with the exact Vercel
origin (no trailing slash). For preview deployments, a comma-separated list of allowed origins is
supported.

Generate `TESTER_TOKEN` locally, then paste it directly into Railway Variables; do not commit it or
put it in a `VITE_` variable. For example, run this locally:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Railway builds with `npm run build` and starts with `npm start`.

## Running the checks

Open the deployed Vercel site and:

1. Select **Check API connection** to test the browser-to-Railway request and CORS.
2. Enter the Railway `TESTER_TOKEN` and a recipient, then select **Send test email**.
3. Check Supabase Postgres, then create or delete the dedicated
   `public.social_platform_connection_smoke_test` table.

The table actions accept no table name from the browser and are protected by `TESTER_TOKEN`.
Deleting requires browser confirmation and only drops that dedicated smoke-test table.

## Local development

Run the backend from `backend` with `npm run dev`, and the frontend from `frontend` with
`npm run dev`. Configure the backend environment locally without committing secret files, and set
the frontend's `VITE_API_URL` to the local backend origin.