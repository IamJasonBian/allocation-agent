# pi + tmux distributed dev setup

This runbook describes how to run multiple parallel [pi](https://pi.dev) coding agent instances
using tmux — one per concern — for distributed development on this repo.

## Why pi + tmux

pi deliberately omits built-in sub-agents. The recommended pattern is to spawn independent pi
instances in tmux panes, each with its own session tree and context. This maps naturally to the
distributed bot architecture: stateless workers, no shared in-process state, full observability
in each pane.

## Prerequisites

```bash
npm install -g @mariozechner/pi-coding-agent
brew install tmux   # or: sudo apt install tmux
```

Configure at least one provider (e.g. Anthropic):
```bash
pi config  # sets ANTHROPIC_API_KEY or prompts for OAuth
```

## Session layout

```
┌─────────────────────────┬─────────────────────────┐
│  pane 0: webhook router │  pane 1: worker pool    │
│  pi (src/webhook/)      │  pi (src/workers/)      │
├─────────────────────────┼─────────────────────────┤
│  pane 2: Redis/sessions │  pane 3: logs / watch   │
│  pi (src/session/)      │  tail -f / redis-cli    │
└─────────────────────────┴─────────────────────────┘
```

## Quick start

```bash
# Create the session
tmux new-session -d -s alloc -x 220 -y 50

# Split into 4 panes (2x2)
tmux split-window -h -t alloc
tmux split-window -v -t alloc:0.0
tmux split-window -v -t alloc:0.1

# Start pi in each working pane
tmux send-keys -t alloc:0.0 'cd $(git rev-parse --show-toplevel) && pi' Enter
tmux send-keys -t alloc:0.2 'cd $(git rev-parse --show-toplevel) && pi' Enter
tmux send-keys -t alloc:0.1 'cd $(git rev-parse --show-toplevel) && pi' Enter

# Pane 3: observability (tail logs or redis-cli monitor)
tmux send-keys -t alloc:0.3 'redis-cli monitor' Enter

# Attach
tmux attach -t alloc
```

Or use the helper script:

```bash
bash scripts/tmux-dev.sh
```

## Per-pane AGENTS.md

pi loads `AGENTS.md` from the current directory upward. To give each pane focused context,
create sub-directory AGENTS.md files:

```
src/webhook/AGENTS.md   → "You are working on the webhook router only. ..."
src/workers/AGENTS.md   → "You are working on the worker pool only. ..."
src/session/AGENTS.md   → "You are working on Redis session management only. ..."
```

Each pi instance picks up the nearest AGENTS.md automatically, giving isolated context
per concern without shared state.

## Useful pi commands

| Command | Effect |
|---------|--------|
| `/tree` | Navigate session history tree |
| `/model` or `Ctrl+L` | Switch model mid-session |
| `Ctrl+P` | Cycle favourite models |
| `Enter` (mid-run) | Steer: inject message after current tool call |
| `Alt+Enter` (mid-run) | Follow-up: queue message until agent finishes |
| `/export` | Export session to HTML |
| `/share` | Upload to GitHub Gist, get shareable URL |

## Pane responsibilities

**Pane 0 — webhook router** (`src/webhook/` or equivalent)
Telegram webhook ingress: signature validation, rate limiting, fan-out to the message queue.
Reference `REDIS_SCHEMA_AND_API_FLOWS.md` for queue key names.

**Pane 1 — worker pool** (`src/workers/`)
Stateless worker logic: dequeue, load Redis session, call Claude API, send Telegram reply,
write session back.

**Pane 2 — Redis / session manager** (`src/session/`)
Session key schema, TTL policy, compaction logic. Keep aligned with
`REDIS_SCHEMA_AND_API_FLOWS.md`.

**Pane 3 — observability**
Not a pi pane. Run `redis-cli monitor`, `tail -f` logs, or a queue-depth watch:
```bash
watch -n2 'redis-cli xlen crane:events:raw_listings'
```

## Tips

- Each pi instance has its own independent session tree — branching in one pane does not affect
  others.
- Use `pi -p "summarise what changed in src/workers/ in the last hour"` from a spare pane for
  cross-cutting queries without polluting any working session.
- If a pane gets context-heavy, use pi's built-in compaction (`/compact`) or restart with a
  fresh `pi` — task state lives in files, not in the session.
