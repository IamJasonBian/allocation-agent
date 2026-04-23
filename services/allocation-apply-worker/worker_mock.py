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

    # Fan-out across greenhouse rows from a seeds file, dry-run
    python worker_mock.py --seeds=../../runbooks/job_seeds.json --dry-run
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
import sys
from pathlib import Path

# Dev fallback: let `python worker_mock.py` work without needing
# `pip install -e ../allocation-agent-workflow-service` first.
_WORKFLOW_PKG = (
    Path(__file__).resolve().parents[1] / "allocation-agent-workflow-service"
)
if _WORKFLOW_PKG.is_dir() and str(_WORKFLOW_PKG) not in sys.path:
    sys.path.insert(0, str(_WORKFLOW_PKG))

from allocation_agent_workflow import Client, LogFailureInterceptor, Worker  # noqa: E402

from workflows.activities import autofill_activity, captcha_activity  # noqa: E402
from workflows.apply_recovery import (  # noqa: E402
    TASK_QUEUE,
    AutofillRetryWorkflow,
    RequeueFailedWorkflow,
    SolveCaptchaWorkflow,
)

_GH_URL = re.compile(r"https://job-boards\.greenhouse\.io/([^/]+)/jobs/(\d+)")


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


def _load_greenhouse_seeds(path: Path) -> list[dict]:
    data = json.loads(path.read_text())
    runs: list[dict] = []
    for j in data.get("jobs", []):
        if j.get("platform") != "greenhouse":
            continue
        m = _GH_URL.match(j.get("url", ""))
        if not m:
            continue
        board, job_id = m.group(1), m.group(2)
        company = j.get("company", "")
        slug = re.sub(r"\W+", "-", company).strip("-").lower() or "job"
        runs.append({
            "run_id": f"seeds-{slug}-{job_id}",
            "job_id": job_id,
            "board": board,
            "_company": company,
            "_title": j.get("title", ""),
            "_status": j.get("status", "?"),
        })
    return runs


async def _run_single(client: Client, args: argparse.Namespace) -> int:
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


async def _run_seeds(client: Client, args: argparse.Namespace) -> int:
    runs = _load_greenhouse_seeds(Path(args.seeds))
    if not runs:
        logging.error("no greenhouse rows parsed from %s", args.seeds)
        return 2
    logging.info("feeding %d greenhouse rows from %s (dry_run=%s):",
                 len(runs), args.seeds, args.dry_run)
    for r in runs:
        logging.info("  %-40s  board=%-24s  job_id=%s  [%s]",
                     (r["_company"] + ": " + r["_title"])[:40],
                     r["board"], r["job_id"], r["_status"])

    handle = await client.start_workflow(
        RequeueFailedWorkflow,
        args=[runs, args.user, args.dry_run],
        task_queue=TASK_QUEUE,
    )
    try:
        result = await handle.result(timeout=args.timeout)
        logging.info("fan-out result: %s", result)
        return 0 if result.get("failed", 0) == 0 else 1
    except RuntimeError as exc:
        logging.error("workflow failed: %s", exc)
        return 1
    except asyncio.TimeoutError:
        logging.error("handle.result timed out after %ds", args.timeout)
        return 2


async def _run(args: argparse.Namespace) -> int:
    client = Client()
    worker = build_worker(client)
    worker_task = asyncio.create_task(worker.run())
    try:
        if args.seeds:
            return await _run_seeds(client, args)
        return await _run_single(client, args)
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
    p.add_argument("--seeds", default=None,
                   help="Path to a seeds JSON file (e.g. ../../runbooks/job_seeds.json). "
                        "When set, greenhouse rows fan-out through RequeueFailedWorkflow; "
                        "--job-id/--board are ignored.")
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
