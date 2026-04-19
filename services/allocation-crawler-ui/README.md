# allocation-crawler-ui

Plain static site (HTML + vanilla JS, no build step) for manually recovering
failed apply workflows.

## Panels

1. **Failed runs** — lists every `status=failed` run from
   `GET /jobs?runs_for=&user=…` on the crawler API. Each row has:
   - **Retry autofill** → `POST {worker}/enqueue/autofill` (Celery `apply.autofill_retry`)
   - **Solve captcha** → opens a code-input dialog, then `POST {worker}/enqueue/captcha`
     (Celery `apply.solve_captcha`, sets `SECURITY_CODE` env var)
   - **Requeue all failed** → batch `apply.requeue_failed` for everything in view
2. **Candidate profile** — read/write the `/users` answers blob
   (tags, contact, education, employment, demographics).
3. **Celery queue** — reads `/tasks` on the bridge, shows task id, kind,
   state, and last result.

## Config

Edit the three inputs in the header (crawler API, worker bridge, user id) —
values live only in the inputs, so reload to reset. Defaults point at
`https://allocation-crawler-service.netlify.app/api/crawler` and
`http://localhost:8787`.

## Serving

The worker bridge in `../allocation-apply-worker/` mounts this directory as
static files at `/`. You can also open `index.html` directly in a browser —
the crawler API calls go straight to Netlify, and the bridge calls need the
worker running locally.
