/*
 * job.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * job — runs and follows a long operation (update, package install, backup)
 * through GET /v1/jobs/{id}: title, progress, current step, elapsed time and
 * a live log (console element, line cursor ?after=). The job id is kept in
 * the URL (?job=), so the view survives a reload (RULES R3). While the
 * firewall is unreachable (reboot, 5xx, network) it shows "Waiting for the
 * firewall to come back…" and resumes polling. See spec.md.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { api } from '../../js/api.js';
import { live } from '../../js/live.js';
import { fmt } from '../../js/fmt.js';
import { t } from '../../js/i18n.js';
import { statusNode } from '../status/status.js';
import { childNode, startChildren } from '../card/nest.js';
import { toast } from '../toast/toast.js';
import { icon } from '../console/console.js';

const FINAL = ['succeeded', 'failed'];

function readParam(name) {
	try { return new URLSearchParams(location.search).get(name); } catch { return null; }
}
function writeParam(name, value) {
	try {
		const u = new URL(location.href);
		if (value) u.searchParams.set(name, value); else u.searchParams.delete(name);
		history.replaceState(history.state, '', u.toString());
	} catch { /* file:// or sandboxed: the id stays in memory only */ }
}
const unreachable = (e) => !e || e.status === 0 || e.status >= 500 || e.code === 'timeout' || e.code === 'network';

/**
 * GET /v1/jobs/{id} as the element uses it. The API's job ("packages": package
 * operation or system update) has percent, started_at (unix time), cursor,
 * state none | running | succeeded | failed | stopped, reboot_needed and notice.
 */
export function jobView(d, wasRunning) {
	d = d || {};
	let state = d.state || 'running';
	/* "none" right after a start: the operation has not registered yet. */
	if (state === 'none') state = wasRunning === false ? 'none' : 'running';
	if (state === 'stopped') state = 'failed';
	return {
		...d,
		state,
		progress: typeof d.progress === 'number' ? d.progress : (typeof d.percent === 'number' ? d.percent : null),
		started: d.started || (d.started_at ? new Date(d.started_at * 1000).toISOString() : null),
		error: d.error || (state === 'failed' ? (d.notice || (d.state === 'stopped' ? 'The operation stopped without a result.' : null)) : null),
		notice: d.notice || (d.reboot_needed ? 'A reboot is needed to finish.' : null)
	};
}

