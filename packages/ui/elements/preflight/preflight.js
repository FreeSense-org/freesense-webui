/*
 * preflight.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * preflight — checklist shown before an operation (update, restore, package
 * install): each check is pass / warn / fail / running / pending with a
 * detail line, plus an overall verdict and a gate (canProceed) other
 * elements read or listen to (fs:preflight). Static checks or an API source;
 * polls while any check is still running. See spec.md.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { batch } from '../../js/batch.js';
import { live } from '../../js/live.js';
import { states } from '../../js/states.js';
import { t } from '../../js/i18n.js';
import { statusNode } from '../status/status.js';
import { icon } from '../console/console.js';

/* check state → status element state and default label */
const MAP = {
	pass: ['ok', 'Passed'],
	warn: ['warn', 'Warning'],
	fail: ['crit', 'Failed'],
	running: ['pending', 'Checking'],
	pending: ['neutral', 'Waiting']
};

/** Overall verdict of a list of checks. */
export function verdict(checks, { blockOnWarn = false } = {}) {
	const n = (s) => checks.filter((x) => x.state === s).length;
	const fail = n('fail'), warn = n('warn'), busy = n('running') + n('pending');
	const canProceed = !fail && !busy && !(blockOnWarn && warn) && checks.length > 0;
	let state = 'ok', label;
	if (busy) { state = 'pending'; label = t('Checking… {done} of {total} done', { done: checks.length - busy, total: checks.length }); }
	else if (fail) { state = 'crit'; label = t('{n} problem must be fixed first', { n: fail }, '{n} problems must be fixed first'); }
	else if (warn) { state = blockOnWarn ? 'crit' : 'warn'; label = t('Ready, with {n} warning', { n: warn }, 'Ready, with {n} warnings'); }
	else label = t('All checks passed');
	return { canProceed, state, label, fail, warn, busy };
}

el.define('preflight', {
	init(node, config, ctx) {
		const c = { title: 'Before you continue', every: 2, blockOnWarn: false, ...config };
		const $node = $(node).addClass('fs-preflight').empty();
		const $head = $('<div class="fs-preflight-head">');
		const $titles = $('<div class="fs-preflight-titles">').append($('<h2 class="fs-preflight-title">').text(t(c.title)));
		if (c.subtitle) $titles.append($('<p class="fs-preflight-sub">').text(t(c.subtitle)));
		const $verdict = $('<div class="fs-preflight-verdict" role="status" aria-live="polite">');
		const $rerun = $('<button type="button" class="btn btn-ghost btn-sm fs-preflight-rerun">').attr({ 'aria-label': t('Run the checks again'), title: t('Run the checks again') }).append(icon('rotate-right'));
		$head.append($titles, c.source ? $rerun : null);
		const $body = $('<div class="fs-preflight-body">');
		const $foot = $('<div class="fs-preflight-foot">');
		$node.append($head, $verdict, $body, $foot);

		let checks = [];
		let last = null;
		let task = null;
		let $proceed = null;

		if (c.proceed) {
			$proceed = $('<button type="button" class="btn btn-primary">').append(c.proceed.icon ? icon(c.proceed.icon) : null, document.createTextNode(` ${t(c.proceed.label || 'Continue')}`))
				.on('click', () => { if (last && last.canProceed) $node.trigger(c.proceed.event || 'fs:proceed', [{ checks }]); });
			$foot.append($proceed);
		}

		function item(ch) {
			const [st, def] = MAP[ch.state] || MAP.pending;
			const $li = $('<li class="fs-preflight-item">').attr({ 'data-state': ch.state || 'pending', 'data-id': ch.id || null });
			const $main = $('<div class="fs-preflight-main">').append($('<p class="fs-preflight-label">').text(ch.label || ch.id || ''));
			if (ch.detail) $main.append($('<p class="fs-preflight-detail">').text(ch.detail));
			if (ch.help) $main.append($('<a class="fs-preflight-help" data-fs-nav>').attr('href', ch.help).text(t(ch.helpLabel || 'Details')).append(' ', icon('arrow-right')));
			$li.append($main, $('<span class="fs-preflight-state">').append(statusNode(st, t(ch.stateLabel || def), { variant: 'pill' })));
			return $li;
		}

		function render(list) {
			checks = (Array.isArray(list) ? list : (list && list.checks) || []).filter(Boolean);
			if (!checks.length) return false;
			const order = { fail: 0, warn: 1, running: 2, pending: 3, pass: 4 };
			const sorted = c.sort === false ? checks : [...checks].sort((a, b) => (order[a.state] ?? 3) - (order[b.state] ?? 3));
			$body.empty().append($('<ul class="fs-preflight-list">').append(sorted.map(item)));
			const v = verdict(checks, c);
			$verdict.empty().attr('data-state', v.state).append(statusNode(v.state, v.label));
			const changed = !last || last.canProceed !== v.canProceed || last.label !== v.label;
			last = v;
			if ($proceed) $proceed.prop('disabled', !v.canProceed).attr('title', v.canProceed ? null : v.label);
			if (changed) $node.trigger('fs:preflight', [{ canProceed: v.canProceed, verdict: v.state, label: v.label, fail: v.fail, warn: v.warn }]);
			if (task) task.every = v.busy ? c.every : 0;
			return true;
		}

		function load() {
			if (!c.source) return;
			task = states.load(ctx, $body, () => batch.get(c.source.path, c.source.query).then((r) => r.data), (data) => render(data), {
				every: c.every,
				lines: 4,
				empty: { icon: 'list-check', title: t('No checks'), text: t('Nothing needs to be checked for this operation.') }
			});
		}

		if (c.source) {
			$verdict.append(statusNode('pending', t('Checking…')));
			load();
		} else if (!render(c.checks || [])) {
			states.empty($body, { icon: 'list-check', title: t('No checks'), text: t('Nothing needs to be checked for this operation.') });
		}

		$rerun.on('click', () => {
			if (!task) return;
			$verdict.empty().append(statusNode('pending', t('Checking…')));
			task.every = c.every;
			live.now(task.id);
		});

		return {
			/** True when no check failed or is still running (and no warning with blockOnWarn). */
			canProceed: () => !!(last && last.canProceed),
			/** The current checks. */
			checks: () => checks.slice(),
			/** The overall verdict {canProceed, state, label, fail, warn}. */
			verdict: () => last,
			/** Replace the checks (static use, or results pushed by a job). */
			set(list) { render(list); },
			/** Run the checks again (source only). */
			reload() { $rerun.trigger('click'); }
		};
	}
});
