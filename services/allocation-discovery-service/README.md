# allocation-discovery-service

Second consumer of `allocation-agent-workflow-service`. Runs periodic
workflows that crawl public Greenhouse board APIs, filter roles by
keyword, and emit a seeds-shaped JSON the apply worker can then feed
to `RequeueFailedWorkflow`.

## Topology

```
worker_discovery.py               # entry point
    └─ Worker(task_queue="job-discovery", ...)
          └─ GreenhouseBoardDiscoveryWorkflow
                └─ fetch_board_activity × N  (asyncio.gather)
```

Separate task queue (`job-discovery`) from the apply worker's
`apply-recovery` queue — both workers poll their own queue against
the same in-process `Client`, proving queue isolation.

## Usage

```bash
python worker_discovery.py --boards=williamblair,anthropic --keywords=engineer,analyst --top=5
```

Writes results to `/tmp/discovered_seeds.json` in the same shape as
`runbooks/job_seeds.json` — directly consumable by
`allocation-apply-worker`'s `--seeds=<path>` flag.

## Why this matters for the PR

Demonstrates that `allocation-agent-workflow-service` really is a
shared component: a second service, in a different directory, on a
different task queue, defines its own workflows + activities and
registers them against the same `Client`/`Worker` primitives — zero
code duplication with `allocation-apply-worker`.
