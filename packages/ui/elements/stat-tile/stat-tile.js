/*
 * stat-tile.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * stat-tile — a headline number: label, big value with a smaller muted unit,
 * optional trend against the previous value, sparkline, status and link.
 * Static (value) or live (source + field + every).
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { live } from '../../js/live.js';
import { states } from '../../js/states.js';
import { statusNode } from '../status/status.js';
import { sparkSvg } from '../sparkline/sparkline.js';
import { T, pick, num, fetcher, parts, format, level, statusOf } from '../sparkline/viz.js';

const icon = (name) => $('<i aria-hidden="true">').addClass(`fa-solid fa-${name}`);

el.define('stat-tile', {
	init(node, config, ctx) {
		const c = { format: 'num', size: 'regular', every: 0, good: null, trend: false, trendAs: 'pct', ...config };
		const fo = { unit: c.unit, decimals: c.decimals };
		const spark = c.spark ? { points: 30, variant: 'area', color: 1, ...(typeof c.spark === 'object' ? c.spark : {}) } : null;
		const history = Array.isArray(c.history) ? c.history.map(num).filter((v) => v !== null) : [];
		let accumulate = false;
		let prev = num(c.previous);
		let cur = null;

		const $node = $(node).addClass('fs-stat-tile').attr('data-size', c.size);
		if (c.plain) $node.attr('data-plain', '');
		const $head = $('<div class="fs-stat-tile-head">');
		const $label = c.href
			? $('<a class="fs-stat-tile-label fs-stat-tile-link" data-fs-nav>').attr('href', c.href)
			: $('<span class="fs-stat-tile-label">');
		$label.append(c.icon ? icon(c.icon).addClass('fs-stat-tile-icon') : null, $('<span>').text(c.label || ''));
		if (c.href) $label.append(icon('arrow-right').addClass('fs-stat-tile-go'));
		const $status = $('<span class="fs-stat-tile-status">');
		$head.append($label, $status);

		const $box = $('<div class="fs-stat-tile-box">');
		const $body = $('<div class="fs-stat-tile-body">');
		const $value = $('<div class="fs-stat-tile-value">');
		const $num = $('<span class="fs-stat-tile-num">');
		const $unit = $('<span class="fs-stat-tile-unit">');
		const $trend = $('<span class="fs-stat-tile-trend">');
		$value.append($num, $unit);
		const $detail = $('<div class="fs-stat-tile-detail">');
		const $plot = spark ? $('<span class="fs-spark-plot fs-stat-tile-spark" aria-hidden="true">') : null;
		$body.append($('<div class="fs-stat-tile-line">').append($value, $trend), $detail, $plot);
		$node.empty().append($head, $box);

		function renderTrend() {
			$trend.empty().removeAttr('data-tone');
			if (!c.trend || prev === null || cur === null) return;
			const delta = cur - prev;
			const dir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
			const text = c.trendAs === 'abs'
				? format(Math.abs(delta), c.format, fo)
				: prev === 0 ? '—' : `${Math.abs((delta / prev) * 100).toFixed(Math.abs(delta / prev) < 0.1 ? 1 : 0)}%`;
			const tone = dir === 'flat' || !c.good ? 'neutral' : dir === c.good ? 'good' : 'bad';
			$trend.attr('data-tone', tone).append(
				icon(dir === 'up' ? 'arrow-up' : dir === 'down' ? 'arrow-down' : 'minus'),
				$('<span aria-hidden="true">').text(dir === 'flat' ? '0' : text),
				$('<span class="visually-hidden">').text(dir === 'flat' ? `${T.unchanged} ${T.fromPrevious}` : `${T[dir]} ${text} ${T.fromPrevious}`));
		}

		function renderStatus(data) {
			let st = null;
			if (c.statusField && data !== undefined) st = statusOf(pick(data, c.statusField), c.statusMap);
			else if (c.warn !== undefined || c.crit !== undefined) st = level(cur, c.warn, c.crit, c.direction);
			else if (c.status) st = c.status;
			$status.empty();
			if (st) $status.append(statusNode(st, c.statusLabels && c.statusLabels[st] ? c.statusLabels[st] : T[st] || null, { variant: 'pill' }));
		}

		function render(v, data) {
			if ($body.parent()[0] !== $box[0]) $box.empty().append($body);
			cur = v;
			const p = parts(v, c.format, fo);
			$num.text(p.num);
			$unit.text(p.unit).toggle(!!p.unit);
			let detail = c.detail || '';
			if (c.detailField && data !== undefined) {
				const dv = pick(data, c.detailField);
				detail = typeof dv === 'number' ? `${c.detailPrefix ?? T.of} ${format(dv, c.detailFormat || c.format, fo)}` : String(dv ?? '');
			}
			$detail.text(detail).toggle(!!detail);
			renderTrend();
			renderStatus(data);
			if (spark) {
				/* Live values (from a source or from set()) accumulate; a configured
				 * `history` is drawn as given until set() adds to it. */
				if (v !== null && (c.source || accumulate || !history.length)) { history.push(v); while (history.length > spark.points) history.shift(); }
				sparkSvg(history, spark, $plot);
			}
		}

		if (!c.source) {
			render(num(c.value));
			return {
				set(v) { prev = cur; accumulate = true; render(num(v)); }
			};
		}

		const task = states.load(ctx, $box, fetcher(c.source), (body) => {
			const v = num(pick(body.data, c.field));
			if (v === null) { $body.detach(); return false; }
			if (cur !== null) prev = cur;
			render(v, body.data);
			return true;
		}, { every: c.every, lines: 2, $root: $node, empty: { icon: 'chart-simple', title: T.noData } });

		return {
			reload() { live.now(task.id); },
			value: () => cur
		};
	}
});
