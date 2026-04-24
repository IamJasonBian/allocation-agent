"""Worker entry point for allocation-discovery-service.

Second consumer of allocation-agent-workflow-service: registers the
GreenhouseBoardDiscoveryWorkflow on task_queue="job-discovery" (distinct
from allocation-apply-worker's "apply-recovery" queue).

Usage:
    python worker_discovery.py --boards=williamblair,anthropic \
        --keywords=engineer,analyst --top=5 \
        --out=/tmp/discovered_seeds.json
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

_WORKFLOW_PKG = (
    Path(__file__).resolve().parents[1] / "allocation-agent-workflow-service"
)
if _WORKFLOW_PKG.is_dir() and str(_WORKFLOW_PKG) not in sys.path:
    sys.path.insert(0, str(_WORKFLOW_PKG))

from allocation_agent_workflow import Client, LogFailureInterceptor, Worker  # noqa: E402

from workflows.activities import fetch_board_activity  # noqa: E402
from workflows.discovery import (  # noqa: E402
    TASK_QUEUE,
    GreenhouseBoardDiscoveryWorkflow,
)


def build_worker(client: Client) -> Worker:
    return Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[GreenhouseBoardDiscoveryWorkflow],
        activities=[fetch_board_activity],
        interceptors=[LogFailureInterceptor()],
    )


async def _run(args: argparse.Namespace) -> int:
    client = Client()
    worker = build_worker(client)
    worker_task = asyncio.create_task(worker.run())
    try:
        boards = [b.strip() for b in args.boards.split(",") if b.strip()]
        keywords = [k.strip() for k in args.keywords.split(",") if k.strip()] if args.keywords else []
        logging.info("discovering boards=%s keywords=%s top=%d", boards, keywords, args.top)
        handle = await client.start_workflow(
            GreenhouseBoardDiscoveryWorkflow,
            args=[boards, keywords, args.top],
            task_queue=TASK_QUEUE,
        )
        result = await handle.result(timeout=args.timeout)
        logging.info("per-board: %s", result["per_board"])
        logging.info("total matched: %d (errors: %d)", len(result["jobs"]), result["errors"])

        out = Path(args.out)
        out.write_text(json.dumps({"jobs": result["jobs"]}, indent=2))
        logging.info("wrote %s (%d jobs) — feed to apply-worker with --seeds=%s",
                     out, len(result["jobs"]), out)
        return 0 if result["errors"] == 0 else 1
    finally:
        worker.stop()
        worker_task.cancel()


def main() -> None:
    p = argparse.ArgumentParser(description="Discover Greenhouse jobs into a seeds file.")
    p.add_argument("--boards", required=True,
                   help="Comma-separated Greenhouse board tokens (e.g. williamblair,anthropic).")
    p.add_argument("--keywords", default="",
                   help="Comma-separated title substrings to filter (case-insensitive). Empty = all.")
    p.add_argument("--top", type=int, default=5, help="Max matches per board.")
    p.add_argument("--out", default="/tmp/discovered_seeds.json")
    p.add_argument("--timeout", type=int, default=60)
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    sys.exit(asyncio.run(_run(p.parse_args())))


if __name__ == "__main__":
    main()
