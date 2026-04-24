"""Dev-mode bootstrap — see allocation-apply-worker/workflows/__init__.py."""
from __future__ import annotations

import sys
from pathlib import Path

_WORKFLOW_PKG = (
    Path(__file__).resolve().parents[2] / "allocation-agent-workflow-service"
)
if _WORKFLOW_PKG.is_dir() and str(_WORKFLOW_PKG) not in sys.path:
    sys.path.insert(0, str(_WORKFLOW_PKG))
