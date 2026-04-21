"""In-process Temporal-shaped harness.

Mirrors the subset of the `temporalio` SDK that allocation-apply-worker needs:
decorators, RetryPolicy, Client, Worker, Interceptor. No server, no Redis.
Signatures intentionally track `temporalio.client.Client` / `temporalio.worker.Worker`
so swapping to the real SDK is a file swap, not a rewrite.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any, Callable

logger = logging.getLogger(__name__)


@dataclass
class RetryPolicy:
    maximum_attempts: int = 1
    initial_interval: timedelta = timedelta(seconds=1)
    backoff_coefficient: float = 2.0
    maximum_interval: timedelta = timedelta(seconds=60)


_activity_registry: dict[str, Callable] = {}
_workflow_registry: dict[str, type] = {}


class activity:
    @staticmethod
    def defn(fn: Callable) -> Callable:
        _activity_registry[fn.__name__] = fn
        fn.__activity__ = True
        return fn


class workflow:
    @staticmethod
    def defn(cls: type) -> type:
        _workflow_registry[cls.__name__] = cls
        cls.__workflow__ = True
        return cls

    @staticmethod
    def run(fn: Callable) -> Callable:
        fn.__workflow_run__ = True
        return fn

    @staticmethod
    async def execute_activity(
        fn: Callable,
        args: tuple | list = (),
        start_to_close_timeout: timedelta | None = None,
        retry_policy: RetryPolicy | None = None,
    ) -> Any:
        policy = retry_policy or RetryPolicy()
        delay = policy.initial_interval.total_seconds()
        last_err: Exception | None = None
        for attempt in range(1, policy.maximum_attempts + 1):
            try:
                coro = fn(*args)
                if start_to_close_timeout is not None:
                    return await asyncio.wait_for(coro, start_to_close_timeout.total_seconds())
                return await coro
            except Exception as exc:
                last_err = exc
                logger.warning("activity %s attempt %d/%d failed: %s",
                               fn.__name__, attempt, policy.maximum_attempts, exc)
                if attempt < policy.maximum_attempts:
                    await asyncio.sleep(delay)
                    delay = min(delay * policy.backoff_coefficient,
                                policy.maximum_interval.total_seconds())
        assert last_err is not None
        raise last_err


class Interceptor:
    async def on_workflow_failed(self, workflow_id: str, run_id: str, error: str) -> None: ...
    async def on_workflow_completed(self, workflow_id: str, run_id: str, result: Any) -> None: ...


@dataclass
class _Run:
    workflow_id: str
    run_id: str
    task_queue: str
    workflow_cls: type
    args: tuple
    status: str = "pending"
    result: Any = None
    error: str | None = None
    history: list[dict] = field(default_factory=list)
    done: asyncio.Event = field(default_factory=asyncio.Event)


class Client:
    def __init__(self) -> None:
        self._queues: dict[str, asyncio.Queue[_Run]] = {}
        self._runs: dict[str, _Run] = {}

    def _queue(self, name: str) -> asyncio.Queue[_Run]:
        q = self._queues.get(name)
        if q is None:
            q = asyncio.Queue()
            self._queues[name] = q
        return q

    async def start_workflow(
        self,
        cls_or_name: type | str,
        args: tuple | list = (),
        id: str | None = None,
        task_queue: str = "default",
    ) -> "WorkflowHandle":
        cls = cls_or_name if isinstance(cls_or_name, type) else _workflow_registry[cls_or_name]
        wid = id or f"{cls.__name__}-{uuid.uuid4().hex[:8]}"
        rid = uuid.uuid4().hex[:12]
        run = _Run(workflow_id=wid, run_id=rid, task_queue=task_queue,
                   workflow_cls=cls, args=tuple(args))
        self._runs[rid] = run
        await self._queue(task_queue).put(run)
        return WorkflowHandle(self, rid)

    def get_run(self, run_id: str) -> _Run:
        return self._runs[run_id]


class WorkflowHandle:
    def __init__(self, client: Client, run_id: str) -> None:
        self._client = client
        self._run_id = run_id

    @property
    def run_id(self) -> str:
        return self._run_id

    async def result(self, timeout: float | None = None) -> Any:
        run = self._client.get_run(self._run_id)
        await asyncio.wait_for(run.done.wait(), timeout)
        if run.status == "failed":
            raise RuntimeError(run.error)
        return run.result


class Worker:
    def __init__(
        self,
        client: Client,
        task_queue: str,
        workflows: list[type],
        activities: list[Callable] | None = None,
        interceptors: list[Interceptor] | None = None,
    ) -> None:
        self.client = client
        self.task_queue = task_queue
        self.workflows = {w.__name__: w for w in workflows}
        self.activities = {a.__name__: a for a in (activities or [])}
        self.interceptors = interceptors or []
        self._stop = asyncio.Event()

    async def run(self) -> None:
        q = self.client._queue(self.task_queue)
        logger.info("worker polling task_queue=%s", self.task_queue)
        while not self._stop.is_set():
            try:
                run = await asyncio.wait_for(q.get(), 0.5)
            except asyncio.TimeoutError:
                continue
            asyncio.create_task(self._execute(run))

    async def _execute(self, run: _Run) -> None:
        run.status = "running"
        try:
            inst = run.workflow_cls()
            run_method = next(
                getattr(inst, name) for name in dir(inst)
                if callable(getattr(inst, name, None))
                and getattr(getattr(inst, name), "__workflow_run__", False)
            )
            run.result = await run_method(*run.args)
            run.status = "completed"
            for ic in self.interceptors:
                try:
                    await ic.on_workflow_completed(run.workflow_id, run.run_id, run.result)
                except Exception:
                    logger.exception("interceptor failure")
        except Exception as exc:
            run.status = "failed"
            run.error = repr(exc)
            for ic in self.interceptors:
                try:
                    await ic.on_workflow_failed(run.workflow_id, run.run_id, run.error)
                except Exception:
                    logger.exception("interceptor failure")
        finally:
            run.done.set()

    def stop(self) -> None:
        self._stop.set()
