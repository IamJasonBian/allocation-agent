"""Public API for the in-process Temporal-shaped workflow harness.

Signatures mirror the `temporalio` SDK subset used by alpha's worker.py.
Import from this package; the shim file layout below is an implementation
detail.
"""
from .mock_temporal import (
    Client,
    Interceptor,
    RetryPolicy,
    Worker,
    WorkflowHandle,
    activity,
    workflow,
)
from .interceptors import LogFailureInterceptor

__all__ = [
    "Client",
    "Interceptor",
    "LogFailureInterceptor",
    "RetryPolicy",
    "Worker",
    "WorkflowHandle",
    "activity",
    "workflow",
]
