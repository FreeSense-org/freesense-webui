/*
 * meter.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * meter — horizontal usage bar with warn/crit thresholds (in percent of max),
 * a label and value text. role="meter" with a text value for screen readers.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { live } from '../../js/live.js';
import { states } from '../../js/states.js';
import { STATUS } from '../status/status.js';
import { T, pick, num, fetcher, format, level, colorVar } from '../sparkline/viz.js';

el.define('meter', {
	init(node, config, ctx) {
		const c = { format: 'pct', max: 100, min: 0, warn: 75, crit: 90, direction: 'above', show: 'auto', size: 'md', every: 0, ...config };
		const fo = { unit: c.unit, decimals: c.decimals };
		const $node = $(node).addClass('fs-meter').attr('data-size', c.size);
		if (c.color) $node.css('--fs-meter-c', colorVar(c.color));
		const $box = $('<div class="fs-meter-box">');
		const $wrap = $('<div class="fs-meter-wrap" role="meter">');
		const $head = $('<div class="fs-meter-head">');
		const $label = $('<span class="fs-meter-label">').text(c.label || '');
		const $text = $('<span class="fs-meter-text fs-num">');
		const $lvl = $('<span class="fs-meter-level">');
		$head.append($label, $('<span class="fs-meter-right">').append($lvl, $text));
		const $track = $('<div class="fs-meter-track" aria-hidden="true">');
		const $fill = $('<div class="fs-meter-fill">');
		$track.append($fill);
		if (c.marks !== false) {
			for (const t of [c.warn, c.crit]) if (t !== null && t !== undefined && t > 0 && t < 100) $track.append($('<span class="fs-meter-mark">').css('left', `${t}%`));
		}
		$wrap.append($head, $track);
		if (!c.label) $head.addClass('is-bare');
		$wrap.attr('aria-label', c.label || '');
		$node.empty().append($box);

		function render(v, max) {
			if ($wrap.parent()[0] !== $box[0]) $box.empty().append($wrap);
			const lo = c.min, hi = max ?? 100;
			const pct = hi > lo ? Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100)) : 0;
			const lv = level(pct, c.warn, c.crit, c.direction);
			$node.attr('data-level', lv);
			$fill.css('transform', `scaleX(${pct / 100})`);
			const pctText = `${pct < 10 && pct > 0 ? pct.toFixed(1) : Math.round(pct)}%`;
			const show = c.show === 'auto' ? (c.format === 'pct' ? 'pct' : 'both') : c.show;
			const valText = c.format === 'pct' ? format(v, 'pct', fo) : `${format(v, c.format, fo)} ${T.of} ${format(hi, c.format, fo)}`;
			$text.text(show === 'pct' ? pctText : show === 'value' ? valText : `${pctText} · ${valText}`);
			$lvl.empty();
			if (lv !== 'ok') $lvl.append($('<i aria-hidden="true">').addClass(`fa-solid fa-${STATUS[lv][0]}`), $('<span class="visually-hidden">').text(T[lv]));
			$wrap.attr({
				'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(pct),
				'aria-valuetext': `${show === 'pct' ? pctText : valText}${lv !== 'ok' ? `, ${T[lv]}` : ''}`
			});
		}

		if (!c.source) {
			render(num(c.value) ?? 0, num(c.max));
			return { set(v, max) { render(num(v) ?? 0, num(max ?? c.max)); } };
		}
		const task = states.load(ctx, $box, fetcher(c.source), (body) => {
			const v = num(pick(body.data, c.field));
			if (v === null) { $wrap.detach(); return false; }
			render(v, c.maxField ? num(pick(body.data, c.maxField)) : num(c.max));
			return true;
		}, { every: c.every, lines: 1, $root: $node, empty: { icon: 'gauge', title: T.noData } });
		return { reload() { live.now(task.id); } };
	}
});
