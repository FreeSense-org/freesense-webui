/*
 * chart.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * chart — uPlot time series. Seeds from a history source (RRD) for the
 * selected range, then appends live samples from another source on short
 * ranges. Range picker, legend with current values (toggles series), hover
 * crosshair with a readout, unit-aware y-axis, stacked/area modes, theme-aware
 * colours (re-read on fs:theme) and container resizing.
 */
import $ from 'jquery';
import uPlot from 'uplot';
import { el } from '../../js/el.js';
import { live } from '../../js/live.js';

import { fmt } from '../../js/fmt.js';
import { states } from '../../js/states.js';
import { T, RANGE_SEC, get, pick, num, format, colorVar, resolveColor, withAlpha, cssToken, nextId } from '../sparkline/viz.js';

/* Short axis labels per unit. */
function axisFmt(v, unit) {
	if (v === null || v === undefined) return '';
	switch (unit) {
		case 'bps': return fmt.bps(v).replace(/\.0+ /, ' ');
		case 'bytes': return fmt.bytes(v);
		case 'pct': return `${+v.toFixed(1)}%`;
		case 'ms': return `${+v.toFixed(1)} ms`;
		case 'pps': return `${fmt.compact(v)} pps`;
		default: return fmt.compact(+v.toFixed(2));
	}
}

function timeText(t, long) {
	const d = new Date(t * 1000);
	return long
		? d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
		: d.toLocaleTimeString([], { hour12: false });
}

