# Production monitoring and rollback (Phase 3)

## Monitor production

The Railway deployment health check already requests `/api/health` before activating a backend
deployment. For ongoing monitoring, create read-only HTTPS GET monitors for:

| Target | Expected result |
| --- | --- |
| `https://<railway-domain>/api/health` | HTTP 200, `ok: true`, service `social-platform-api`, and a Git commit in `version` |
| `https://<vercel-domain>/` | HTTP 200 with an HTML response |

Use a 5-minute interval, a 10-second timeout, and alert after two consecutive failures. Configure a
recovery notification as well. If the monitoring service supports JSON assertions, also require
`readiness.testerAuth`, `readiness.email`, `readiness.gemini`, `readiness.tavily`, and
`readiness.supabaseDatabase` to
be `true`.

The readiness values indicate that required configuration is present; they do not prove Gemini,
Brevo, or Supabase is reachable. Do not have an uptime monitor call the protected integration
endpoints, send test email, or create/delete the Supabase smoke-test table. Run those checks
manually from the operator UI when investigating an integration issue.

Use [Railway service metrics](https://docs.railway.com/observability/metrics) and deployment logs
to investigate backend resource use and crashes. Use [Vercel deployment details and runtime
logs](https://vercel.com/docs/deployments/managing-deployments) to investigate frontend errors.
[Vercel Alerts](https://vercel.com/docs/alerts) require Pro or Enterprise with Observability Plus;
configure the available email, Slack, or webhook destination in the Vercel project. Otherwise,
configure alert delivery in the external uptime monitor.

## Roll back a production release

1. Confirm which service is failing. Record the deployment time, commit SHA, deployment ID, and
   relevant logs before changing production.
2. **Frontend:** In Vercel, open the project's **Deployments**, find the last known-good production
   deployment, and use its rollback/promote action to restore it to the production domain. See
   [Managing Deployments](https://vercel.com/docs/deployments/managing-deployments).
3. **Backend:** In Railway, open the backend service's **Deployments**, find the last known-good
   successful deployment, open its actions menu, and choose **Rollback**. See
   [Railway Deployment Actions](https://docs.railway.com/deployments/deployment-actions).
4. If both services changed, restore compatible frontend and backend releases. Check API
   compatibility before rolling back only one service.
5. Verify the Vercel root returns HTTP 200 and Railway `/api/health` returns HTTP 200 with
   `ok: true`. Re-run the relevant operator integration checks and confirm monitoring has recovered.
6. Document the incident and follow up with a fix and regression test before redeploying.

Railway rollback restores the selected deployment's image and custom variables. Recheck required
service variables after rollback. Never assume a code rollback can reverse database changes; back
up data and use a deliberate, backward-compatible migration plan before introducing schema changes.
