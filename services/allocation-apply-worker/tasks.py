"""Celery tasks that coordinate recovery of failed apply runs.

Each task shells out to `scripts/batch-browser-apply-aastha.mjs`, the existing
Puppeteer-based apply script. It already accepts `--job-id=<id> --board=<token>`
for single-job mode and honors `SECURITY_CODE` from the environment, so we
reuse it verbatim rather than re-implementing the browser pipeline in Python.
"""
import os
import subprocess
from pathlib import Path

from celery_app import celery_app

REPO_ROOT = Path(__file__).resolve().parents[2]
APPLY_SCRIPT = REPO_ROOT / "scripts" / "batch-browser-apply-aastha.mjs"
NODE_BIN = os.environ.get("NODE_BIN", "node")
CRAWLER_API = os.environ.get(
    "CRAWLER_API", "https://allocation-crawler-service.netlify.app/api/crawler"
)
APPLY_TIMEOUT = int(os.environ.get("APPLY_TIMEOUT", "600"))


def _run_script(job_id: str, board: str, user_id: str, extra_env: dict | None = None) -> dict:
    env = {**os.environ, "CRAWLER_API": CRAWLER_API, **(extra_env or {})}
    proc = subprocess.run(
        [NODE_BIN, str(APPLY_SCRIPT), f"--job-id={job_id}", f"--board={board}", f"--user={user_id}"],
        cwd=str(REPO_ROOT),
        env=env,
        capture_output=True,
        text=True,
        timeout=APPLY_TIMEOUT,
    )
    result = {"stdout": proc.stdout[-2000:], "stderr": proc.stderr[-2000:], "code": proc.returncode}
    if proc.returncode != 0:
        raise RuntimeError(f"script exited {proc.returncode}: {proc.stderr.strip()[:500]}")
    return result


@celery_app.task(bind=True, name="apply.autofill_retry", max_retries=2, default_retry_delay=30)
def autofill_retry(self, run_id: str, job_id: str, board: str, user_id: str):
    """Re-run the browser-apply pipeline for a single failed run."""
    try:
        return {"run_id": run_id, "user_id": user_id, "ok": True, **_run_script(job_id, board, user_id)}
    except RuntimeError as exc:
        raise self.retry(exc=exc)


@celery_app.task(bind=True, name="apply.solve_captcha", max_retries=0)
def solve_captcha(self, run_id: str, job_id: str, board: str, user_id: str, code: str):
    """Resume a run that's blocked on a human-entered captcha / verification code."""
    result = _run_script(job_id, board, user_id, extra_env={"SECURITY_CODE": code})
    return {"run_id": run_id, "user_id": user_id, "ok": True, **result}


@celery_app.task(name="apply.requeue_failed")
def requeue_failed(runs: list[dict], user_id: str):
    """Fan-out helper — schedules autofill_retry for every provided failed run."""
    task_ids = []
    for r in runs:
        async_res = autofill_retry.delay(r["run_id"], r["job_id"], r["board"], user_id)
        task_ids.append(async_res.id)
    return {"enqueued": len(task_ids), "task_ids": task_ids}
