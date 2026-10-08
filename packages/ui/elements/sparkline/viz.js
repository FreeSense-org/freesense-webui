/*
 * viz.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Shared helpers for the data-visualisation elements (stat-tile, meter, ring,
 * sparkline, chart, topology): field paths into API data, unit formatting,
 * thresholds, token colours and SVG nodes. Not an element itself.
 */
import { batch } from '../../js/batch.js';
import { fmt } from '../../js/fmt.js';

/* Visible strings in one place (FS.i18n does not exist yet; RULES R12). */
export const T = {
	ok: 'OK',
	warn: 'Warning',
	crit: 'Critical',
	noData: 'No data yet',
	noDataText: 'Values appear here as soon as the source reports them.',
	up: 'up',
	down: 'down',
	unchanged: 'unchanged',
	fromPrevious: 'from the previous value',
	of: 'of',
	range: 'Time range',
	latest: 'latest',
	trend: 'Trend',
	showSeries: 'Show or hide',
	ranges: { '10m': '10m', '1h': '1h', '24h': '24h', '7d': '7d', '30d': '30d' },
	rangeLabels: { '10m': 'Last 10 minutes', '1h': 'Last hour', '24h': 'Last 24 hours', '7d': 'Last 7 days', '30d': 'Last 30 days' }
};

/* Range keyword → seconds. */
export const RANGE_SEC = { '10m': 600, '1h': 3600, '24h': 86400, '7d': 604800, '30d': 2592000 };

/**
 * Read a value from API data by path:
 *   "cpu.usage"              nested keys
 *   "wan.in_bps"             object keyed by id
 *   "[name=WAN_DHCP].rtt"    first array item whose key equals the value
 *   "0.rtt"                  array index
 */
export function pick(obj, path) {
	if (path === undefined || path === null || path === '') return obj;
	const segs = String(path).match(/\[[^\]]+\]|[^.[\]]+/g) || [];
	let cur = obj;
	for (const s of segs) {
		if (cur === null || cur === undefined) return undefined;
		if (s[0] === '[') {
			const m = /^\[([\w-]+)=(.*)\]$/.exec(s);
			if (m && Array.isArray(cur)) { cur = cur.find((x) => x && String(x[m[1]]) === m[2]); continue; }
			cur = cur[s.slice(1, -1)];
			continue;
		}
		cur = cur[s];
	}
	return cur;
}

