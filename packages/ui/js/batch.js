/*
 * batch.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * FS.batch — collect GET requests made in the same tick and send them as one
 * POST /api/v1/batch, because php-fpm has only a few workers on small boxes.
 *
 *   batch.get('/status/gateways') -> Promise<{data, meta}>
 *
 * Requests queue for one animation frame, then go out as one call
 * ([{id, method, path}] → [{id, status, body}]). If the backend has no
 * batch route yet (404/405), FS.batch switches to plain parallel requests
 * for the rest of the session. At most `maxInFlight` requests run at once.
 * Identical GETs in one tick share a request, and a tick with more than
 * `maxBatch` (the server's limit) goes out as several batch calls.
 */
import { api, url } from './api.js';

const state = { queue: [], scheduled: false, supported: true, inFlight: 0, waiting: [] };
const maxInFlight = 2;
const maxBatch = 20;

function slot() {
	if (state.inFlight < maxInFlight) { state.inFlight++; return Promise.resolve(); }
	return new Promise((resolve) => state.waiting.push(resolve)).then(() => { state.inFlight++; });
}
function release() {
	state.inFlight--;
	const next = state.waiting.shift();
	if (next) next();
}

function settle(item, res) {
	if (res.status >= 200 && res.status < 300) item.resolve(res.body || {});
	else {
		const e = (res.body && res.body.error) || {};
		item.reject({ status: res.status, code: e.code || 'error', message: e.message || 'The request failed.', fields: (e.details && e.details.fields) || null });
	}
}

async function flush() {
	state.scheduled = false;
	const queued = state.queue.splice(0);
	if (!queued.length) return;
	/* One request per distinct URL; every caller gets its result. */
	const groups = new Map();
	for (const it of queued) {
		const key = url(it.path, it.query);
		if (!groups.has(key)) groups.set(key, { path: it.path, query: it.query, callers: [] });
		groups.get(key).callers.push(it);
	}
	const fan = (g) => ({ path: g.path, query: g.query, callers: g.callers,
		/* Each caller gets its own copy, so one element changing its data cannot affect another. */
		resolve: (v) => g.callers.forEach((c, i) => c.resolve(i ? structuredClone(v) : v)), reject: (e) => g.callers.forEach((c) => c.reject(e)) });
	const items = [...groups.values()].map(fan);
	const chunks = [];
	for (let i = 0; i < items.length; i += maxBatch) chunks.push(items.slice(i, i + maxBatch));
	await Promise.all(chunks.map(send));
}

async function send(items) {
	if (!state.supported || items.length === 1) {
		await Promise.all(items.map(async (it) => {
			await slot();
			try { it.resolve(await api.get(it.path, it.query)); } catch (e) { it.reject(e); } finally { release(); }
		}));
		return;
	}
	await slot();
	try {
		const res = await api.post('/batch', { requests: items.map((it, i) => ({ id: String(i), method: 'GET', path: url(it.path, it.query) })) });
		const byId = Object.fromEntries((res.data || []).map((r) => [r.id, r]));
		items.forEach((it, i) => settle(it, byId[String(i)] || { status: 502, body: { error: { message: 'Missing batch result.' } } }));
	} catch (e) {
		if (e.status === 404 || e.status === 405) {
			state.supported = false;
			state.queue.unshift(...items.flatMap((it) => it.callers));
			schedule();
		} else items.forEach((it) => it.reject(e));
	} finally { release(); }
}

function schedule() {
	if (state.scheduled) return;
	state.scheduled = true;
	/* Next frame, with a timer fallback: frames do not run in background tabs. */
	let done = false;
	const once = () => { if (!done) { done = true; flush(); } };
	if (typeof requestAnimationFrame === 'function' && !document.hidden) requestAnimationFrame(once);
	setTimeout(once, 50);
}

export const batch = {
	get(path, query) {
		return new Promise((resolve, reject) => {
			state.queue.push({ path, query, resolve, reject });
			schedule();
		});
	},
	get supported() { return state.supported; }
};
