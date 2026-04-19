"""FastAPI bridge: serves the static UI and enqueues Celery tasks.

The static site cannot enqueue Celery tasks directly (no Redis client in the
browser), so this small HTTP bridge accepts JSON from the UI and calls
`task.delay(...)`. It also exposes a `/tasks` endpoint that reads task metadata
from Redis so the UI can show the Celery queue state.
"""
import os
from datetime import datetime
from pathlib import Path

import redis
from celery.result import AsyncResult
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from celery_app import REDIS_URL, celery_app
from tasks import autofill_retry, requeue_failed, solve_captcha

UI_DIR = Path(__file__).resolve().parents[1] / "allocation-crawler-ui"

app = FastAPI(title="Allocation Apply Worker Bridge")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

rdb = redis.from_url(REDIS_URL)


class AutofillRequest(BaseModel):
    run_id: str
    job_id: str
    board: str
    user_id: str


class CaptchaRequest(AutofillRequest):
    code: str


class RequeueRequest(BaseModel):
    runs: list[dict]
    user_id: str


def _track(task_id: str, kind: str, run_id: str) -> None:
    rdb.hset(
        f"apply_task:{task_id}",
        mapping={
            "task_id": task_id,
            "kind": kind,
            "run_id": run_id,
            "created_at": datetime.utcnow().isoformat() + "Z",
        },
    )
    rdb.expire(f"apply_task:{task_id}", 60 * 60 * 24)
    rdb.lpush("apply_task_log", task_id)
    rdb.ltrim("apply_task_log", 0, 199)


@app.post("/enqueue/autofill")
def enqueue_autofill(req: AutofillRequest):
    res = autofill_retry.delay(req.run_id, req.job_id, req.board, req.user_id)
    _track(res.id, "autofill", req.run_id)
    return {"task_id": res.id, "state": res.state}


@app.post("/enqueue/captcha")
def enqueue_captcha(req: CaptchaRequest):
    if not req.code.strip():
        raise HTTPException(400, "code is required")
    res = solve_captcha.delay(req.run_id, req.job_id, req.board, req.user_id, req.code)
    _track(res.id, "captcha", req.run_id)
    return {"task_id": res.id, "state": res.state}


@app.post("/enqueue/requeue")
def enqueue_requeue(req: RequeueRequest):
    if not req.runs:
        raise HTTPException(400, "runs is required")
    res = requeue_failed.delay(req.runs, req.user_id)
    _track(res.id, "requeue", f"batch:{len(req.runs)}")
    return {"task_id": res.id, "state": res.state, "enqueued": len(req.runs)}


@app.get("/tasks")
def list_tasks():
    ids = [tid.decode() for tid in rdb.lrange("apply_task_log", 0, 99)]
    tasks = []
    for tid in ids:
        meta = {k.decode(): v.decode() for k, v in rdb.hgetall(f"apply_task:{tid}").items()}
        if not meta:
            continue
        ar = AsyncResult(tid, app=celery_app)
        meta["state"] = ar.state
        if ar.state in ("SUCCESS", "FAILURE") and ar.result is not None:
            meta["result"] = str(ar.result)[:400]
        tasks.append(meta)
    return {"tasks": tasks}


@app.get("/health")
def health():
    try:
        rdb.ping()
        return {"ok": True}
    except redis.RedisError as exc:
        raise HTTPException(503, f"redis unreachable: {exc}")


if UI_DIR.exists():
    app.mount("/", StaticFiles(directory=UI_DIR, html=True), name="ui")