/** A number from API data, or null. */
export function num(v) {
	if (v === null || v === undefined || v === '') return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

/*
 * Source paths are written as in the API docs ('/v1/status/…'); FS.api already
 * prefixes '/api/v1', so a leading '/v1' is dropped here. Plain '/status/…'
 * and full '/api/v1/…' paths work too.
 */
export function apiPath(path) {
	return /^\/v1\//.test(path) ? path.slice(3) : path;
}
export function get(source, extraQuery) {
	return batch.get(apiPath(source.path), { ...(source.query || {}), ...(extraQuery || {}) });
}

/** fetch() for a {path, query} source; resolves to the whole body {data, meta}. */
export function fetcher(source) {
	return () => get(source);
}

const dec = (v, d) => (d === undefined || d === null ? null : Number(v).toFixed(d));

/**
 * Format a value as {num, unit} so the unit can be shown smaller and muted.
 * format: bps | bytes | num | compact | pct | duration | ms | pps | raw
 */
export function parts(v, format = 'num', { unit = '', decimals } = {}) {
	if (v === null || v === undefined || Number.isNaN(v)) return { num: '—', unit: '' };
	const split = (s) => { const i = s.lastIndexOf(' '); return i < 0 ? { num: s, unit: '' } : { num: s.slice(0, i), unit: s.slice(i + 1) }; };
	switch (format) {
		case 'bps': return split(fmt.bps(v));
		case 'bytes': return split(fmt.bytes(v));
		case 'pct': return { num: Number(v).toFixed(decimals ?? 0), unit: '%' };
		case 'duration': return { num: fmt.duration(v), unit: '' };
		case 'ms': return { num: dec(v, decimals) ?? (v < 10 ? Number(v).toFixed(1) : String(Math.round(v))), unit: 'ms' };
		case 'pps': return { num: fmt.compact(Math.round(v)), unit: 'pps' };
		case 'compact': return { num: fmt.compact(decimals !== undefined ? +Number(v).toFixed(decimals) : v), unit };
		case 'raw': return { num: dec(v, decimals) ?? String(v), unit };
		default: return { num: decimals !== undefined ? Number(v).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : fmt.num(v), unit };
	}
}

/** Format a value as one string. */
export function format(v, f, opts) {
	const p = parts(v, f, opts);
	if (!p.unit) return p.num;
	return p.unit === '%' ? `${p.num}%` : `${p.num} ${p.unit}`;
}

/**
 * Threshold level of a value: 'ok' | 'warn' | 'crit'.
 * direction 'above' (default): high is bad. 'below': low is bad.
 */
export function level(v, warn, crit, direction = 'above') {
	if (v === null || v === undefined) return 'ok';
	const bad = (t) => t !== null && t !== undefined && (direction === 'below' ? v <= t : v >= t);
	if (bad(crit)) return 'crit';
	if (bad(warn)) return 'warn';
	return 'ok';
}

/* API status words → status states. */
const STATUS_WORDS = {
	ok: 'ok', up: 'ok', online: 'ok', running: 'ok', active: 'ok', connected: 'ok', pass: 'ok',
	warn: 'warn', warning: 'warn', degraded: 'warn', connecting: 'warn', pending: 'warn', loss: 'warn', delay: 'warn',
	crit: 'crit', critical: 'crit', down: 'crit', offline: 'crit', error: 'crit', failed: 'crit', stopped: 'crit',
	info: 'info', neutral: 'neutral', unknown: 'neutral', disabled: 'neutral'
};
export function statusOf(word, map = {}) {
	const w = String(word ?? '').toLowerCase();
	return map[w] || STATUS_WORDS[w] || 'neutral';
}

/**
 * CSS colour for a series reference: 1..8 → --fs-series-N, 'other', 'accent',
 * a status name (ok/warn/crit/info/neutral), or a --fs-* token name.
 */
export function colorVar(c, i = 0) {
	if (c === undefined || c === null) return `var(--fs-series-${(i % 8) + 1})`;
	if (typeof c === 'number' || /^\d$/.test(c)) return `var(--fs-series-${((+c - 1) % 8) + 1})`;
	if (c === 'other') return 'var(--fs-series-other)';
	if (c === 'accent') return 'var(--fs-accent-fill)';
	if (['ok', 'warn', 'crit', 'info', 'neutral'].includes(c)) return `var(--fs-status-${c})`;
	if (/^--fs-[\w-]+$/.test(c)) return `var(${c})`;
	return `var(--fs-series-${(i % 8) + 1})`;
}

/* Resolve any CSS colour (including var()) to rgb() through a probe node. */
let probe = null;
export function resolveColor(css, within = document.body) {
	if (!probe) { probe = document.createElement('span'); probe.setAttribute('aria-hidden', 'true'); probe.style.display = 'none'; }
	within.appendChild(probe);
	probe.style.color = '';
	probe.style.color = css;
	const out = getComputedStyle(probe).color;
	probe.remove();
	return out;
}
/** rgb()/rgba() string with a new alpha. */
export function withAlpha(rgb, a) {
	const m = /rgba?\(([^)]+)\)/.exec(rgb);
	if (!m) return rgb;
	const [r, g, b] = m[1].split(/[\s,/]+/).filter(Boolean);
	return `rgba(${r}, ${g}, ${b}, ${a})`;
}
export function cssToken(name, within = document.documentElement) {
	return getComputedStyle(within).getPropertyValue(name).trim();
}

const NS = 'http://www.w3.org/2000/svg';
/** Create an SVG node with attributes (never from data strings). */
export function svg(tag, attrs = {}) {
	const n = document.createElementNS(NS, tag);
	for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) n.setAttribute(k, String(v));
	return n;
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let uid = 0;
export const nextId = (p) => `${p}-${++uid}`;
