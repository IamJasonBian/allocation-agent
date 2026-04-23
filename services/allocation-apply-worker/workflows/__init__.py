"""Dev-mode bootstrap: ensure allocation-agent-workflow-service is importable.

If the sibling service dir exists and isn't already on sys.path, prepend it so
activities.py / apply_recovery.py can `from allocation_agent_workflow import ...`
without requiring `pip install -e ../allocation-agent-workflow-service` first.
"""
from __future__ import annotations

import sys
from pathlib import Path

_WORKFLOW_PKG = (
    Path(__file__).resolve().parents[2] / "allocation-agent-workflow-service"
)
if _WORKFLOW_PKG.is_dir() and str(_WORKFLOW_PKG) not in sys.path:
    sys.path.insert(0, str(_WORKFLOW_PKG))
