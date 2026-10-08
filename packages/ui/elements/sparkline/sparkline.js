/*
 * sparkline.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * sparkline — tiny inline SVG trend (line or area), from a static array or by
 * accumulating a polled value. sparkSvg() is reused by stat-tile.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { states } from '../../js/states.js';
import { live } from '../../js/live.js';
import { T, pick, num, fetcher, format, colorVar, svg } from './viz.js';

const VB_W = 100, VB_H = 32, PAD = 2;

/**
 * Build (or redraw into $wrap) the SVG of a sparkline.
 * opts: { variant: 'line'|'area', min, max, color }
 */
export function sparkSvg(values, opts = {}, $wrap = null) {
	const $w = $wrap || $('<span class="fs-spark-plot" aria-hidden="true">');
	$w.empty().css('color', colorVar(opts.color, 0));
	const vals = values.map(num);
	const real = vals.filter((v) => v !== null);
	const s = svg('svg', { viewBox: `0 0 ${VB_W} ${VB_H}`, preserveAspectRatio: 'none', focusable: 'false' });
	$w.append(s);
	if (real.length < 2) return $w;
	const area = opts.variant === 'area';
	let lo = opts.min ?? Math.min(...real), hi = opts.max ?? Math.max(...real);
	if (area && opts.min === undefined) lo = Math.min(0, lo);
	if (hi === lo) { hi += 1; lo -= 1; }
	const x = (i) => (vals.length === 1 ? VB_W : (i / (vals.length - 1)) * VB_W);
	const y = (v) => PAD + (1 - (Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * (VB_H - PAD * 2);
	let d = '', first = null, last = null;
	vals.forEach((v, i) => {
		if (v === null) return;
		d += `${first === null || vals[i - 1] === null ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`;
		if (first === null) first = i;
		last = i;
	});
	if (area) s.appendChild(svg('path', { class: 'fs-spark-area', d: `${d}L${x(last).toFixed(2)},${VB_H}L${x(first).toFixed(2)},${VB_H}Z` }));
	s.appendChild(svg('path', { class: 'fs-spark-line', d, 'vector-effect': 'non-scaling-stroke' }));
	/* End dot as HTML so preserveAspectRatio=none does not stretch it. */
	$w.append($('<span class="fs-spark-dot">').css({ left: `${(x(last) / VB_W) * 100}%`, top: `${(y(vals[last]) / VB_H) * 100}%` }));
	return $w;
}

/** Text description of a series for screen readers. */
export function sparkLabel(label, values, f, fo) {
	const real = values.map(num).filter((v) => v !== null);
	if (!real.length) return `${label}: ${T.noData}`;
	const lo = Math.min(...real), hi = Math.max(...real), last = real[real.length - 1];
	return `${label}: ${T.latest} ${format(last, f, fo)}, ${format(lo, f, fo)}–${format(hi, f, fo)}`;
}

el.define('sparkline', {
	init(node, config, ctx) {
		const c = { variant: 'line', points: 30, format: 'num', size: 'block', every: 0, ...config };
		const fo = { unit: c.unit, decimals: c.decimals };
		const $node = $(node).addClass('fs-sparkline').attr('data-size', c.size).attr('data-variant', c.variant);
		const values = Array.isArray(c.values) ? c.values.slice(-c.points) : [];
		const $box = $('<div class="fs-sparkline-box">');
		const $row = $('<div class="fs-sparkline-row" role="img">');
		const $label = c.showLabel && c.label ? $('<span class="fs-sparkline-label">').text(c.label) : null;
		const $plot = $('<span class="fs-spark-plot" aria-hidden="true">');
		const $value = c.showValue ? $('<span class="fs-sparkline-value fs-num">') : null;
		$row.append($label, $plot, $value);
		$node.empty().append($box);

		function draw() {
			if ($row.parent()[0] !== $box[0]) $box.empty().append($row);
			sparkSvg(values, c, $plot);
			const last = values.length ? num(values[values.length - 1]) : null;
			if ($value) $value.text(format(last, c.format, fo));
			$row.attr('aria-label', sparkLabel(c.label || T.trend, values, c.format, fo));
		}

		if (!c.source) {
			draw();
			return {
				push(v) { values.push(v); while (values.length > c.points) values.shift(); draw(); },
				set(next) { values.length = 0; values.push(...next.slice(-c.points)); draw(); }
			};
		}

		const task = states.load(ctx, $box, fetcher(c.source), (body) => {
			const v = num(pick(body.data, c.field));
			if (v !== null) { values.push(v); while (values.length > c.points) values.shift(); }
			if (!values.length) { $row.detach(); return false; }
			draw();
			return true;
		}, { every: c.every, lines: 1, $root: $node, empty: { icon: 'chart-line', title: T.noData } });

		return {
			push(v) { values.push(v); while (values.length > c.points) values.shift(); draw(); },
			values: () => values.slice(),
			reload() { live.now(task.id); }
		};
	}
});
