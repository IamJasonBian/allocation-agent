#!/usr/bin/env bash
# Start a 4-pane tmux dev session for allocation-agent.
# Usage: bash scripts/tmux-dev.sh

SESSION="alloc"
ROOT="$(git rev-parse --show-toplevel)"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Session '$SESSION' already exists. Attaching..."
  tmux attach -t "$SESSION"
  exit 0
fi

tmux new-session  -d -s "$SESSION" -x 220 -y 50 -c "$ROOT"
tmux split-window -h -t "$SESSION"               -c "$ROOT"
tmux split-window -v -t "$SESSION:0.0"           -c "$ROOT"
tmux split-window -v -t "$SESSION:0.1"           -c "$ROOT"

# Pane 0: webhook router
tmux send-keys -t "$SESSION:0.0" 'pi' Enter

# Pane 2: worker pool
tmux send-keys -t "$SESSION:0.2" 'pi' Enter

# Pane 1: Redis / session manager
tmux send-keys -t "$SESSION:0.1" 'pi' Enter

# Pane 3: observability
tmux send-keys -t "$SESSION:0.3" \
  'echo "Tip: redis-cli monitor  |  tail -f logs  |  watch -n2 xlen crane:events:raw_listings"' Enter

tmux attach -t "$SESSION"
