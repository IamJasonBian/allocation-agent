// Allocation Crawler — Apply Console
// Plain-JS single-page app. Talks to two backends:
//   1. Crawler API (read jobs/runs/users)
//   2. Worker bridge (POST autofill/captcha tasks onto Celery)

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const cfg = () => ({
  crawler: $("#crawler-api").value.replace(/\/$/, ""),
  worker: $("#worker-api").value.replace(/\/$/, ""),
  userId: $("#user-id").value.trim(),
});

async function j(url, opts = {}) {
  const r = await fetch(url, { headers: { "content-type": "application/json" }, ...opts });
  const text = await r.text();
  const body = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error(body?.error || `${r.status} ${r.statusText}`);
  return body;
}

function toast(msg, kind = "") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `show ${kind}`;
  setTimeout(() => (el.className = ""), 3000);
}

// ── Tabs ──
$$(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    $$(".panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${btn.dataset.tab}`));
    if (btn.dataset.tab === "failed") loadFailed();
    if (btn.dataset.tab === "queue") loadQueue();
  });
});

// ── Failed runs ──
async function loadFailed() {
  const { crawler, userId } = cfg();
  const board = $("#filter-board").value.trim();
  const tbody = $("#failed-table tbody");
  tbody.innerHTML = `<tr><td colspan="6">Loading…</td></tr>`;
  try {
    const url = new URL(`${crawler}/jobs`);
    url.searchParams.set("runs_for", "");
    if (userId) url.searchParams.set("user", userId);
    const data = await j(url.toString());
    const runs = (data.runs || data || []).filter((r) => r.status === "failed" && (!board || r.board === board));
    $("#failed-count").textContent = `${runs.length} failed run(s)`;
    if (!runs.length) {
      tbody.innerHTML = `<tr><td colspan="6">No failed runs. 🎉</td></tr>`;
      return;
    }
    tbody.innerHTML = runs.map(renderFailedRow).join("");
    $$("#failed-table button[data-action]").forEach(bindRowAction);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="error">${e.message}</td></tr>`;
  }
}

function renderFailedRow(r) {
  const art = r.artifacts || {};
  const shots = (art.screenshot_keys || []).length;
  const needsCaptcha = /captcha|verification|security code|recaptcha/i.test(r.error || "");
  return `<tr data-run="${r.run_id}" data-job="${r.job_id}" data-board="${r.board}">
    <td><code>${r.run_id}</code><br/><small>${new Date(r.started_at).toLocaleString()}</small></td>
    <td>${r.job_id}${art.notes ? `<br/><small>${art.notes}</small>` : ""}</td>
    <td>${r.board}</td>
    <td class="error">${escapeHtml(r.error || "")}</td>
    <td>${shots ? `${shots} screenshot(s)` : ""}${art.confirmation_url ? `<br/><a href="${art.confirmation_url}" target="_blank">confirmation</a>` : ""}</td>
    <td class="actions">
      <button data-action="autofill">Retry autofill</button>
      <button data-action="captcha" class="${needsCaptcha ? "" : "secondary"}">Solve captcha</button>
    </td>
  </tr>`;
}

function bindRowAction(btn) {
  btn.addEventListener("click", () => {
    const tr = btn.closest("tr");
    const payload = { run_id: tr.dataset.run, job_id: tr.dataset.job, board: tr.dataset.board };
    if (btn.dataset.action === "autofill") enqueueAutofill(payload);
    else if (btn.dataset.action === "captcha") openCaptcha(payload);
  });
}

async function enqueueAutofill(payload) {
  const { worker, userId } = cfg();
  try {
    const res = await j(`${worker}/enqueue/autofill`, {
      method: "POST",
      body: JSON.stringify({ ...payload, user_id: userId }),
    });
    toast(`Autofill enqueued — task ${res.task_id}`);
  } catch (e) {
    toast(`Enqueue failed: ${e.message}`, "error");
  }
}

let captchaPayload = null;
function openCaptcha(payload) {
  captchaPayload = payload;
  $("#captcha-context").textContent = `Run ${payload.run_id} · job ${payload.job_id} · ${payload.board}`;
  $("#captcha-code").value = "";
  $("#captcha-modal").showModal();
}

$("#captcha-submit").addEventListener("click", async (ev) => {
  ev.preventDefault();
  const code = $("#captcha-code").value.trim();
  if (!code || !captchaPayload) return;
  const { worker, userId } = cfg();
  try {
    const res = await j(`${worker}/enqueue/captcha`, {
      method: "POST",
      body: JSON.stringify({ ...captchaPayload, user_id: userId, code }),
    });
    toast(`Captcha enqueued — task ${res.task_id}`);
    $("#captcha-modal").close();
  } catch (e) {
    toast(`Enqueue failed: ${e.message}`, "error");
  }
});

$("#reload-failed").addEventListener("click", loadFailed);
$("#filter-board").addEventListener("change", loadFailed);

$("#requeue-all").addEventListener("click", async () => {
  if (!confirm("Requeue every failed run in the current view through Celery?")) return;
  const { worker, userId } = cfg();
  const rows = $$("#failed-table tbody tr[data-run]");
  const runs = rows.map((tr) => ({ run_id: tr.dataset.run, job_id: tr.dataset.job, board: tr.dataset.board }));
  try {
    const res = await j(`${worker}/enqueue/requeue`, {
      method: "POST",
      body: JSON.stringify({ runs, user_id: userId }),
    });
    toast(`Requeued ${res.enqueued} run(s)`);
  } catch (e) {
    toast(`Requeue failed: ${e.message}`, "error");
  }
});

// ── Profile ──
$("#load-profile").addEventListener("click", async () => {
  const { crawler, userId } = cfg();
  try {
    const data = await j(`${crawler}/users?id=${encodeURIComponent(userId)}`);
    const u = data.user || data;
    const form = $("#profile-form");
    const a = u.answers || {};
    Object.entries(a).forEach(([k, v]) => {
      const f = form.elements[k];
      if (f) f.value = v;
    });
    if (Array.isArray(u.tags)) form.elements.tags.value = u.tags.join(", ");
    $("#profile-status").textContent = "Loaded.";
  } catch (e) {
    $("#profile-status").textContent = `Load failed: ${e.message}`;
  }
});

$("#profile-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const { crawler, userId } = cfg();
  const form = ev.target;
  const answers = {};
  for (const el of form.elements) {
    if (!el.name || el.name === "tags") continue;
    answers[el.name] = el.value;
  }
  const tags = form.elements.tags.value.split(",").map((t) => t.trim()).filter(Boolean);
  try {
    await j(`${crawler}/users`, {
      method: "POST",
      body: JSON.stringify({ id: userId, answers, tags }),
    });
    $("#profile-status").textContent = "Saved.";
    toast("Profile saved");
  } catch (e) {
    $("#profile-status").textContent = `Save failed: ${e.message}`;
  }
});

// ── Queue status ──
async function loadQueue() {
  const { worker } = cfg();
  const tbody = $("#queue-table tbody");
  tbody.innerHTML = `<tr><td colspan="6">Loading…</td></tr>`;
  try {
    const data = await j(`${worker}/tasks`);
    const tasks = data.tasks || [];
    $("#queue-count").textContent = `${tasks.length} task(s)`;
    if (!tasks.length) {
      tbody.innerHTML = `<tr><td colspan="6">Queue is empty.</td></tr>`;
      return;
    }
    tbody.innerHTML = tasks.map((t) => `<tr>
      <td><code>${t.task_id}</code></td>
      <td>${t.kind}</td>
      <td>${t.run_id || ""}</td>
      <td><span class="pill ${t.state?.toLowerCase() || ""}">${t.state}</span></td>
      <td><small>${t.created_at || ""}</small></td>
      <td class="error">${escapeHtml(t.result || "")}</td>
    </tr>`).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="error">${e.message}</td></tr>`;
  }
}
$("#reload-queue").addEventListener("click", loadQueue);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Initial load
loadFailed();
