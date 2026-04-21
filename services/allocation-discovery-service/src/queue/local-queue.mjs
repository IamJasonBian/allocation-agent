/**
 * In-memory crawl queue with per-host politeness.
 *
 * Shape:
 *   enqueue({ host, url, ats, boardToken, priority, meta })
 *   dequeue() → item | null   (returns the next item whose host cooldown elapsed)
 *   markDone(item, { ok, durationMs })
 *
 * Politeness:
 *   Each `host` has a crawl_delay (default 2000ms). Items for hosts that
 *   haven't cleared their cooldown are skipped and re-checked on the next
 *   dequeue() call. Items are otherwise processed highest priority first,
 *   then round-robin across hosts so no single host monopolizes workers.
 *
 * The queue is deliberately not a library — it's local, in-memory, and built
 * to be swapped for BullMQ / Celery / SQS when we move off the laptop.
 */

export class LocalQueue {
  constructor({ defaultHostDelayMs = 2000, hostDelays = {} } = {}) {
    this.defaultHostDelayMs = defaultHostDelayMs;
    this.hostDelays = { ...hostDelays };
    // per-host FIFO of items, keyed by host
    this.byHost = new Map();
    // host -> { nextReadyAt: epochMs, lastAttemptAt }
    this.hostState = new Map();
    this.stats = { enqueued: 0, dequeued: 0, done: 0, failed: 0 };
  }

  delayFor(host) {
    return this.hostDelays[host] ?? this.defaultHostDelayMs;
  }

  size() {
    let n = 0;
    for (const q of this.byHost.values()) n += q.length;
    return n;
  }

  hosts() {
    return Array.from(this.byHost.keys());
  }

  enqueue(item) {
    if (!item || !item.host) throw new Error("enqueue: item.host required");
    const host = item.host;
    const entry = { ...item, priority: Number(item.priority ?? 0), enqueuedAt: Date.now() };
    if (!this.byHost.has(host)) this.byHost.set(host, []);
    const q = this.byHost.get(host);
    // keep the per-host queue sorted by priority desc so we pick the
    // highest-priority item when a host becomes ready.
    q.push(entry);
    q.sort((a, b) => b.priority - a.priority);
    this.stats.enqueued++;
    return entry;
  }

  /**
   * Return the next item ready to be processed, or null if every host is on
   * cooldown. Round-robin across ready hosts.
   */
  dequeue(now = Date.now()) {
    const readyHosts = [];
    for (const [host, q] of this.byHost.entries()) {
      if (!q.length) continue;
      const state = this.hostState.get(host) || {};
      const nextReadyAt = state.nextReadyAt || 0;
      if (now >= nextReadyAt) readyHosts.push({ host, priority: q[0].priority });
    }
    if (!readyHosts.length) return null;
    // highest head-priority wins; tie-break on least-recently-attempted.
    readyHosts.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const la = this.hostState.get(a.host)?.lastAttemptAt || 0;
      const lb = this.hostState.get(b.host)?.lastAttemptAt || 0;
      return la - lb;
    });
    const host = readyHosts[0].host;
    const item = this.byHost.get(host).shift();
    const state = this.hostState.get(host) || {};
    state.lastAttemptAt = now;
    // schedule the cooldown now — we don't wait for markDone. This matches
    // the blog's "crawl_delay" semantics: interval between request starts.
    state.nextReadyAt = now + this.delayFor(host);
    this.hostState.set(host, state);
    this.stats.dequeued++;
    return item;
  }

  markDone(item, { ok = true, durationMs = 0 } = {}) {
    if (ok) this.stats.done++;
    else this.stats.failed++;
    const host = item.host;
    const state = this.hostState.get(host) || {};
    state.lastDurationMs = durationMs;
    // on failure we could extend the cooldown — keep simple for now, just
    // log durationMs for observability.
    this.hostState.set(host, state);
  }

  /**
   * How long until *some* host is ready. Useful for the runner to sleep
   * instead of spinning when every host is on cooldown.
   */
  msUntilReady(now = Date.now()) {
    let min = Infinity;
    for (const [host, q] of this.byHost.entries()) {
      if (!q.length) continue;
      const nextReadyAt = this.hostState.get(host)?.nextReadyAt || 0;
      const wait = Math.max(0, nextReadyAt - now);
      if (wait < min) min = wait;
    }
    return Number.isFinite(min) ? min : 0;
  }
}
