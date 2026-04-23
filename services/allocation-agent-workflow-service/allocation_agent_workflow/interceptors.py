"""Reusable interceptors for workflow lifecycle events."""
from __future__ import annotations

import logging
from typing import Any

from .mock_temporal import Interceptor


class LogFailureInterceptor(Interceptor):
    """Logs WORKFLOW OK / WORKFLOW FAILED to the root logger."""

    async def on_workflow_failed(self, workflow_id: str, run_id: str, error: str) -> None:
        logging.error("WORKFLOW FAILED %s/%s: %s", workflow_id, run_id, error)

    async def on_workflow_completed(self, workflow_id: str, run_id: str, result: Any) -> None:
        logging.info("WORKFLOW OK %s/%s  result=%s", workflow_id, run_id, result)
