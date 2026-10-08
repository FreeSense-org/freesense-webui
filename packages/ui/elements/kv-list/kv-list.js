/*
 * kv-list.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * kv-list — key/value details. Static items, or fields mapped from an API
 * source (path into the response, label, format). Values marked copyable
 * get a copy-to-clipboard button. Live sources update the values in place,
 * so focus and copy buttons survive a refresh.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { batch } from '../../js/batch.js';
import { states } from '../../js/states.js';
import { live } from '../../js/live.js';
import { fmt } from '../../js/fmt.js';
import { STATUS, statusNode } from '../status/status.js';
import { t, icon } from '../page-header/actions.js';

/** Read a dotted path ("cpu.load.0") from an object. */
export function pick(obj, path) {
	if (path == null || path === '') return obj;
	return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

const NUMERIC = { bytes: fmt.bytes, bps: fmt.bps, num: fmt.num, compact: fmt.compact, duration: fmt.duration };

function scaled(v, f) {
	return typeof v === 'number' && f.scale ? v * f.scale : v;
}

/** Format one value as text (status is handled separately). */
export function formatValue(v, f = {}) {
	if (v === undefined || v === null || v === '') return '—';
	const kind = f.format || 'text';
	if (NUMERIC[kind]) {
		const out = NUMERIC[kind](scaled(Number(v), f));
		return f.of != null && f.ofValue != null ? `${out} ${t('of')} ${NUMERIC[kind](scaled(Number(f.ofValue), f))}` : out;
	}
	if (kind === 'pct') return fmt.pct(v, f.decimals || 0);
	if (kind === 'ago') return fmt.ago(v);
	if (kind === 'datetime') return fmt.datetime(v);
	if (kind === 'time') return fmt.time(v);
	if (Array.isArray(v)) return v.length ? v.map(String).join(', ') : '—';
	if (typeof v === 'boolean') return v ? t('Yes') : t('No');
	if (typeof v === 'object') return JSON.stringify(v);
	return String(v);
}

/* Split "4.1 GiB" into number + unit so the unit can be smaller and muted. */
function valueParts(text, unit) {
	const m = /^(-?[\d.,]+)\s(\S+)$/.exec(text);
	if (m && !unit) return [m[1], m[2]];
	return [text, unit || null];
}

function statusFor(v, f) {
	const map = f.map || {};
	const hit = map[String(v)];
	if (hit) return statusNode(hit.state || 'neutral', hit.label || String(v), { variant: f.variant || 'plain' });
	if (typeof v === 'boolean') return statusNode(v ? 'ok' : 'neutral', v ? t('Yes') : t('No'), { variant: f.variant || 'plain' });
	if (v && typeof v === 'object') return statusNode(v.state, v.label, { detail: v.detail, variant: f.variant || 'plain' });
	return statusNode(STATUS[v] ? v : 'neutral', v == null ? '—' : String(v), { variant: f.variant || 'plain' });
}

el.define('kv-list', {
	init(node, config, ctx) {
		const $node = $(node).addClass('fs-kv').attr('data-columns', config.columns === 2 ? '2' : '1');
		if (config.layout === 'stacked') $node.attr('data-layout', 'stacked');
		const $box = $('<div class="fs-kv-box">');
		const $live = $('<span class="visually-hidden" aria-live="polite">');
		$node.empty().append($box, $live);
		const timers = new Set();
		let rows = null;
		let task = null;

		function copy(text, $btn) {
			const done = () => {
				$btn.addClass('is-copied').attr({ 'aria-label': t('Copied'), title: t('Copied') }).find('i').attr('class', 'fa-solid fa-check');
				$live.text(t('Copied to clipboard'));
				const id = setTimeout(() => {
					timers.delete(id);
					$btn.removeClass('is-copied').attr({ 'aria-label': $btn.data('label'), title: $btn.data('label') }).find('i').attr('class', 'fa-solid fa-copy');
					$live.text('');
				}, 1500);
				timers.add(id);
			};
			if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => $live.text(t('Copy failed')));
			else {
				const $ta = $('<textarea readonly class="visually-hidden">').val(text).appendTo(node);
				$ta[0].select();
				try { document.execCommand('copy'); done(); } catch { $live.text(t('Copy failed')); }
				$ta.remove();
			}
		}

		/* Build the rows once for a list of field definitions. */
		function build(fields) {
			const $dl = $('<dl class="fs-kv-list">');
			rows = fields.map((f) => {
				const $row = $('<div class="fs-kv-row">');
				const $dt = $('<dt class="fs-kv-key">').text(f.label || f.path || '');
				const $val = $('<span class="fs-kv-val">');
				const $dd = $('<dd class="fs-kv-value">').append($val);
				if (f.mono) $val.addClass('fs-mono');
				if (f.hint) $dt.attr('title', f.hint);
				let $btn = null;
				if (f.copyable) {
					const label = `${t('Copy')} ${f.label || ''}`.trim();
					$btn = $('<button type="button" class="btn btn-ghost fs-kv-copy">').attr({ 'aria-label': label, title: label }).data('label', label)
						.append(icon('copy')).on('click', () => copy($btn.data('copy') || '', $btn));
					$dd.append($btn);
				}
				$dl.append($row.append($dt, $dd));
				return { f, $row, $val, $btn };
			});
			$box.empty().append($dl);
		}

		/* Write values into the rows (in place). */
		function fill(values) {
			let shown = 0;
			rows.forEach((r, i) => {
				const v = values[i];
				const f = r.f;
				const missing = v === undefined || v === null || v === '';
				r.$row.prop('hidden', !!(f.hideEmpty && missing));
				if (!(f.hideEmpty && missing)) shown++;
				r.$val.empty();
				if (f.format === 'status' && !missing) r.$val.append(statusFor(v, f));
				else if (f.href && !missing) r.$val.append($('<a data-fs-nav>').attr('href', f.href).text(formatValue(v, f)));
				else {
					const [num, unit] = valueParts(formatValue(v, f), f.unit);
					r.$val.toggleClass('is-num', !!NUMERIC[f.format] || f.format === 'pct').append(document.createTextNode(num));
					if (unit) r.$val.append($('<span class="fs-kv-unit">').text(unit));
				}
				if (f.format === 'ago' || f.format === 'datetime') r.$val.attr('title', missing ? null : fmt.datetime(v));
				if (r.$btn) {
					r.$btn.prop('hidden', missing).data('copy', typeof v === 'string' || typeof v === 'number' ? String(v) : r.$val.text());
				}
			});
			return shown > 0;
		}

		function withOf(f, data) {
			return f.of != null ? { ...f, ofValue: pick(data, f.of) } : f;
		}

		function renderStatic(items) {
			if (!items || !items.length) { rows = null; states.empty($box, config.empty || { icon: 'list', title: t('No details') }); return; }
			build(items);
			fill(items.map((i) => i.value));
		}

		function renderData(data) {
			const fields = config.fields || [];
			if (data == null || (Array.isArray(data) && !data.length) || (typeof data === 'object' && !Object.keys(data).length)) { rows = null; return false; }
			const defs = fields.map((f) => withOf(f, data));
			if (!rows || !$.contains(node, rows[0]?.$row[0] || node)) build(defs);
			else rows.forEach((r, i) => { r.f = defs[i]; });
			return fill(fields.map((f) => pick(data, f.path)));
		}

		if (config.source) {
			task = states.load(ctx, $box, () => batch.get(config.source.path, config.source.query).then((r) => r.data),
				(data) => renderData(data), { every: config.every || 0, lines: Math.min((config.fields || []).length || 3, 5), $root: $node, empty: config.empty || { icon: 'list', title: t('No details'), text: t('There is nothing to show for this item.') } });
		} else renderStatic(config.items || []);

		return {
			/** Fetch the source again now. */
			reload() { if (task) live.now(task.id); },
			/** Static lists: replace the items. */
			set(items) { config.items = items; renderStatic(items); },
			/** Source lists: render a response object through the field mapping. */
			update(data) { if (renderData(data) === false) states.empty($box, config.empty || { icon: 'list', title: t('No details') }); },
			destroy() { timers.forEach(clearTimeout); }
		};
	}
});
