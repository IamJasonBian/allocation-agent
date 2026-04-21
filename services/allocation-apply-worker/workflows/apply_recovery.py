"""Workflow versions of the Celery apply-worker tasks.

Matches the Celery semantics in tasks.py:
  - autofill_retry:  max_retries=2 → maximum_attempts=3, backoff 30s
  - solve_captcha:   max_retries=0 → maximum_attempts=1
  - requeue_failed:  fan-out over a list of failed runs
"""
from __future__ import annotations

import asyncio
from datetime import timedelta

from mock_temporal import RetryPolicy, workflow
from workflows.activities import autofill_activity, captcha_activity

TASK_QUEUE = "apply-recovery"

_AUTOFILL_TIMEOUT = timedelta(seconds=600)
_AUTOFILL_RETRY = RetryPolicy(maximum_attempts=3,
                              initial_interval=timedelta(seconds=30))


@workflow.defn
class AutofillRetryWorkflow:
    @workflow.run
    async def run(self, run_id: str, job_id: str, board: str,
                  user_id: str, dry_run: bool = False) -> dict:
        result = await workflow.execute_activity(
            autofill_activity, args=(job_id, board, user_id, dry_run),
            start_to_close_timeout=_AUTOFILL_TIMEOUT,
            retry_policy=_AUTOFILL_RETRY,
        )
        return {"run_id": run_id, "user_id": user_id, "ok": True, **result}


@workflow.defn
class SolveCaptchaWorkflow:
    @workflow.run
    async def run(self, run_id: str, job_id: str, board: str,
                  user_id: str, code: str, dry_run: bool = False) -> dict:
        result = await workflow.execute_activity(
            captcha_activity, args=(job_id, board, user_id, code, dry_run),
            start_to_close_timeout=_AUTOFILL_TIMEOUT,
            retry_policy=RetryPolicy(maximum_attempts=1),
        )
        return {"run_id": run_id, "user_id": user_id, "ok": True, **result}


@workflow.defn
class RequeueFailedWorkflow:
    @workflow.run
    async def run(self, runs: list[dict], user_id: str,
                  dry_run: bool = False) -> dict:
        tasks = [
            workflow.execute_activity(
                autofill_activity,
                args=(r["job_id"], r["board"], user_id, dry_run),
                start_to_close_timeout=_AUTOFILL_TIMEOUT,
                retry_policy=_AUTOFILL_RETRY,
            )
            for r in runs
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        ok = sum(1 for r in results if not isinstance(r, Exception))
        return {"attempted": len(runs), "ok": ok, "failed": len(runs) - ok}
