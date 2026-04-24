# allocation-agent-workflow-service

In-process, Temporal-shaped workflow harness shared across allocation-agent
Python services. Mirrors the subset of the `temporalio` SDK that alpha's
`worker.py` uses — `Client`, `Worker`, `workflow.defn`, `activity.defn`,
`RetryPolicy`, `Interceptor` — so consumers can write workflows once and
swap between this mock (local dev / tests) and the real SDK (production) with
a one-line import change.

## Why

Temporal server is operationally heavy for dev laptops. Celery-style job
queues give you retry but not durable workflow state. This service is a
pragmatic middle ground: faithful enough to Temporal's surface that the
mental model and code both port, lightweight enough to run as a single
Python process with zero external deps.

## Public API

```python
from allocation_agent_workflow import (
    Client, Worker, WorkflowHandle,
    workflow, activity, RetryPolicy, Interceptor,
    LogFailureInterceptor,
)
```

Signatures match `temporalio.client.Client` / `temporalio.worker.Worker` /
`temporalio.common.RetryPolicy`. Consumers define workflows and activities
using the `workflow.defn` / `activity.defn` decorators, spin up a `Worker`
against a `task_queue`, and trigger runs with `client.start_workflow(...)`.

## Consumers

- `services/allocation-apply-worker` — apply-recovery workflows
  (`AutofillRetryWorkflow`, `SolveCaptchaWorkflow`, `RequeueFailedWorkflow`)

## Install (editable)

```bash
pip install -e services/allocation-agent-workflow-service
```

Services that prefer not to install can add the directory to `sys.path` at
bootstrap — see `services/allocation-apply-worker/worker_mock.py` for an
example.

## Not included

- Persistence across restarts (workflow state lives in `Client._runs` dict)
- Determinism enforcement on workflow code
- Signals, child workflows, continue-as-new
- A UI

If you hit the limits of the mock, the migration is: replace
`from allocation_agent_workflow import ...` with `from temporalio import ...`
and stand up a Temporal server + backing DB.
