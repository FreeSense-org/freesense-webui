/*
 * apply-bar.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * apply-bar — sticky bar that appears while saved changes are not active yet
 * (firewall rules, NAT, aliases …): text + Apply + optional Discard.
 *
 * It polls the pending endpoint through ctx.live and shows at once when any
 * code triggers $(document).trigger('fs:pending', [{ path }]) after a write.
 * After Apply it triggers 'fs:applied' on the document.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { api } from '../../js/api.js';
import { batch } from '../../js/batch.js';
import { live } from '../../js/live.js';
import { toast, t, icon, apiPath } from '../toast/toast.js';
import { confirm, busy } from '../confirm/confirm.js';

let seq = 0;

/** {pending: bool} | {pending: n} | {count: n} | {changes: [..]} → number of changes (0 = none, -1 = some, unknown count). */
function countOf(data) {
	if (!data) return 0;
	if (Array.isArray(data.changes)) return data.changes.length;
	if (typeof data.count === 'number') return data.count;
	if (typeof data.pending === 'number') return data.pending;
	return data.pending ? -1 : 0;
}

el.define('apply-bar', {
	init(node, config, ctx) {
		const ns = `.fs-apply-bar-${++seq}`;
		const $node = $(node).addClass('fs-apply-bar').attr({ role: 'region', 'aria-label': config.label || t('Pending changes'), 'data-position': config.position || 'top' });
		/* The live region exists before the bar shows, so its appearance is announced. */
		const $live = $('<div class="fs-apply-bar-live visually-hidden" aria-live="polite">');
		const $text = $('<p class="fs-apply-bar-text">');
		const $detail = $('<p class="fs-apply-bar-detail">');
		const $apply = $('<button type="button" class="btn btn-primary btn-sm fs-apply-bar-apply">')
			.append(icon('check'), document.createTextNode(' '), $('<span>').text(config.applyLabel || t('Apply changes')));
		const $actions = $('<div class="fs-apply-bar-actions">');
		let $discard = null;
		if (config.discard && config.discard.path) {
			$discard = $('<button type="button" class="btn btn-ghost btn-sm fs-apply-bar-discard">').text(config.discard.label || t('Discard'));
			$actions.append($discard);
		}
		$actions.append($apply);
		const $bar = $('<div class="fs-apply-bar-inner">').append(
			$('<span class="fs-apply-bar-icon">').append(icon('file-pen')),
			$('<div class="fs-apply-bar-copy">').append($text, $detail),
			$actions);
		$node.empty().append($live, $bar).prop('hidden', true);

		let count = 0;
		let shown = false;
		let working = false;

		function render(n) {
			count = n;
			const on = n !== 0;
			const base = config.text || t('Changes are pending');
			$text.text(n > 0 ? `${base} · ${n === 1 ? t('1 change') : t('{n} changes', { n })}` : base);
			$detail.text(config.detail || t('They are saved, but not active until you apply them.')).prop('hidden', config.detail === '');
			if (on === shown) return;
			shown = on;
			$node.prop('hidden', !on).toggleClass('is-shown', false);
			if (on) {
				requestAnimationFrame(() => $node.addClass('is-shown'));
				$live.text(base);
			} else $live.text('');
		}

		const source = config.source || { path: '/v1/firewall/pending' };
		const task = ctx.live({
			id: 'pending',
			every: config.every ?? 10,
			run: () => batch.get(apiPath(source.path), source.query).then((r) => { if (!working) render(countOf(r.data)); }),
			onState(s) { ctx.state(s); }
		});

		/* After a write elsewhere on the page: show at once, then confirm with the server. */
		const matches = (info) => {
			if (!config.match || !info || !info.path) return true;
			return [].concat(config.match).some((m) => String(info.path).includes(m));
		};
		$(document).on(`fs:pending${ns}`, (e, info) => {
			if (!matches(info)) return;
			if (!shown) render(count > 0 ? count : -1);
			live.now(task.id);
		});

		async function apply() {
			if (working) return;
			working = true;
			busy($apply, true);
			if ($discard) $discard.prop('disabled', true);
			const a = config.apply || { path: '/v1/firewall/apply' };
			try {
				const res = await api.request((a.method || 'POST').toUpperCase(), apiPath(a.path), a.body || {});
				render(0);
				toast((res.meta && res.meta.message) || config.success || t('Changes applied'), { level: 'ok' });
				$(document).trigger('fs:applied', [{ path: a.path, response: res }]);
			} catch (err) {
				toast.error(err, { title: t('Apply failed') });
			} finally {
				working = false;
				busy($apply, false);
				if ($discard) $discard.prop('disabled', false);
			}
		}

		async function discard() {
			if (working) return;
			const d = config.discard;
			const ok = d.confirm === false ? true : await confirm({
				title: (d.confirm && d.confirm.title) || t('Discard pending changes?'),
				text: (d.confirm && d.confirm.text) || t('The saved changes are thrown away and the running configuration stays as it is.'),
				confirmLabel: (d.confirm && d.confirm.confirmLabel) || t('Discard'),
				danger: true
			});
			if (!ok) return;
			working = true;
			busy($discard, true);
			$apply.prop('disabled', true);
			try {
				const res = await api.request((d.method || 'POST').toUpperCase(), apiPath(d.path), d.method === 'DELETE' ? null : (d.body || {}));
				render(0);
				toast((res.meta && res.meta.message) || d.success || t('Pending changes discarded'), { level: 'info' });
				$(document).trigger('fs:discarded', [{ path: d.path, response: res }]);
			} catch (err) {
				toast.error(err);
			} finally {
				working = false;
				busy($discard, false);
				$apply.prop('disabled', false);
			}
		}

		$apply.on('click', apply);
		if ($discard) $discard.on('click', discard);

		return {
			apply,
			discard: $discard ? discard : null,
			reload() { live.now(task.id); },
			/** Show or hide without asking the server (n = change count, true = some). */
			set(n) { render(n === true ? -1 : n === false ? 0 : n); },
			get pending() { return count; },
			destroy() { $(document).off(ns); }
		};
	}
});
