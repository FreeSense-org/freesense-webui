/*
 * live.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * FS.live — the only scheduler (RULES R2: no setInterval in elements or pages).
 *
 *   const task = live.add({ id, every: 5, scope: 'page', run: () => Promise, onState(state, info) })
 *
 * One 1 s tick drives every task. A task never overlaps itself, backs off
 * exponentially on failure (max 5 min), pauses while the tab is hidden or the
 * user paused live updates, and reports 'loading' | 'ok' | 'stale' | 'error'.
 * live.clear('page') drops a page's tasks on partial navigation.
 */
import $ from 'jquery';

const tasks = new Map();
let paused = false;
let timer = null;

function setState(t, s, info = {}) {
	if (t.state === s && s !== 'ok') return;
	t.state = s;
	if (t.onState) t.onState(s, { lastOk: t.lastOk, failures: t.failures, ...info });
	$(document).trigger('fs:live-state', [t.id, s]);
}

function run(t) {
	if (t.busy) return;
	t.busy = true;
	if (!t.lastOk) setState(t, 'loading');
	let p;
	try { p = Promise.resolve(t.run()); } catch (e) { p = Promise.reject(e); }
	p.then(() => {
		t.failures = 0;
		t.retryAt = 0;
		t.lastOk = Date.now();
		setState(t, 'ok');
	}, (e) => {
		t.failures = Math.min((t.failures || 0) + 1, 8);
		t.retryAt = Date.now() + Math.min(Math.max(t.every, 1) * 1000 * 2 ** t.failures, 300000);
		setState(t, 'error', { error: (e && e.message) || String(e), retryAt: t.retryAt });
	}).finally(() => {
		t.busy = false;
		t.next = Date.now() + t.every * 1000;
	});
}

function tick() {
	const now = Date.now();
	if (!document.hidden && !paused) {
		for (const t of tasks.values()) {
			if (t.every <= 0) continue;
			if (t.retryAt && now < t.retryAt) continue;
			if (now >= (t.next || 0)) run(t);
			if (t.lastOk && t.state === 'ok' && now - t.lastOk > Math.max(t.every * 3000, 10000)) setState(t, 'stale');
		}
	}
	timer = setTimeout(tick, 1000);
}

function wakeAll() { for (const t of tasks.values()) t.next = 0; }

document.addEventListener('visibilitychange', () => { if (!document.hidden && !paused) wakeAll(); });

export const live = {
	add(o) {
		const t = { every: 5, scope: 'page', failures: 0, next: 0, ...o };
		tasks.set(t.id, t);
		if (!timer) timer = setTimeout(tick, 1000);
		run(t);
		return t;
	},
	remove(id) { tasks.delete(id); },
	now(id) { const t = tasks.get(id); if (t) run(t); },
	every(id, seconds) { const t = tasks.get(id); if (t) { t.every = seconds; t.next = 0; } },
	clear(scope) { for (const [id, t] of tasks) if (!scope || t.scope === scope) tasks.delete(id); },
	get paused() { return paused; },
	pause(v) {
		paused = v === undefined ? !paused : !!v;
		if (!paused) wakeAll();
		$(document).trigger('fs:live-paused', [paused]);
		return paused;
	},
	get size() { return tasks.size; }
};