el.define('job', {
	init(node, config, ctx) {
		const c = {
			source: '/v1/jobs/{id}', urlParam: 'job', listen: 'fs:job-start', channel: null, every: 1,
			hideIdle: false, logHeight: '16rem', retry: true, ...config
		};
		const $node = $(node).addClass('fs-job').empty();
		const $live = $('<span class="visually-hidden" role="status" aria-live="polite">');
		const $head = $('<div class="fs-job-head">');
		const $icon = $('<span class="fs-job-icon">');
		const $title = $('<h2 class="fs-job-title">');
		const $step = $('<p class="fs-job-step">');
		const $elapsed = $('<span class="fs-job-elapsed fs-num">');
		$head.append($icon, $('<div class="fs-job-titles">').append($title, $step), $elapsed);
		const $meter = childNode({ el: 'meter', config: { label: t('Progress'), value: 0, max: 100, warn: null, crit: null, marks: false, color: 'accent', format: 'pct', decimals: 0, size: 'sm' } }).addClass('fs-job-meter');
		const $wait = $('<div class="fs-job-wait" role="status" hidden>');
		const $result = $('<div class="fs-job-result" hidden>');
		const $actions = $('<div class="fs-job-actions">');
		const $logToggle = $('<button type="button" class="btn btn-ghost btn-sm fs-job-logtoggle" aria-expanded="true">');
		const $logBox = $('<div class="fs-job-log">');
		const $console = childNode({ el: 'console', config: { title: 'Log', height: c.logHeight, timestamps: true, placeholder: 'Waiting for output…' } });
		$logBox.append($console);
		const $body = $('<div class="fs-job-body">').append($head, $meter, $wait, $result, $actions, $logBox);
		const $idle = $('<div class="fs-job-idle">');
		$node.append($body, $idle, $live);
		startChildren($meter.add($console));

		let job = null; /* {id, title} */
		let task = null;
		let cursor = 0;
		let attachedAt = 0;
		let state = 'idle';
		let started = null;
		let finished = null;
		let lostSince = null;
		let skip = 0;
		let logOpen = true;

		const meter = () => el.get($meter[0]);
		const log = () => el.get($console[0]);

		function setLog(open) {
			logOpen = open;
			$logBox.prop('hidden', !open);
			$logToggle.attr('aria-expanded', String(open)).empty().append(icon(open ? 'chevron-up' : 'terminal'), $('<span>').text(open ? t('Hide log') : t('View log')));
		}
		$logToggle.on('click', () => setLog(!logOpen));

		function showIdle() {
			state = 'idle';
			$body.prop('hidden', true);
			$node.attr('data-state', 'idle');
			$idle.empty();
			if (c.hideIdle) { $node.prop('hidden', true); return; }
			$node.prop('hidden', false);
			$idle.append($('<div class="fs-job-idle-box">').append(
				$('<span class="fs-job-idle-icon">').append(icon('list-check')),
				$('<p class="fs-job-idle-title">').text(t(c.idleTitle || 'No operation running')),
				c.idleText ? $('<p class="fs-job-idle-text">').text(t(c.idleText)) : null,
				c.start ? $('<button type="button" class="btn btn-primary btn-sm">').append(icon(c.start.icon || 'play'), document.createTextNode(` ${t(c.start.label || 'Start')}`)).on('click', function () { run(c.start, this); }) : null));
		}

		function tickElapsed() {
			if (!started) { $elapsed.text(''); return; }
			const end = finished || Date.now();
			$elapsed.text(fmt.duration(Math.max(0, (end - started) / 1000))).attr('title', t('Elapsed time'));
		}

		function paintHead(d) {
			const st = d.state;
			$node.attr('data-state', st);
			$title.text(d.title || (job && job.title) || t(c.title || 'Operation'));
			$icon.empty().append(icon(st === 'succeeded' ? 'circle-check' : st === 'failed' ? 'circle-xmark' : lostSince ? 'plug-circle-exclamation' : 'gear'));
			if (st === 'running') {
				const n = d.step_index || null;
				$step.text(n && d.steps ? t('Step {n} of {total}: {step}', { n, total: d.steps, step: d.step || '' }) : (d.step || t('Working…')));
			} else $step.text(st === 'succeeded' ? t('Completed') : t('Stopped at: {step}', { step: d.step || '—' }));
			const m = meter();
			if (m && typeof d.progress === 'number') m.set(d.progress);
		}

		function paintWait(on) {
			$wait.prop('hidden', !on);
			$node.toggleClass('is-waiting', on);
			if (!on) return;
			const secs = Math.round((Date.now() - lostSince) / 1000);
			$wait.empty().append(
				$('<span class="fs-job-wait-icon">').append(icon('circle-notch')),
				$('<div>').append(
					$('<p class="fs-job-wait-title">').text(t('Waiting for the firewall to come back…')),
					$('<p class="fs-job-wait-text">').text(t('The connection was lost {s} s ago. This is expected while the firewall restarts; progress resumes automatically.', { s: secs }))));
		}

		function paintFinal(d) {
			$result.empty().prop('hidden', false);
			$actions.prop('hidden', false);
			$actions.children().detach().end();
			const okRun = d.state === 'succeeded';
			$result.append(statusNode(okRun ? 'ok' : 'crit', okRun ? t(c.successLabel || 'Finished successfully') : t(c.failureLabel || 'Failed'),
				{ detail: finished && started ? fmt.duration((finished - started) / 1000) : null }));
			const lastErr = d.error || (d.state === 'failed' ? t('See the log for details.') : null);
			if (lastErr) $result.append($('<p class="fs-job-result-text">').text(lastErr));
			if (!okRun && c.retry && (c.retryAction || c.start)) {
				$actions.append($('<button type="button" class="btn btn-primary btn-sm">').append(icon('rotate-right'), document.createTextNode(` ${t('Retry')}`))
					.on('click', function () { run(c.retryAction || c.start, this); }));
			}
			if (okRun && c.successAction) {
				const a = c.successAction;
				$actions.append($('<a class="btn btn-primary btn-sm" data-fs-nav>').attr('href', a.href).append(a.icon ? icon(a.icon) : null, document.createTextNode(` ${t(a.label)}`)));
			}
			$actions.append($logToggle,
				$('<button type="button" class="btn btn-secondary btn-sm fs-job-close">').append(icon('xmark'), document.createTextNode(` ${t('Close')}`)).on('click', close));
			setLog(!okRun);
		}

		function update(raw) {
			/* Shortly after a start the API may not report the operation yet; later "none" means nothing runs. */
			const d = jobView(raw, Date.now() - attachedAt < 15000 ? undefined : false);
			if (d.state === 'none') { gone(t('No operation is running.')); return; }
			if (typeof raw.cursor === 'number') cursor = Math.max(cursor, raw.cursor);
			if (d.started) started = new Date(d.started).getTime();
			if (d.finished) finished = new Date(d.finished).getTime();
			const prev = state;
			state = d.state || 'running';
			if (FINAL.includes(state) && !finished) finished = Date.now();
			paintHead(d);
			if (d.log && d.log.length) {
				log().append(d.log);
				cursor = Math.max(cursor, ...d.log.map((l) => l.n || 0));
			}
			tickElapsed();
			if (prev !== state) {
				$node.trigger('fs:job-state', [{ id: job.id, state, progress: d.progress }]);
				if (FINAL.includes(state)) {
					if (task) task.every = 0;
					log().setStatus(state === 'succeeded' ? t('Finished') : t('Failed'), state === 'succeeded' ? 'done' : 'error');
					paintFinal(d);
					const msg = state === 'succeeded' ? t('{title}: finished', { title: $title.text() }) : t('{title}: failed', { title: $title.text() });
					$live.text(msg);
					$node.trigger('fs:job-done', [{ id: job.id, state }]);
				} else if (state === 'running') {
					log().setStatus(t('Running…'), 'running');
				}
			}
		}

		function gone(message) {
			if (task) task.every = 0;
			state = 'gone';
			$node.attr('data-state', 'gone');
			$title.text((job && job.title) || t(c.title || 'Operation'));
			$icon.empty().append(icon('circle-question'));
			$step.text('');
			$meter.prop('hidden', true);
			$result.empty().prop('hidden', false).append(statusNode('neutral', t('Not available'), { detail: message }));
			$actions.prop('hidden', false).children().detach().end().append($('<button type="button" class="btn btn-secondary btn-sm fs-job-close">').append(icon('xmark'), document.createTextNode(` ${t('Close')}`)).on('click', close));
			$logBox.prop('hidden', true);
		}

		function poll() {
			if (!job) return Promise.resolve();
			if (skip > 0) { skip--; tickElapsed(); if (lostSince) paintWait(true); return Promise.resolve(); }
			const path = c.source.replace('{id}', encodeURIComponent(job.id));
			return api.get(path, cursor ? { after: cursor } : null, { timeout: 8000 }).then((res) => {
				if (lostSince) {
					lostSince = null;
					paintWait(false);
					$live.text(t('The firewall is back. Following the operation again.'));
					log().setStatus(t('Running…'), 'running');
				}
				update(res.data || {});
			}, (e) => {
				if (e && e.status === 404) { gone(e.message); return; }
				if (unreachable(e)) {
					if (!lostSince) { lostSince = Date.now(); $live.text(t('Waiting for the firewall to come back…')); log().setStatus(t('Connection lost, retrying…'), 'error'); }
					skip = 1; /* poll every 2 s while it is away */
					tickElapsed();
					paintWait(true);
					$icon.empty().append(icon('plug-circle-exclamation'));
					return;
				}
				throw e;
			});
		}

		function attach(id, opts = {}) {
			if (!id) return;
			job = { id: String(id), title: opts.title || null };
			attachedAt = Date.now();
			cursor = 0;
			started = null;
			finished = null;
			lostSince = null;
			state = 'loading';
			if (c.urlParam) writeParam(c.urlParam, job.id);
			$node.prop('hidden', false).attr('data-state', 'running');
			$idle.empty();
			$body.prop('hidden', false);
			$meter.prop('hidden', false);
			$result.prop('hidden', true).empty();
			$actions.children().detach().end().prop('hidden', true);
			paintWait(false);
			setLog(true);
			log().clear();
			log().placeholder(t('Waiting for output…'));
			log().setStatus(t('Running…'), 'running');
			$title.text(opts.title || t(c.title || 'Operation'));
			$step.text(t('Starting…'));
			$icon.empty().append(icon('gear'));
			const m = meter();
			if (m) m.set(0);
			if (task) task.every = 0;
			task = ctx.live({
				every: c.every,
				run: poll,
				onState(s, info) {
					ctx.state(s);
					if (s === 'error') {
						log().setStatus(t('Could not load the job'), 'error');
						$step.text(info.error || t('Could not load the job'));
						$icon.empty().append(icon('triangle-exclamation'));
						$node.attr('data-state', 'error');
						$actions.prop('hidden', false).children().detach().end().append(
							$('<button type="button" class="btn btn-secondary btn-sm">').append(icon('rotate-right'), document.createTextNode(` ${t('Try again')}`)).on('click', () => live.now(task.id)),
							$('<button type="button" class="btn btn-ghost btn-sm fs-job-close">').append(icon('xmark'), document.createTextNode(` ${t('Close')}`)).on('click', close));
					} else if (s === 'ok' && $node.attr('data-state') === 'error') {
						$actions.prop('hidden', true);
						$node.attr('data-state', state);
					}
				}
			});
			if (opts.scroll && node.scrollIntoView) node.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
		}

		function close() {
			if (task) task.every = 0;
			const id = job && job.id;
			job = null;
			if (c.urlParam) writeParam(c.urlParam, null);
			showIdle();
			$node.trigger('fs:job-closed', [{ id }]);
		}

		async function run(req, btn) {
			if (!req || !req.path) return;
			const $b = btn ? $(btn).prop('disabled', true) : null;
			try {
				const res = await api.request((req.method || 'POST').toUpperCase(), req.path, req.body ?? {});
				const id = res.data && (res.data.id || res.data.job);
				if (!id) throw { message: t('The server did not return a job.') };
				attach(id, { title: req.title || (req.body && req.body.title), scroll: true });
			} catch (e) {
				toast.error(e);
			} finally { if ($b) $b.prop('disabled', false); }
		}

		/* someone else started a job (release-card, a page action) */
		const evNs = `.fsjob${Math.random().toString(36).slice(2, 7)}`;
		if (c.listen) {
			$(document).on(`${c.listen}${evNs}`, (e, d) => {
				if (!d || !d.id) return;
				if (c.channel && d.channel !== c.channel) return;
				attach(d.id, { title: d.title, scroll: true });
			});
		}

		const initial = c.id || (c.urlParam && readParam(c.urlParam));
		if (initial) attach(initial, { title: c.jobTitle });
		else if (c.start && c.start.auto) { showIdle(); run(c.start); }
		else showIdle();

		return {
			/** Follow an existing job by id. */
			attach,
			/** Create a job ({method, path, body}) and follow it. */
			start: (req) => run(req || c.start),
			/** Stop following and return to idle (clears ?job=). */
			close,
			/** {id, state} of the followed job, or null. */
			current: () => (job ? { id: job.id, state } : null),
			destroy() { $(document).off(evNs); }
		};
	}
});
