"""Local Temporal-shaped worker for allocation-apply recovery.

Runs entirely in-process — no Redis, no Temporal server. Equivalent surface
to worker.py in alpha: Client + Worker(task_queue, workflows, activities,
interceptors), plus a sample kick so `python worker_mock.py` smoke-tests
the whole loop.
"""
from __future__ import annotations

import asyncio
import logging
import sys

from mock_temporal import Client, Interceptor, Worker
from workflows.activities import autofill_activity, captcha_activity
from workflows.apply_recovery import (
    TASK_QUEUE,
    AutofillRetryWorkflow,
    RequeueFailedWorkflow,
    SolveCaptchaWorkflow,
)


class LogFailureInterceptor(Interceptor):
    async def on_workflow_failed(self, wid: str, rid: str, error: str) -> None:
        logging.error("WORKFLOW FAILED %s/%s: %s", wid, rid, error)

    async def on_workflow_completed(self, wid: str, rid: str, result) -> None:
        logging.info("WORKFLOW OK %s/%s", wid, rid)


def build_worker(client: Client) -> Worker:
    return Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[
            AutofillRetryWorkflow,
            SolveCaptchaWorkflow,
            RequeueFailedWorkflow,
        ],
        activities=[autofill_activity, captcha_activity],
        interceptors=[LogFailureInterceptor()],
    )


async def _demo() -> int:
    client = Client()
    worker = build_worker(client)
    worker_task = asyncio.create_task(worker.run())
    try:
        handle = await client.start_workflow(
            AutofillRetryWorkflow,
            args=["run-1", "demo-job", "greenhouse", "demo-user"],
            task_queue=TASK_QUEUE,
        )
        try:
            result = await handle.result(timeout=30)
            logging.info("demo result: %s", result)
            return 0
        except (RuntimeError, asyncio.TimeoutError) as exc:
            logging.error("demo failed (expected without NODE_BIN/script): %s", exc)
            return 1
    finally:
        worker.stop()
        worker_task.cancel()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    sys.exit(asyncio.run(_demo()))
