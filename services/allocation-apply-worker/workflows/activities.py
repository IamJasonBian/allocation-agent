"""Activities for allocation-apply workflows.

Each activity wraps the existing Puppeteer apply script. Async variant of
tasks.py::_run_script so the workflow can await it and the mock harness can
apply per-call timeouts via asyncio.wait_for.
"""
from __future__ import annotations

import asyncio
import os
from pathlib import Path

from mock_temporal import activity

REPO_ROOT = Path(__file__).resolve().parents[3]
APPLY_SCRIPT = REPO_ROOT / "scripts" / "batch-browser-apply-aastha.mjs"
NODE_BIN = os.environ.get("NODE_BIN", "node")
CRAWLER_API = os.environ.get(
    "CRAWLER_API", "https://allocation-crawler-service.netlify.app/api/crawler"
)


async def _run_script(job_id: str, board: str, user_id: str,
                      extra_env: dict | None = None,
                      dry_run: bool = False) -> dict:
    env = {**os.environ, "CRAWLER_API": CRAWLER_API, **(extra_env or {})}
    script_args = [
        f"--job-id={job_id}", f"--board={board}", f"--user={user_id}",
    ]
    if dry_run:
        script_args.append("--dry-run")
    proc = await asyncio.create_subprocess_exec(
        NODE_BIN, str(APPLY_SCRIPT), *script_args,
        cwd=str(REPO_ROOT), env=env,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    out, err = stdout.decode(), stderr.decode()
    if proc.returncode != 0:
        raise RuntimeError(f"script exited {proc.returncode}: {err.strip()[:500]}")
    return {"stdout": out[-2000:], "stderr": err[-2000:], "code": 0, "dry_run": dry_run}


@activity.defn
async def autofill_activity(job_id: str, board: str, user_id: str,
                            dry_run: bool = False) -> dict:
    return await _run_script(job_id, board, user_id, dry_run=dry_run)


@activity.defn
async def captcha_activity(job_id: str, board: str, user_id: str,
                           code: str, dry_run: bool = False) -> dict:
    return await _run_script(job_id, board, user_id,
                             extra_env={"SECURITY_CODE": code}, dry_run=dry_run)
