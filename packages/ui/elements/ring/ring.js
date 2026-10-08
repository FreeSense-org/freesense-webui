/*
 * ring.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * ring — circular gauge (SVG) with warn/crit thresholds, the value in the
 * centre and a label below. role="meter".
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { live } from '../../js/live.js';
import { states } from '../../js/states.js';
import { STATUS } from '../status/status.js';
import { T, pick, num, fetcher, parts, format, level, colorVar, svg } from '../sparkline/viz.js';

el.define('ring', {
	init(node, config, ctx) {
		const c = { format: 'pct', max: 100, min: 0, warn: 75, crit: 90, direction: 'above', display: 'auto', size: 'md', every: 0, ...config };
		const fo = { unit: c.unit, decimals: c.decimals };
		const $node = $(node).addClass('fs-ring').attr('data-size', c.size);
		if (c.color) $node.css('--fs-ring-c', colorVar(c.color));
		const $box = $('<div class="fs-ring-box">');
		const $wrap = $('<div class="fs-ring-wrap" role="meter">').attr('aria-label', c.label || '');
		const $dial = $('<div class="fs-ring-dial">');
		const s = svg('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true', focusable: 'false' });
		s.appendChild(svg('circle', { class: 'fs-ring-track', cx: 50, cy: 50, r: 43, pathLength: 100 }));
		const arc = svg('circle', { class: 'fs-ring-arc', cx: 50, cy: 50, r: 43, pathLength: 100 });
		s.appendChild(arc);
		const $centre = $('<div class="fs-ring-centre" aria-hidden="true">');
		const $num = $('<span class="fs-ring-num">');
		const $unit = $('<span class="fs-ring-unit">');
		const $lvl = $('<span class="fs-ring-level">');
		$centre.append($('<span class="fs-ring-value">').append($num, $unit), $lvl);
		$dial.append(s, $centre);
		const $cap = $('<div class="fs-ring-caption">');
		if (c.label) $cap.append($('<span class="fs-ring-label">').text(c.label));
		const $detail = $('<span class="fs-ring-detail">');
		$cap.append($detail);
		$wrap.append($dial, $cap);
		$node.empty().append($box);

		function render(v, max, data) {
			if ($wrap.parent()[0] !== $box[0]) $box.empty().append($wrap);
			const hi = max ?? 100;
			const pct = hi > c.min ? Math.max(0, Math.min(100, ((v - c.min) / (hi - c.min)) * 100)) : 0;
			const lv = level(pct, c.warn, c.crit, c.direction);
			$node.attr('data-level', lv);
			arc.style.strokeDashoffset = String(100 - pct);
			const display = c.display === 'auto' ? (c.format === 'pct' || max !== null ? 'pct' : 'value') : c.display;
			const p = display === 'pct' ? parts(pct, 'pct', { decimals: c.decimals }) : parts(v, c.format, fo);
			$num.text(p.num);
			$unit.text(p.unit).toggle(!!p.unit);
			$lvl.empty();
			if (lv !== 'ok') $lvl.append($('<i>').addClass(`fa-solid fa-${STATUS[lv][0]}`), $('<span>').text(T[lv]));
			let detail = c.detail || '';
			if (!detail && c.format !== 'pct' && max !== null) detail = `${format(v, c.format, fo)} ${T.of} ${format(hi, c.format, fo)}`;
			if (c.detailField && data !== undefined) detail = String(pick(data, c.detailField) ?? '');
			$detail.text(detail).toggle(!!detail);
			$wrap.attr({
				'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(pct),
				'aria-valuetext': `${format(display === 'pct' ? pct : v, display === 'pct' ? 'pct' : c.format, fo)}${detail ? `, ${detail}` : ''}${lv !== 'ok' ? `, ${T[lv]}` : ''}`
			});
		}

		if (!c.source) {
			render(num(c.value) ?? 0, num(c.max));
			return { set(v, max) { render(num(v) ?? 0, num(max ?? c.max)); } };
		}
		const task = states.load(ctx, $box, fetcher(c.source), (body) => {
			const v = num(pick(body.data, c.field));
			if (v === null) { $wrap.detach(); return false; }
			render(v, c.maxField ? num(pick(body.data, c.maxField)) : num(c.max), body.data);
			return true;
		}, { every: c.every, lines: 2, $root: $node, empty: { icon: 'gauge', title: T.noData } });
		return { reload() { live.now(task.id); } };
	}
});
