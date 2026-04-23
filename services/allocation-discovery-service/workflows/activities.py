"""Activities for allocation-discovery workflows."""
from __future__ import annotations

import asyncio
import json
import urllib.request

from allocation_agent_workflow import activity

_GH_BOARDS = "https://boards-api.greenhouse.io/v1/boards/{token}/jobs"


def _fetch_sync(token: str) -> list[dict]:
    with urllib.request.urlopen(_GH_BOARDS.format(token=token), timeout=10) as r:
        return json.load(r).get("jobs", [])


@activity.defn
async def fetch_board_activity(board_token: str, keywords: list[str], top: int) -> dict:
    jobs = await asyncio.to_thread(_fetch_sync, board_token)
    matches = []
    lowers = [k.lower() for k in keywords] if keywords else []
    for j in jobs:
        title = (j.get("title") or "").lower()
        if lowers and not any(k in title for k in lowers):
            continue
        matches.append({
            "company": board_token,
            "title": j.get("title"),
            "url": f"https://job-boards.greenhouse.io/{board_token}/jobs/{j['id']}",
            "platform": "greenhouse",
            "status": "discovered",
        })
        if len(matches) >= top:
            break
    return {"board": board_token, "total_fetched": len(jobs), "matched": matches}
