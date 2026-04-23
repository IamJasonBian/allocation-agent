"""Periodic Greenhouse board discovery workflow."""
from __future__ import annotations

import asyncio
from datetime import timedelta

from allocation_agent_workflow import RetryPolicy, workflow

from workflows.activities import fetch_board_activity

TASK_QUEUE = "job-discovery"

_FETCH_TIMEOUT = timedelta(seconds=30)
_FETCH_RETRY = RetryPolicy(maximum_attempts=3,
                           initial_interval=timedelta(seconds=5))


@workflow.defn
class GreenhouseBoardDiscoveryWorkflow:
    @workflow.run
    async def run(self, boards: list[str], keywords: list[str], top: int = 5) -> dict:
        tasks = [
            workflow.execute_activity(
                fetch_board_activity, args=(b, keywords, top),
                start_to_close_timeout=_FETCH_TIMEOUT,
                retry_policy=_FETCH_RETRY,
            )
            for b in boards
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        jobs: list[dict] = []
        per_board = {}
        errors = 0
        for b, r in zip(boards, results):
            if isinstance(r, Exception):
                errors += 1
                per_board[b] = {"error": repr(r)}
                continue
            per_board[b] = {"total_fetched": r["total_fetched"],
                            "matched": len(r["matched"])}
            jobs.extend(r["matched"])
        return {"jobs": jobs, "per_board": per_board, "errors": errors}
