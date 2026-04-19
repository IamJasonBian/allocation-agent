# allocation-apply-worker

Celery coordinator + static-site bridge for manually recovering failed apply
runs. The UI lives at `../allocation-crawler-ui/` and is served directly by
this FastAPI app.

## Architecture

```
browser (static UI)
    │
    ▼
FastAPI bridge  ─── /enqueue/autofill, /enqueue/captcha, /enqueue/requeue
    │
    ▼
Celery (Redis broker)
    │
    ▼
Worker process → shells out to Node engine
  (services/allocation-crawler-service/src/engine/index.mjs)
```

The worker reuses the existing browser-apply engine so there's no duplicated
Puppeteer logic on the Python side.

## Run locally

```bash
# 1. install
cd services/allocation-apply-worker
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. point at your broker (defaults to localhost:6379/0)
export REDIS_URL=redis://localhost:6379/0
export CRAWLER_API=https://allocation-crawler-service.netlify.app/api/crawler

# 3. start the Celery worker (one terminal)
celery -A celery_app worker --loglevel=info -Q apply_failures

# 4. start the bridge + static UI (another terminal)
uvicorn server:app --host 0.0.0.0 --port 8787
```

Then open http://localhost:8787 — the static UI is mounted at `/`.

## Environment

| var            | default                                                          |
|----------------|------------------------------------------------------------------|
| `REDIS_URL`    | `redis://localhost:6379/0`                                       |
| `CRAWLER_API`  | `https://allocation-crawler-service.netlify.app/api/crawler`     |
| `NODE_BIN`     | `node`                                                           |
| `APPLY_TIMEOUT`| `300` (seconds per engine invocation)                            |
| `CORS_ORIGINS` | `*` (comma-separated)                                            |

## Tasks

| task                  | arguments                                       | purpose                                           |
|-----------------------|-------------------------------------------------|---------------------------------------------------|
| `apply.autofill_retry`| `run_id, job_id, board, user_id`                | Retry a failed run end-to-end                     |
| `apply.solve_captcha` | `run_id, job_id, board, user_id, code`          | Resume a suspended run with human captcha/OTP     |
| `apply.requeue_failed`| `runs[], user_id`                               | Fan-out helper — enqueues `autofill_retry` per run|

Tasks emit metadata to Redis under `apply_task:{id}` and an index list
`apply_task_log`; `/tasks` reads those for the UI's queue view.