/* One-line x tick labels, 24-hour like the rest of the UI. */
function tickText(t, incr) {
	const d = new Date(t * 1000);
	if (incr >= 86400) return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
	if (incr < 60) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
	return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

el.define('chart', {
	init(node, config, ctx) {
		const c = { unit: 'num', height: 220, range: '1h', ranges: [], liveRanges: ['10m'], stacked: false, area: false, legend: true, ...config };
		const S = (c.series || []).map((s, i) => ({ label: s.label || s.field || s.live, color: s.color ?? i + 1, ...s }));
		const fo = { decimals: c.decimals };
		const ns = `.${nextId('fschart')}`;
		let range = c.range;
		let gen = 0;
		let loaded = false;
		let u = null;
		const hidden = new Set(S.map((s, i) => (s.hidden ? i : -1)).filter((i) => i >= 0));
		const data = { t: [], y: S.map(() => []) };

		/* ---------------------------------------------------------- DOM */
		const $node = $(node).addClass('fs-chart');
		const $head = $('<div class="fs-chart-head">');
		if (c.title) $head.append($('<span class="fs-chart-title">').text(c.title));
		let $picker = null;
		if (c.ranges.length > 1) {
			$picker = $('<div class="fs-chart-ranges" role="group">').attr('aria-label', T.range);
			for (const r of c.ranges) {
				$picker.append($('<button type="button" class="fs-chart-range">').attr({ 'data-range': r, title: T.rangeLabels[r] || r, 'aria-label': T.rangeLabels[r] || r }).text(T.ranges[r] || r));
			}
			$head.append($picker);
		}
		const $box = $('<div class="fs-chart-box">');
		const $content = $('<div class="fs-chart-content">');
		const $plot = $('<div class="fs-chart-plot" role="img">').css('height', `${c.height}px`);
		const $tip = $('<div class="fs-chart-tip" aria-hidden="true">').hide();
		const $legend = $('<ul class="fs-chart-legend">');
		$content.append($plot, c.legend ? $legend : null);
		$node.empty().append($head.children().length ? $head : null, $box);

		const legendItems = S.map((s, i) => {
			const $b = $('<button type="button" class="fs-chart-key">').attr('aria-pressed', String(!hidden.has(i)))
				.attr('title', `${T.showSeries}: ${s.label}`)
				.css('--fs-key-c', colorVar(s.color, i));
			const $v = $('<span class="fs-chart-key-value fs-num">');
			$b.append($('<span class="fs-chart-swatch" aria-hidden="true">'), $('<span class="fs-chart-key-label">').text(s.label), $v);
			$b.on('click', () => toggle(i));
			$legend.append($('<li>').append($b));
			return { $b, $v };
		});

		function setPicker() {
			if (!$picker) return;
			$picker.children().each(function () { $(this).attr('aria-pressed', String(this.getAttribute('data-range') === range)); });
		}
		setPicker();

		/* --------------------------------------------------------- data */
		const isLive = () => !!c.live && (!c.history || c.liveRanges.includes(range));
		const windowSec = () => RANGE_SEC[range] || 3600;

		function plotData() {
			const ys = data.y.map((arr, i) => (hidden.has(i) && c.stacked ? arr.map(() => null) : arr));
			if (!c.stacked) return [data.t, ...ys];
			const acc = data.t.map(() => 0);
			return [data.t, ...ys.map((arr, i) => {
				if (hidden.has(i)) return arr;
				return arr.map((v, k) => { acc[k] += v ?? 0; return acc[k]; });
			})];
		}

		function lastValue(i) {
			const arr = data.y[i];
			for (let k = arr.length - 1; k >= 0; k--) if (arr[k] !== null && arr[k] !== undefined) return arr[k];
			return null;
		}

		function describe() {
			const parts = S.map((s, i) => `${s.label} ${format(lastValue(i), c.unit, fo)}`);
			$plot.attr('aria-label', `${c.title ? `${c.title}, ` : ''}${T.rangeLabels[range] || range}. ${T.latest}: ${parts.join(', ')}`);
		}

		function updateLegend(idx) {
			legendItems.forEach((it, i) => {
				const v = idx === null || idx === undefined ? lastValue(i) : data.y[i][idx];
				it.$v.text(format(v ?? null, c.unit, fo));
			});
		}

		function refresh() {
			if (u) u.setData(plotData());
			updateLegend(u && u.cursor.idx !== null ? u.cursor.idx : null);
			describe();
		}

		/* -------------------------------------------------------- uPlot */
		function options(width) {
			const cs = getComputedStyle(node);
			const fontPx = Math.max(10, Math.round(parseFloat(cs.fontSize) * 0.8));
			const font = `${fontPx}px ${cssToken('--fs-font-ui', node) || 'sans-serif'}`;
			const text = resolveColor('var(--fs-chart-text)', node);
			const grid = resolveColor('var(--fs-chart-grid)', node);
			const surface = resolveColor('var(--fs-surface-raised)', node);
			const col = S.map((s, i) => resolveColor(colorVar(s.color, i), node));
			const axis = {
				stroke: text, font, ticks: { show: false }, grid: { stroke: grid, width: 1 }, border: { show: false }
			};
			const bands = [];
			if (c.stacked) for (let i = 1; i < S.length; i++) bands.push({ series: [i + 1, i], fill: withAlpha(col[i], 0.3) });
			return {
				width,
				height: c.height,
				pxAlign: true,
				legend: { show: false },
				padding: [8, 16, 0, 0],
				cursor: {
					y: false,
					drag: { x: false, y: false, setScale: false },
					points: { size: 8, width: 2, fill: surface, stroke: (self, i) => col[i - 1] }
				},
				scales: {
					/* Live windows show the whole range, so a fresh live-only chart does not zoom into one sample. */
					x: {
						time: true,
						range: (self, mn, mx) => {
							if (mx === null || mx === undefined) { const now = Date.now() / 1000; return [now - windowSec(), now]; }
							if (isLive()) return [Math.min(mn, mx - windowSec()), mx];
							return mn === mx ? [mn - 60, mx] : [mn, mx];
						}
					},
					y: { range: (self, mn, mx) => [c.min ?? Math.min(0, mn ?? 0), c.max ?? (mx > 0 ? mx * 1.12 : c.unit === 'pct' ? 100 : 10)] }
				},
				axes: [
					{ ...axis, gap: 6, size: fontPx * 2 + 6, space: 72, values: (self, splits, ai, space, incr) => splits.map((t) => tickText(t, incr)) },
					{
						...axis, gap: 8, space: 32,
						values: (self, vals) => vals.map((v) => axisFmt(v, c.unit)),
						size(self, values, ai, cycle) {
							const a = self.axes[ai];
							if (cycle > 1) return a._size;
							let sz = a.gap + 4;
							const longest = (values || []).reduce((l, v) => (v.length > l.length ? v : l), '');
							if (longest) { self.ctx.font = a.font[0]; sz += self.ctx.measureText(longest).width / devicePixelRatio; }
							return Math.ceil(sz);
						}
					}
				],
				series: [
					{ value: (self, t) => (t === null ? '' : timeText(t, windowSec() > 3600)) },
					...S.map((s, i) => ({
						label: s.label,
						stroke: col[i],
						width: 2,
						show: !hidden.has(i),
						spanGaps: false,
						points: { show: false },
						fill: c.stacked || c.area || s.fill ? withAlpha(col[i], c.stacked ? 0.3 : 0.12) : undefined
					}))
				],
				bands,
				hooks: {
					setCursor: [(self) => onCursor(self, col)]
				}
			};
		}

		function onCursor(self, col) {
			const idx = self.cursor.idx;
			updateLegend(idx);
			if (idx === null || idx === undefined || self.cursor.left < 0) { $tip.hide(); return; }
			$tip.empty().append($('<div class="fs-chart-tip-time">').text(timeText(data.t[idx], windowSec() > 3600)));
			S.forEach((s, i) => {
				if (hidden.has(i)) return;
				$tip.append($('<div class="fs-chart-tip-row">').append(
					$('<span class="fs-chart-swatch">').css('background', col[i]),
					$('<span class="fs-chart-tip-label">').text(s.label),
					$('<span class="fs-chart-tip-value fs-num">').text(format(data.y[i][idx] ?? null, c.unit, fo))));
			});
			$tip.show();
			const over = self.over;
			const w = $tip.outerWidth(), h = $tip.outerHeight();
			const left = self.cursor.left + 14 + w > over.clientWidth ? self.cursor.left - 14 - w : self.cursor.left + 14;
			const top = Math.max(0, Math.min(self.cursor.top - h / 2, over.clientHeight - h));
			$tip.css({ transform: `translate(${Math.max(0, left) + over.offsetLeft}px, ${top + over.offsetTop}px)` });
		}

		function create() {
			if (u) { u.destroy(); u = null; }
			const width = Math.floor($plot[0].clientWidth) || 300;
			u = new uPlot(options(width), plotData(), $plot[0]);
			$plot.append($tip);
			updateLegend(null);
			describe();
		}

		function show() {
			if ($content.parent()[0] !== $box[0]) $box.empty().append($content);
			if (!u) create(); else refresh();
		}

		function toggle(i) {
			if (hidden.has(i)) hidden.delete(i);
			else if (hidden.size < S.length - 1) hidden.add(i);
			else return;
			legendItems[i].$b.attr('aria-pressed', String(!hidden.has(i)));
			if (u) {
				u.setSeries(i + 1, { show: !hidden.has(i) });
				if (c.stacked) u.setData(plotData());
			}
		}

		/* --------------------------------------------------------- load */
		function fromHistory(body) {
			const d = body.data || {};
			const t = Array.isArray(d.t) ? d.t.map(num) : [];
			if (!t.length) return false;
			data.t = t;
			data.y = S.map((s) => {
				const arr = pick(d, s.field);
				return t.map((_, k) => (Array.isArray(arr) ? num(arr[k]) : null));
			});
			return true;
		}

		function append(body) {
			const t = num(body.meta && body.meta.t) ?? Math.floor(Date.now() / 1000);
			const last = data.t[data.t.length - 1];
			if (last !== undefined && t <= last) return false;
			data.t.push(t);
			S.forEach((s, i) => data.y[i].push(num(pick(body.data, s.live ?? s.field))));
			const from = t - windowSec();
			while (data.t.length > 2 && data.t[0] < from) { data.t.shift(); data.y.forEach((a) => a.shift()); }
			return true;
		}

		let mainTask;
		if (c.history) {
			mainTask = states.load(ctx, $box, () => {
				const g = gen;
				return get(c.history, { range }).then((body) => ({ body, g }));
			}, ({ body, g }) => {
				if (g !== gen) return true;
				$node.removeClass('is-switching');
				if (!fromHistory(body)) { loaded = false; $content.detach(); if (u) { u.destroy(); u = null; } return false; }
				loaded = true;
				show();
				return true;
			}, { every: c.history.every || 0, lines: 4, $root: $node, empty: { icon: 'chart-line', title: T.noData, text: T.noDataText } });

			if (c.live) {
				ctx.live({
					every: c.live.every || 5,
					run() {
						if (!loaded || !isLive()) return Promise.resolve();
						const g = gen;
						return get(c.live).then((body) => {
							if (g !== gen || !loaded) return;
							if (append(body)) refresh();
							states.stale($node, false);
						});
					},
					onState(s) { if (s === 'stale' || s === 'error') states.stale($node, true); }
				});
			}
		} else if (c.live) {
			mainTask = states.load(ctx, $box, () => get(c.live), (body) => {
				append(body);
				if (!data.t.length || S.every((s, i) => lastValue(i) === null)) { $content.detach(); return false; }
				loaded = true;
				show();
				return true;
			}, { every: c.live.every || 5, lines: 4, $root: $node, empty: { icon: 'chart-line', title: T.noData, text: T.noDataText } });
		} else if (c.data) {
			/* Static data: { t: [], <field>: [] } */
			fromHistory({ data: c.data });
			loaded = true;
			$box.append($content);
			requestAnimationFrame(show);
		}

		function setRange(r) {
			if (r === range || !RANGE_SEC[r]) return;
			range = r;
			gen++;
			setPicker();
			data.t = [];
			data.y = S.map(() => []);
			$node.addClass('is-switching');
			$node.trigger('fs:chart-range', [r]);
			if (mainTask) live.now(mainTask.id);
		}
		if ($picker) $picker.on('click', '.fs-chart-range', function () { setRange(this.getAttribute('data-range')); });

		/* ----------------------------------------------- theme + resize */
		$(document).on(`fs:theme${ns}`, () => { if (u) requestAnimationFrame(create); });
		let ro = null;
		if (typeof ResizeObserver === 'function') {
			let lastW = 0;
			ro = new ResizeObserver((entries) => {
				const w = Math.floor(entries[0].contentRect.width);
				if (!u || !w || w === lastW) return;
				lastW = w;
				u.setSize({ width: w, height: c.height });
			});
			ro.observe($plot[0]);
		}

		return {
			setRange,
			get range() { return range; },
			reload() { if (mainTask) live.now(mainTask.id); },
			plot: () => u,
			destroy() {
				$(document).off(ns);
				if (ro) ro.disconnect();
				if (u) u.destroy();
				u = null;
			}
		};
	}
});
