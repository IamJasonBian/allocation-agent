# allocation-agent — pi AGENTS.md

This file is auto-loaded by [pi](https://pi.dev) at startup. It defines the project context,
working conventions, and tmux session layout for local development with distributed pi instances.

## Project overview

`allocation-agent` is a Greenhouse auto-apply agent with job tracking, email verification, and
Netlify Blobs / Redis state storage. It also serves as the host repo for distributed Claude
Telegram bot infrastructure (message queue, worker pool, Redis session management).

## Key files

- `src/` — core agent logic (JS/TS/Python)
- `runbooks/` — operational guides and architecture docs
- `REDIS_SCHEMA_AND_API_FLOWS.md` — Redis key schema and API flow reference
- `CLAUDE.md` — Claude Code project instructions
- `.env.example` — required environment variables

## Coding conventions

- Prefer diffs over full rewrites; inline over helper variables when possible
- Minimal, clean code — no unnecessary abstraction
- Python: use type hints; JS/TS: prefer `const`, avoid `var`
- Commit messages: imperative mood, ≤72 chars subject line

## Working with this project

Always read `REDIS_SCHEMA_AND_API_FLOWS.md` before touching any Redis key logic.
Always read `CLAUDE.md` before starting a new task.
When adding a new runbook, drop it in `runbooks/` as a markdown file.

## tmux session layout

See `runbooks/pi-tmux-dev.md` for the recommended multi-pane pi setup.
