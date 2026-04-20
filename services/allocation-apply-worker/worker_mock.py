"""Local Temporal-shaped worker for allocation-apply recovery.

Runs entirely in-process — no Redis, no Temporal server. Same surface as
alpha's worker.py: Client + Worker(task_queue, workflows, activities,
interceptors).

Usage:
    # Default: fake demo inputs, exercises retry + failure path
    python worker_mock.py

    # Real job/board in dry-run mode (script says "would apply" and exits 0)
    python worker_mock.py --job-id=1234567 --board=williamblair --dry-run

    # Live submission (uses the Puppeteer pipeline — will actually apply)
    python worker_mock.py --job-id=1234567 --board=williamblair --live
"""
from __future__ import annotations

import argparse
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
        logging.info("WORKFLOW OK %s/%s  result=%s", wid, rid, result)


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


async def _run(args: argparse.Namespace) -> int:
    client = Client()
    worker = build_worker(client)
    worker_task = asyncio.create_task(worker.run())
    try:
        logging.info(
            "starting AutofillRetryWorkflow  run_id=%s job_id=%s board=%s user=%s dry_run=%s",
            args.run_id, args.job_id, args.board, args.user, args.dry_run,
        )
        handle = await client.start_workflow(
            AutofillRetryWorkflow,
            args=[args.run_id, args.job_id, args.board, args.user, args.dry_run],
            task_queue=TASK_QUEUE,
        )
        try:
            result = await handle.result(timeout=args.timeout)
            logging.info("result: %s", result)
            return 0
        except RuntimeError as exc:
            logging.error("workflow failed after retries: %s", exc)
            return 1
        except asyncio.TimeoutError:
            logging.error("handle.result timed out after %ds (retry cycle still running)", args.timeout)
            return 2
    finally:
        worker.stop()
        worker_task.cancel()


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Run a single AutofillRetryWorkflow through the mock Temporal harness.",
    )
    p.add_argument("--run-id", default="demo-run")
    p.add_argument("--job-id", default="demo-job",
                   help="Greenhouse job id. Fake value → activity fails, retry loop fires.")
    p.add_argument("--board", default="demo-board",
                   help="Greenhouse board token.")
    p.add_argument("--user", default="aastha.aggarwal1@gmail.com",
                   help="User id (email). Aastha resolves from a local profile; "
                        "other users hit the crawler /users endpoint.")
    p.add_argument("--timeout", type=int, default=120,
                   help="Seconds to wait for completion. Covers 3 attempts @ 30s backoff (~96s).")
    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", dest="dry_run", action="store_true",
                      help="Pass --dry-run to the apply script (safe for real job ids).")
    mode.add_argument("--live", dest="dry_run", action="store_false",
                      help="Actually submit via Puppeteer (default when no mode is set).")
    p.set_defaults(dry_run=False)
    return p.parse_args(argv)


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    sys.exit(asyncio.run(_run(_parse_args())))


if __name__ == "__main__":
    main()
