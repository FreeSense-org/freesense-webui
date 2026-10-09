/*
 * data-table.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * data-table — the API-backed list behind every ResourcePage, the firewall
 * rules, leases, states and ARP pages. See spec.md.
 *
 * Rendering: rows are kept in a Map keyed by row id. A refresh compares each
 * row's signature (all fields except `live` ones); unchanged rows only get
 * their live cells patched, changed rows are rebuilt, and the tbody is synced
 * with the fewest DOM moves. Below 48rem of container width the same rows are
 * laid out as cards by CSS (container query), so there is one render path.
 */
import $ from 'jquery';
import { Dropdown } from 'bootstrap';
import { el } from '../../js/el.js';
import { api } from '../../js/api.js';
import { batch } from '../../js/batch.js';
import { states } from '../../js/states.js';
import { fmt } from '../../js/fmt.js';
import { nav } from '../../js/nav.js';
import { t } from '../../js/i18n.js';
import { statusNode, STATUS } from '../status/status.js';
import { badgeNode } from '../badge/badge.js';
import { toast } from '../toast/toast.js';
import { confirm } from '../confirm/confirm.js';
import { dangerConfirm } from '../danger-confirm/danger-confirm.js';
import { actionNode, menuItems, icon, disposeMenus } from '../page-header/actions.js';
import { childNode, startChildren } from '../card/nest.js';

/* ------------------------------------------------------------ helpers */

/** Value at a dot path ('a.b.c'). */
export function get(o, path) {
	if (o == null || path == null || path === '') return undefined;
	let v = o;
	for (const k of String(path).split('.')) {
		if (v == null) return undefined;
		v = v[k];
	}
	return v;
}

/** Fill {field} placeholders from a row; `encode` for URL paths. {id} falls back to the row key. */
export function fill(tpl, row, { encode = false, key = 'id', extra = null } = {}) {
	return String(tpl ?? '').replace(/\{([\w.]+)\}/g, (m, k) => {
		let v = extra && k in extra ? extra[k] : get(row, k);
		if (v === undefined && k === 'id') v = get(row, key);
		if (v == null) return '';
		return encode ? encodeURIComponent(String(v)) : String(v);
	});
}

/* chips: the items of an array value as strings; itemField picks a field of object items ({address, detail} → address). */
function chipItems(col, v) {
	return (Array.isArray(v) ? v : [v]).map((x) => (x && typeof x === 'object' ? (col.itemField ? x[col.itemField] : JSON.stringify(x)) : x))
		.filter((x) => x !== undefined && x !== null && x !== '').map(String);
}

function fillDeep(v, row, key) {
	if (typeof v === 'string') return fill(v, row, { key });
	if (Array.isArray(v)) return v.map((x) => fillDeep(x, row, key));
	if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillDeep(x, row, key)]));
	return v;
}

const NUMERIC = new Set(['num', 'bytes', 'bps', 'duration']);
const EMPTY = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

function compare(a, b) {
	if (EMPTY(a) && EMPTY(b)) return 0;
	if (EMPTY(a)) return 1;
	if (EMPTY(b)) return -1;
	if (typeof a === 'number' && typeof b === 'number') return a - b;
	if (typeof a === 'boolean' || typeof b === 'boolean') return Number(!!b) - Number(!!a);
	return collator.compare(String(a), String(b));
}

/** Run promise factories with limited concurrency; resolves to [{ok, value|error}]. */
function pool(tasks, limit = 4) {
	const out = new Array(tasks.length);
	let next = 0;
	const worker = () => {
		if (next >= tasks.length) return Promise.resolve();
		const i = next++;
		return tasks[i]().then((value) => { out[i] = { ok: true, value }; }, (error) => { out[i] = { ok: false, error }; }).then(worker);
	};
	return Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker)).then(() => out);
}

/* -------------------------------------------------------------- cells */

function dash() { return $('<span class="fs-table-none">').text('—'); }

function timeNode(v, text) {
	return $('<time>').attr({ datetime: String(v), title: fmt.datetime(v) }).text(text);
}

/** Map a value through a statusMap ({value: state | {state, label}}). */
function statusOf(col, v) {
	const m = (col.statusMap || {})[String(v)];
	if (typeof m === 'string') return { state: m, label: String(v) };
	if (m && typeof m === 'object') return { state: m.state || 'neutral', label: m.label ?? String(v), detail: m.detail };
	if (typeof v === 'boolean') return { state: v ? 'ok' : 'neutral', label: v ? t('Yes') : t('No') };
	return { state: STATUS[v] ? v : 'neutral', label: String(v) };
}

/** Plain text of a cell (search, card labels, sort fallback). */
export function cellText(col, row) {
	const v = get(row, col.field);
	if (EMPTY(v)) return '';
	switch (col.format) {
		case 'num': return fmt.num(v);
		case 'bytes': return fmt.bytes(v);
		case 'bps': return fmt.bps(v);
		case 'duration': return fmt.duration(v);
		case 'ago': return fmt.ago(v);
		case 'datetime': return fmt.datetime(v);
		case 'status': return statusOf(col, v).label;
		case 'badge': { const m = (col.badgeMap || {})[String(v)]; return (m && m.label) || String(v); }
		case 'chips': return chipItems(col, v).join(' ');
		case 'bool': return v ? t('Yes') : t('No');
		default: return String(v);
	}
}

/** Render one cell's content into $td. */
function cellContent($td, col, row, key) {
	const v = get(row, col.field);
	$td.empty();
	if (EMPTY(v) && col.format !== 'bool') { $td.append(dash()); }
	else {
		switch (col.format) {
			case 'num': case 'bytes': case 'bps': case 'duration':
				$td.append($('<span class="fs-num">').text(cellText(col, row)));
				break;
			case 'ago':
				$td.append(timeNode(v, fmt.ago(v)));
				break;
			case 'datetime':
				$td.append(timeNode(v, fmt.datetime(v)));
				break;
			case 'status': {
				const s = statusOf(col, v);
				$td.append(statusNode(s.state, s.label, { detail: s.detail, variant: col.variant || 'plain' }));
				break;
			}
			case 'badge': {
				const m = (col.badgeMap || {})[String(v)] || {};
				$td.append(badgeNode({ label: m.label ?? String(v), tone: m.tone || col.tone || 'neutral', icon: m.icon, mono: col.mono }));
				break;
			}
			case 'chips':
				{
					const items = chipItems(col, v);
					const shown = col.max ? items.slice(0, col.max) : items;
					const $chips = $('<span class="fs-table-chips">').append(shown.map((x) => badgeNode({ label: x, tone: col.tone || 'neutral', mono: col.mono })));
					if (shown.length < items.length) $chips.append($('<span class="fs-table-more">').text(t('+{n} more', { n: items.length - shown.length })));
					$td.append($chips);
				}
				break;
			case 'bool':
				$td.append(v
					? $('<span class="fs-table-bool is-on">').append(icon('check'), $('<span>').text(t('Yes')))
					: $('<span class="fs-table-bool">').append($('<span>').text(t('No'))));
				break;
			case 'mono':
				$td.append($('<span class="fs-mono">').text(String(v)));
				break;
			case 'link': {
				const href = col.href ? fill(col.href, row, { encode: true, key }) : String(v);
				const $a = $('<a class="fs-table-cell-link">').attr('href', href).text(String(v));
				if (/^https?:/.test(href)) $a.attr({ target: '_blank', rel: 'noopener' });
				else $a.attr('data-fs-nav', '');
				$td.append($a);
				break;
			}
			default:
				$td.append($('<span>').toggleClass('fs-mono', !!col.mono).text(String(v)));
		}
	}
	if (col.sub) {
		const s = get(row, col.sub);
		if (!EMPTY(s)) $td.append($('<span class="fs-table-sub">').text(String(s)));
	}
}

/* ------------------------------------------------------------ element */

let seq = 0;

el.define('data-table', {
	init(node, config, ctx) {
		const uid = `fs-dt-${++seq}`;
		const c = { key: 'id', every: 0, live: [], ...config };
		const key = c.key;
		const ns = `.${uid}`;
		const $root = $(node).addClass('fs-table').empty();

		/* columns */
		const cols = (c.columns || []).filter((x) => x && x.field).map((x) => ({ ...x, label: x.label ?? x.field }));
		const prefKey = c.id ? `fs-dt-cols:${c.id}` : null;
		if (prefKey) {
			try {
				const hidden = JSON.parse(localStorage.getItem(prefKey) || 'null');
				if (Array.isArray(hidden)) cols.forEach((x) => { x.hidden = hidden.includes(x.field); });
			} catch { /* storage unavailable */ }
		}
		const liveFields = new Set(c.live || []);
		cols.forEach((x) => { if (x.format === 'ago') liveFields.add(x.field); });
		const visCols = () => cols.filter((x) => !x.hidden);
		const primaryCol = () => visCols().find((x) => x.primary) || visCols()[0];
		/* The first column that stays visible on medium widths sticks when the table scrolls sideways. */
		const stickyCol = () => visCols().find((x) => Number(x.priority) !== 3) || visCols()[0];
		const nameField = c.name || (cols.find((x) => x.primary) || cols[0] || {}).field;
		const nameOf = (row) => { const v = get(row, nameField); return EMPTY(v) ? String(get(row, key)) : String(v); };

		/* options */
		const paging = !c.paging ? null : (typeof c.paging === 'string' ? { mode: c.paging } : { mode: 'client', ...c.paging });
		if (paging) { paging.size = paging.size || 25; }
		const server = !!(paging && paging.mode === 'server');
		const lockCfg = !c.locked ? null : (typeof c.locked === 'string' ? { field: c.locked } : c.locked);
		const isLocked = (row) => !!(lockCfg && get(row, lockCfg.field));
		const groupCfg = !c.group ? null : (typeof c.group === 'string' ? { field: c.group } : c.group);
		const rowActions = (c.rowActions || []).filter((a) => a && a.id);
		const bulkActions = (c.bulkActions || []).filter((a) => a && a.id);
		const filterDefs = {};
		for (const f of c.filters || []) if (f && f.id) filterDefs[f.id] = f;

		/* state */
		const query = { ...((c.source && c.source.query) || {}) };
		let all = [];
		let total = 0;
		let loaded = false;
		let q = '';
		const filt = {};
		let sort = c.sort ? { field: c.sort.field || c.sort, dir: c.sort.dir === 'desc' ? 'desc' : 'asc' } : null;
		let page = 1;
		const sel = new Set();
		let anchor = null;
		const recs = new Map();
		const groupRows = new Map();
		const collapsed = new Set((groupCfg && groupCfg.collapsed) || []);
		const overrides = new Map();
		let pendingOrder = null;
		let view = { rows: [], count: 0 };

		/* ------------------------------------------------------- skeleton DOM */
		const hasLead = !!(c.selectable || c.reorder);
		$root.toggleClass('has-lead', hasLead).toggleClass('has-select', !!c.selectable).toggleClass('has-handle', !!c.reorder)
			.toggleClass('has-toggle', !!c.toggle);
		const $live = $('<span class="visually-hidden" role="status" aria-live="polite">');
		const $cardbar = $('<div class="fs-table-cardbar">');
		const $scroll = $('<div class="fs-table-scroll">');
		const $table = $('<table class="fs-table-grid">').attr('id', `${uid}-table`);
		const $caption = $('<caption class="visually-hidden">').text(c.label || t('Table'));
		const $thead = $('<thead>');
		const $tbody = $('<tbody class="fs-table-body">');
		const $skel = $('<tbody class="fs-table-skel" aria-hidden="true">');
		const $state = $('<div class="fs-table-state">').prop('hidden', true);
		const $foot = $('<div class="fs-table-foot">').prop('hidden', true);
		const $hint = $('<span class="visually-hidden">').attr('id', `${uid}-hint`).text(t('Drag, or press the arrow keys to move this row.'));
		$table.append($caption, $thead, $skel, $tbody);
		$scroll.append($table);

		/* toolbar: embedded config, a selector, or the toolbar right before the table */
		let $tb = $();
		if (c.toolbar && typeof c.toolbar === 'object') {
			const cfg = { ...c.toolbar };
			if (!cfg.bulk && bulkActions.length) cfg.bulk = bulkActions.map((b) => ({ id: b.id, label: b.label, icon: b.icon, danger: b.danger, iconOnly: b.iconOnly }));
			$tb = childNode({ el: 'toolbar', config: cfg }).addClass('fs-table-toolbar');
			$root.append($tb);
		} else if (typeof c.toolbar === 'string') {
			$tb = $(c.toolbar).first();
		} else if (c.toolbar !== false) {
			$tb = $(node).prevAll('[data-fs-el="toolbar"]').first();
		}
		$root.append($cardbar, $scroll, $state, $foot, $hint, $live);
		if ($tb.length && $root.has($tb[0]).length) startChildren($tb);
		const tbApi = () => ($tb.length ? el.get($tb[0]) : null);
		let tbInitial = { q: '', filters: {} };

		const announce = (msg) => { $live.text(''); setTimeout(() => $live.text(msg), 60); };
		const isCard = () => node.clientWidth > 0 && node.clientWidth < 48 * remPx();

		/* -------------------------------------------------------- header */
		const $selAll = $('<input type="checkbox" class="form-check-input fs-table-check">').attr('aria-label', t('Select all rows on this page'));
		const $selAllCard = $('<input type="checkbox" class="form-check-input fs-table-check">').attr('id', `${uid}-selall`);
		const $sortSel = $('<select class="form-select form-select-sm fs-table-sortsel">').attr('aria-label', t('Sort by'));

		function buildHead() {
			const $tr = $('<tr>');
			if (hasLead) {
				const $th = $('<th scope="col" class="fs-table-lead">');
				if (c.selectable) $th.append($selAll);
				else $th.append($('<span class="visually-hidden">').text(t('Order')));
				$tr.append($th);
			}
			if (c.toggle) $tr.append($('<th scope="col" class="fs-table-toggle-cell">').text(t(c.toggle.label || 'On')));
			const first = stickyCol();
			for (const col of visCols()) {
				const $th = $('<th scope="col" class="fs-table-cell">').attr({ 'data-field': col.field, 'data-priority': col.priority || null });
				if (col.width) $th.css('width', col.width);
				const align = col.align || (NUMERIC.has(col.format) ? 'end' : null);
				if (align) $th.addClass(`is-${align}`);
				if (col === first) $th.addClass('is-sticky');
				if (col.sortable) {
					const on = sort && sort.field === col.field;
					$th.attr('aria-sort', on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : null);
					$th.append($('<button type="button" class="fs-table-sort">').attr('data-field', col.field)
						.append($('<span>').text(col.label), icon(on ? (sort.dir === 'asc' ? 'arrow-up' : 'arrow-down') : 'arrows-up-down').addClass('fs-table-sort-icon'))
						.toggleClass('is-active', !!on));
				} else $th.text(col.label);
				$tr.append($th);
			}
			if (rowActions.length || c.reorder || c.chooser) {
				const $th = $('<th scope="col" class="fs-table-actions">').append($('<span class="visually-hidden">').text(t('Actions')));
				if (c.chooser) $th.append(chooser());
				$tr.append($th);
			}
			$thead.empty().append($tr);
			buildCardbar();
		}

		function chooser() {
			const $list = $('<ul class="dropdown-menu dropdown-menu-end fs-menu-list fs-table-chooser">');
			cols.forEach((col, i) => {
				if (col === primaryCol()) return;
				const id = `${uid}-col-${i}`;
				$list.append($('<li>').append($('<label class="dropdown-item fs-menu-item fs-table-chooser-item">').attr('for', id).append(
					$('<input type="checkbox" class="form-check-input">').attr('id', id).prop('checked', !col.hidden).on('change', function () {
						col.hidden = !this.checked;
						if (prefKey) { try { localStorage.setItem(prefKey, JSON.stringify(cols.filter((x) => x.hidden).map((x) => x.field))); } catch { /* storage unavailable */ } }
						rebuild();
					}),
					$('<span>').text(col.label))));
			});
			return $('<div class="dropdown fs-menu fs-table-chooser-menu">').append(
				$('<button type="button" class="btn btn-ghost btn-sm fs-menu-toggle fs-action-icon" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false">')
					.attr({ 'aria-label': t('Choose columns'), title: t('Choose columns') }).append(icon('table-columns')),
				$list);
		}

		function buildCardbar() {
			$cardbar.empty();
			if (c.selectable) {
				$cardbar.append($('<div class="form-check fs-table-cardbar-all">').append($selAllCard.addClass('form-check-input'),
					$('<label class="form-check-label">').attr('for', `${uid}-selall`).text(t('Select all'))));
			}
			const sortable = visCols().filter((x) => x.sortable);
			if (sortable.length) {
				$sortSel.empty().append($('<option value="">').text(t('Default order')));
				for (const col of sortable) {
					$sortSel.append($('<option>').val(`${col.field}:asc`).text(`${col.label} ↑`), $('<option>').val(`${col.field}:desc`).text(`${col.label} ↓`));
				}
				$sortSel.val(sort ? `${sort.field}:${sort.dir}` : '');
				$cardbar.append($sortSel);
			}
			$cardbar.prop('hidden', !$cardbar.children().length);
		}

		/* ---------------------------------------------------------- rows */
		function sigOf(row) {
			return JSON.stringify(row, (k, v) => (liveFields.has(k) ? undefined : v));
		}

		function menuNeeded(row) {
			return rowActions.some((a) => !a.inline) || (c.reorder && !isLocked(row));
		}

		function buildRow(row) {
			const id = String(get(row, key));
			const locked = isLocked(row);
			const name = nameOf(row);
			const $tr = $('<tr class="fs-table-row">').attr('data-id', id).toggleClass('is-locked', locked).toggleClass('is-selected', sel.has(id));
			if (c.toggle && !get(row, c.toggle.field)) $tr.addClass('is-off');
			if (c.rowLink) $tr.addClass('is-link');
			const live = {};
			if (hasLead) {
				const $lead = $('<td class="fs-table-lead">');
				if (c.reorder) {
					if (locked) $lead.append($('<span class="fs-table-handle is-placeholder" aria-hidden="true">'));
					else {
						$lead.append($('<button type="button" class="fs-table-handle">').attr({
							'aria-label': t('Move {name}', { name }), title: t('Drag to reorder'), 'aria-describedby': `${uid}-hint`, 'aria-keyshortcuts': 'ArrowUp ArrowDown'
						}).append(icon('grip-vertical')));
					}
				}
				if (c.selectable && !locked) {
					$lead.append($('<input type="checkbox" class="form-check-input fs-table-check">').attr('aria-label', t('Select {name}', { name })).prop('checked', sel.has(id)));
				}
				if (locked) {
					$lead.append($('<span class="fs-table-lock">').attr('title', t(lockCfg.label || 'Locked')).append(icon('lock'), $('<span class="visually-hidden">').text(t(lockCfg.label || 'Locked'))));
				}
				$tr.append($lead);
			}
			if (c.toggle) {
				const on = !!get(row, c.toggle.field);
				const $sw = $('<input type="checkbox" role="switch" class="form-check-input fs-table-switch-input">')
					.attr('aria-label', t('{label}: {name}', { label: t(c.toggle.label || 'Enabled'), name })).prop('checked', on).prop('disabled', locked);
				$tr.append($('<td class="fs-table-toggle-cell">').append($('<span class="form-check form-switch fs-table-switch">').append($sw)));
			}
			const prim = primaryCol();
			const first = stickyCol();
			for (const col of visCols()) {
				const isPrim = col === prim;
				const $td = $(isPrim ? '<th scope="row">' : '<td>').addClass('fs-table-cell').attr({ 'data-label': col.label, 'data-field': col.field, 'data-priority': col.priority || null });
				const align = col.align || (NUMERIC.has(col.format) ? 'end' : null);
				if (align) $td.addClass(`is-${align}`);
				if (isPrim) $td.addClass('is-primary');
				if (col === first) $td.addClass('is-sticky');
				if (col.wrap) $td.addClass('is-wrap');
				cellContent($td, col, row, key);
				if (isPrim && c.rowLink) {
					const href = fill(c.rowLink, row, { encode: true, key });
					const $a = $('<a class="fs-table-link">').attr('href', href);
					if (!href.startsWith('#')) $a.attr('data-fs-nav', '');
					$a.append($td.children().first().contents());
					$td.children().first().remove();
					$td.prepend($a);
				}
				if (isPrim && locked && !hasLead) $td.prepend($('<span class="fs-table-lock">').attr('title', t(lockCfg.label || 'Locked')).append(icon('lock'), $('<span class="visually-hidden">').text(t(lockCfg.label || 'Locked'))));
				if (liveFields.has(col.field)) live[col.field] = { $td, col, val: get(row, col.field) };
				$tr.append($td);
			}
			if (rowActions.length || c.reorder || c.chooser) {
				const $act = $('<td class="fs-table-actions">');
				const $wrap = $('<div class="fs-table-actions-inner">');
				for (const a of rowActions) {
					if (!a.inline || !visibleFor(a, row)) continue;
					const blocked = locked && blockedOnLocked(a);
					const $b = actionNode({ id: a.id, icon: a.icon || 'circle', label: fill(a.label, row, { key }), iconOnly: true, danger: a.danger, href: a.href && !blocked ? fill(a.href, row, { encode: true, key }) : undefined, disabled: blocked },
						{ variant: 'ghost', size: 'sm' }).addClass('fs-table-inline').attr('aria-label', `${fill(a.label, row, { key })}: ${name}`);
					$wrap.append($b);
				}
				if (rowActions.length || c.reorder) {
					const $menu = $('<div class="dropdown fs-menu fs-table-menu">').toggleClass('is-card-only', !menuNeeded(row)).append(
						$('<button type="button" class="btn btn-ghost btn-sm fs-menu-toggle fs-action-icon fs-table-menu-toggle" data-bs-toggle="dropdown" aria-expanded="false">')
							.attr({ 'aria-label': t('Actions for {name}', { name }), title: t('More actions') }).append(icon('ellipsis')),
						$('<ul class="dropdown-menu dropdown-menu-end fs-menu-list">'));
					$wrap.append($menu);
				}
				$tr.append($act.append($wrap));
			}
			return { tr: $tr[0], $tr, live, sig: sigOf(row), row, id };
		}

		function visibleFor(a, row) {
			if (!a.when) return true;
			const v = get(row, a.when.field);
			if ('value' in a.when) return v === a.when.value;
			if ('not' in a.when) return v !== a.when.not;
			return !!v;
		}
		const blockedOnLocked = (a) => !a.allowLocked && (a.api || a.danger);

		function patchLive(rec, row) {
			for (const f of Object.keys(rec.live)) {
				const L = rec.live[f];
				const v = get(row, f);
				if (v === L.val && L.col.format !== 'ago') continue;
				L.val = v;
				const before = L.$td.text();
				const $tmp = $('<td>');
				cellContent($tmp, L.col, row, key);
				if ($tmp.text() !== before || $tmp.children().length !== L.$td.children().length) {
					L.$td.empty().append($tmp.contents());
					if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && L.col.format !== 'ago') {
						L.$td.removeClass('is-changed');
						void L.$td[0].offsetWidth;
						L.$td.addClass('is-changed');
					}
				}
			}
			rec.row = row;
		}

		function recFor(row) {
			const id = String(get(row, key));
			const old = recs.get(id);
			if (!old) { const r = buildRow(row); recs.set(id, r); return r; }
			const sig = sigOf(row);
			if (sig === old.sig) { patchLive(old, row); return old; }
			const focusSel = focusSelector(old.tr);
			const r = buildRow(row);
			if (old.tr.parentNode) old.tr.parentNode.replaceChild(r.tr, old.tr);
			recs.set(id, r);
			if (focusSel) $(r.tr).find(focusSel).first().trigger('focus');
			return r;
		}

		function focusSelector(tr) {
			const a = document.activeElement;
			if (!a || !tr.contains(a)) return null;
			for (const s of ['.fs-table-handle', '.fs-table-check', '.fs-table-switch-input', '.fs-table-menu-toggle', '.fs-table-link']) if (a.matches(s)) return s;
			if (a.matches('.fs-table-inline')) return `.fs-table-inline[data-fs-action="${CSS.escape(a.getAttribute('data-fs-action') || '')}"]`;
			return null;
		}

		/* ---------------------------------------------------------- view */
		function activeClientFilters() {
			const out = [];
			for (const [id, value] of Object.entries(filt)) {
				const d = filterDefs[id] || {};
				if (d.query) continue;
				if (value == null || value === '' || value === 'all' || (Array.isArray(value) && !value.length)) continue;
				out.push({ field: d.field || id, value, match: d.match || 'eq' });
			}
			return out;
		}

		const searchCache = new WeakMap();
		function searchText(row) {
			let s = searchCache.get(row);
			if (s === undefined) {
				const fields = (c.search && c.search.fields) || null;
				const parts = fields ? fields.map((f) => get(row, f)) : visCols().flatMap((col) => [cellText(col, row), get(row, col.field), col.sub ? get(row, col.sub) : null]);
				s = parts.filter((x) => !EMPTY(x)).map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' ').toLowerCase();
				searchCache.set(row, s);
			}
			return s;
		}

		function matches(row, fs) {
			for (const f of fs) {
				const v = get(row, f.field);
				const vals = Array.isArray(f.value) ? f.value.map(String) : [String(f.value)];
				if (f.match === 'contains') { if (!vals.some((x) => String(v ?? '').toLowerCase().includes(x.toLowerCase()))) return false; }
				else if (Array.isArray(v)) { if (!v.some((x) => vals.includes(String(x)))) return false; }
				else if (!vals.includes(String(v))) return false;
			}
			return true;
		}

		function computeView() {
			let rows = all;
			if (!server) {
				const fs = activeClientFilters();
				if (fs.length) rows = rows.filter((r) => matches(r, fs));
				const words = q.toLowerCase().split(/\s+/).filter(Boolean);
				if (words.length) rows = rows.filter((r) => { const s = searchText(r); return words.every((w) => s.includes(w)); });
				if (sort) {
					const col = cols.find((x) => x.field === sort.field);
					const val = (r) => { const v = get(r, sort.field); return col && (col.format === 'status' || col.format === 'badge') && typeof v !== 'number' ? cellText(col, r) : v; };
					const dir = sort.dir === 'desc' ? -1 : 1;
					rows = rows.map((r, i) => [r, i]).sort((a, b) => {
						const d = compare(val(a[0]), val(b[0]));
						if (d === 0) return a[1] - b[1];
						return EMPTY(get(a[0], sort.field)) || EMPTY(get(b[0], sort.field)) ? d : d * dir;
					}).map((x) => x[0]);
				}
			}
			const count = server ? total : rows.length;
			let pages = 1;
			if (paging) {
				pages = Math.max(1, Math.ceil(count / paging.size));
				if (page > pages) page = pages;
				if (!server) rows = rows.slice((page - 1) * paging.size, page * paging.size);
			}
			return { rows, count, pages, filtered: !server && rows !== all && (q || activeClientFilters().length) };
		}

		const isFiltering = () => !!q || activeClientFilters().length > 0;
		const canReorder = () => !!c.reorder && !server && !groupCfg && !sort && !isFiltering();

		function groupNode(gv, n) {
			let g = groupRows.get(gv);
			const label = (groupCfg.labels && groupCfg.labels[gv]) || (EMPTY(gv) ? t('Other') : gv);
			if (!g) {
				const $btn = $('<button type="button" class="fs-table-group-toggle">').attr('data-group', gv)
					.append(icon('chevron-down').addClass('fs-table-group-chevron'), $('<span class="fs-table-group-label">'), $('<span class="fs-table-group-count fs-num">'));
				const $tr = $('<tr class="fs-table-group">').append($('<th scope="colgroup">').append($btn));
				g = { tr: $tr[0], $tr, $btn };
				groupRows.set(gv, g);
			}
			const open = !collapsed.has(gv);
			g.$tr.children('th').attr('colspan', colCount());
			g.$btn.attr('aria-expanded', String(open)).toggleClass('is-collapsed', !open);
			g.$btn.find('.fs-table-group-label').text(`${groupCfg.label ? `${groupCfg.label}: ` : ''}${label}`);
			g.$btn.find('.fs-table-group-count').text(n);
			return g.tr;
		}

		function colCount() {
			return (hasLead ? 1 : 0) + (c.toggle ? 1 : 0) + visCols().length + (rowActions.length || c.reorder || c.chooser ? 1 : 0);
		}

		function syncBody(nodes) {
			const body = $tbody[0];
			let cur = body.firstChild;
			for (const n of nodes) {
				if (n === cur) { cur = cur.nextSibling; continue; }
				body.insertBefore(n, cur);
			}
			while (cur) { const nx = cur.nextSibling; body.removeChild(cur); cur = nx; }
		}

		function render() {
			view = computeView();
			const nodes = [];
			if (groupCfg) {
				const groups = new Map();
				for (const r of view.rows) {
					const gv = String(get(r, groupCfg.field) ?? '');
					if (!groups.has(gv)) groups.set(gv, []);
					groups.get(gv).push(r);
				}
				let keys = [...groups.keys()];
				if (Array.isArray(groupCfg.order)) keys.sort((a, b) => ((groupCfg.order.indexOf(a) + 1) || 1e6) - ((groupCfg.order.indexOf(b) + 1) || 1e6));
				for (const gv of keys) {
					nodes.push(groupNode(gv, groups.get(gv).length));
					if (!collapsed.has(gv)) for (const r of groups.get(gv)) nodes.push(recFor(r).tr);
					else for (const r of groups.get(gv)) recFor(r);
				}
			} else for (const r of view.rows) nodes.push(recFor(r).tr);
			syncBody(nodes);

			/* drop cached rows that left the data set */
			if (recs.size > all.length + 50 || recs.size > 2000) {
				const ids = new Set(all.map((r) => String(get(r, key))));
				for (const id of recs.keys()) if (!ids.has(id)) recs.delete(id);
			}
			$root.toggleClass('is-reorder-off', !!c.reorder && !canReorder());
			$tbody.find('.fs-table-handle:not(.is-placeholder)').attr({
				'aria-disabled': canReorder() ? null : 'true',
				title: canReorder() ? t('Drag to reorder') : t('Clear search, filters and sorting to reorder.')
			});

			/* states */
			$skel.empty().prop('hidden', true);
			$table.attr('aria-busy', null);
			if (!all.length && !server) {
				$scroll.prop('hidden', true);
				$cardbar.addClass('is-off');
				const e = c.empty || {};
				states.empty($state.prop('hidden', false), { icon: e.icon || 'inbox', title: t(e.title || 'Nothing here yet'), text: e.text ? t(e.text) : '', action: e.action ? { ...e.action, label: t(e.action.label || '') } : null });
			} else if (!view.rows.length) {
				$scroll.prop('hidden', false);
				$cardbar.removeClass('is-off');
				$tbody.prop('hidden', true);
				if (isFiltering()) {
					states.empty($state.prop('hidden', false), { icon: 'magnifying-glass', title: t('No matching rows'), text: t('Nothing matches the search or filters.'), action: { label: t('Clear search and filters'), icon: 'xmark', onClick: clearFilters } });
				} else {
					const e = c.empty || {};
					states.empty($state.prop('hidden', false), { icon: e.icon || 'inbox', title: t(e.title || 'Nothing here yet'), text: e.text ? t(e.text) : '', action: e.action ? { ...e.action, label: t(e.action.label || '') } : null });
				}
			} else {
				$scroll.prop('hidden', false);
				$cardbar.removeClass('is-off');
				$tbody.prop('hidden', false);
				$state.prop('hidden', true).empty();
			}
			paintSelection();
			renderFoot();
		}

		function showSkeleton() {
			$state.prop('hidden', true).empty();
			$scroll.prop('hidden', false);
			$tbody.prop('hidden', true);
			$table.attr('aria-busy', 'true');
			const n = c.skeleton || 5;
			const $rows = [];
			for (let i = 0; i < n; i++) {
				const $tr = $('<tr class="fs-table-row">');
				for (let k = 0; k < colCount(); k++) $tr.append($('<td>').append($('<span class="fs-skel">').css('width', `${[72, 54, 86, 64, 78][(i + k) % 5]}%`)));
				$rows.push($tr);
			}
			$skel.empty().append($rows).prop('hidden', false);
		}

		function showError(message) {
			$skel.empty().prop('hidden', true);
			$table.attr('aria-busy', null);
			$scroll.prop('hidden', true);
			$foot.prop('hidden', true);
			states.error($state.prop('hidden', false), {
				message: message || t('Could not load this data.'),
				retry: () => { showSkeleton(); fetchData().catch((e) => showError(e && e.message)); }
			});
		}

		/* ---------------------------------------------------------- foot */
		function renderFoot() {
			if (!loaded || (!all.length && !server)) { $foot.prop('hidden', true); return; }
			$foot.empty().prop('hidden', false);
			const count = view.count;
			const noun = c.count || ['{n} row', '{n} rows'];
			let text;
			if (!server && isFiltering()) text = t('{n} of {total} shown', { n: count, total: all.length });
			else text = t(noun[0], { n: count }, noun[1]).replace(String(count), count.toLocaleString());
			$foot.append($('<span class="fs-table-count fs-num">').text(text));
			if (paging && (view.pages > 1 || paging.sizes)) {
				const from = count ? (page - 1) * paging.size + 1 : 0;
				const to = Math.min(count, page * paging.size);
				const $pager = $('<nav class="fs-table-pager">').attr('aria-label', t('Pages'));
				if (paging.sizes) {
					const $size = $('<select class="form-select form-select-sm fs-table-size">').attr('aria-label', t('Rows per page'))
						.append(paging.sizes.map((s) => $('<option>').val(String(s)).text(t('{n} per page', { n: s }))))
						.val(String(paging.size)).on('change', function () { paging.size = Number(this.value) || 25; page = 1; refreshView(); });
					$pager.append($size);
				}
				$pager.append($('<span class="fs-table-range fs-num">').text(t('{from}–{to} of {total}', { from: from.toLocaleString(), to: to.toLocaleString(), total: count.toLocaleString() })),
					$('<button type="button" class="btn btn-ghost btn-sm fs-action-icon fs-table-prev">').attr({ 'aria-label': t('Previous page'), title: t('Previous page') }).prop('disabled', page <= 1).append(icon('chevron-left')),
					$('<button type="button" class="btn btn-ghost btn-sm fs-action-icon fs-table-next">').attr({ 'aria-label': t('Next page'), title: t('Next page') }).prop('disabled', page >= view.pages).append(icon('chevron-right')));
				$foot.append($pager);
			}
		}

		function goPage(p) {
			page = Math.max(1, p);
			refreshView();
		}
		/** Re-render after a view change (search, filter, sort, page); server mode refetches. */
		function refreshView() {
			if (server) { showSkeletonIfSlow(); fetchData().catch((e) => { toast.error(e); render(); }); }
			else render();
		}
		function showSkeletonIfSlow() { $table.attr('aria-busy', 'true'); $root.addClass('is-busy'); }

		/* ------------------------------------------------------- selection */
		function selectable(row) { return c.selectable && row && !isLocked(row); }
		function pageIds() { return view.rows.filter(selectable).map((r) => String(get(r, key))); }

		function paintSelection() {
			if (!c.selectable) return;
			for (const [id, rec] of recs) {
				const on = sel.has(id);
				if (rec.$tr.hasClass('is-selected') !== on) {
					rec.$tr.toggleClass('is-selected', on);
					rec.$tr.find('.fs-table-check').prop('checked', on);
				}
			}
			const ids = pageIds();
			const n = ids.filter((id) => sel.has(id)).length;
			for (const $b of [$selAll, $selAllCard]) {
				$b.prop('checked', n > 0 && n === ids.length).prop('indeterminate', n > 0 && n < ids.length).prop('disabled', !ids.length);
			}
		}

		function selectionChanged() {
			paintSelection();
			const n = sel.size;
			const api2 = tbApi();
			if (api2 && api2.setSelection) api2.setSelection(n);
			else announce(n ? t('{n} row selected', { n }, '{n} rows selected') : t('Selection cleared'));
			$(node).trigger('fs:selection', [{ ids: [...sel], count: n }]);
		}

		function clearSelection() { if (!sel.size) return; sel.clear(); anchor = null; selectionChanged(); }

		function pruneSelection() {
			if (!sel.size) return;
			const ids = new Set(all.filter(selectable).map((r) => String(get(r, key))));
			let changed = false;
			for (const id of [...sel]) if (!ids.has(id)) { sel.delete(id); changed = true; }
			if (changed) selectionChanged();
		}

		/* Shift+click selects a range; the click comes before the change event. */
		let rangeDone = false;
		$table.on(`click${ns}`, 'tbody .fs-table-check', function (e) {
			rangeDone = false;
			if (!e.shiftKey || anchor === null) return;
			const id = this.closest('tr').getAttribute('data-id');
			rangeSelect(anchor, id, this.checked);
			anchor = id;
			rangeDone = true;
			selectionChanged();
		});
		$table.on(`change${ns}`, 'tbody .fs-table-check', function () {
			if (rangeDone) { rangeDone = false; return; }
			const id = this.closest('tr').getAttribute('data-id');
			if (this.checked) sel.add(id); else sel.delete(id);
			anchor = id;
			selectionChanged();
		});
		function rangeSelect(a, b, on) {
			const ids = view.rows.map((r) => String(get(r, key)));
			let i = ids.indexOf(a), j = ids.indexOf(b);
			if (i < 0 || j < 0) { if (on) sel.add(b); else sel.delete(b); return; }
			if (i > j) [i, j] = [j, i];
			for (let k = i; k <= j; k++) {
				const r = view.rows[k];
				if (!selectable(r)) continue;
				if (on) sel.add(ids[k]); else sel.delete(ids[k]);
			}
		}
		const selectPage = (on) => { for (const id of pageIds()) { if (on) sel.add(id); else sel.delete(id); } selectionChanged(); };
		$selAll.on('change', function () { selectPage(this.checked); });
		$selAllCard.on('change', function () { selectPage(this.checked); });
		$sortSel.on('change', function () {
			const [f, d] = String(this.value).split(':');
			sort = f ? { field: f, dir: d } : (c.sort ? { field: c.sort.field || c.sort, dir: c.sort.dir || 'asc' } : null);
			page = 1;
			buildHead();
			refreshView();
		});

		/* ----------------------------------------------------------- sort */
		$thead.on(`click${ns}`, '.fs-table-sort', function () {
			const f = this.getAttribute('data-field');
			if (!sort || sort.field !== f) sort = { field: f, dir: 'asc' };
			else if (sort.dir === 'asc') sort = { field: f, dir: 'desc' };
			else sort = null;
			page = 1;
			buildHead();
			$thead.find(`.fs-table-sort[data-field="${CSS.escape(f)}"]`).trigger('focus');
			refreshView();
			const col = cols.find((x) => x.field === f);
			announce(sort ? t('Sorted by {col}, {dir}', { col: col.label, dir: sort.dir === 'asc' ? t('ascending') : t('descending') }) : t('Default order'));
		});

		/* ----------------------------------------------------------- foot */
		$foot.on(`click${ns}`, '.fs-table-prev', () => goPage(page - 1));
		$foot.on(`click${ns}`, '.fs-table-next', () => goPage(page + 1));

		/* --------------------------------------------------------- groups */
		$tbody.on(`click${ns}`, '.fs-table-group-toggle', function () {
			const gv = this.getAttribute('data-group');
			if (collapsed.has(gv)) collapsed.delete(gv); else collapsed.add(gv);
			render();
			$tbody.find(`.fs-table-group-toggle[data-group="${CSS.escape(gv)}"]`).trigger('focus');
		});

		/* -------------------------------------------------------- rowLink */
		$tbody.on(`click${ns}`, 'tr.fs-table-row.is-link', function (e) {
			if (e.defaultPrevented || $(e.target).closest('a, button, input, label, select, .dropdown-menu, .fs-table-lead, .fs-table-toggle-cell, .fs-table-actions').length) return;
			if (window.getSelection && String(window.getSelection()).length) return;
			const href = $(this).find('.fs-table-link').attr('href');
			if (!href) return;
			if (href.startsWith('#')) location.hash = href.slice(1);
			else if (e.ctrlKey || e.metaKey) window.open(href, '_blank', 'noopener');
			else nav.go(href);
		});

		/* --------------------------------------------------------- toggle */
		$tbody.on(`change${ns}`, '.fs-table-switch-input', function () {
			const $in = $(this);
			const id = this.closest('tr').getAttribute('data-id');
			const rec = recs.get(id);
			if (!rec) return;
			const tg = c.toggle;
			const on = this.checked;
			const row = rec.row;
			const prev = get(row, tg.field);
			overrides.set(id, { ...(overrides.get(id) || {}), [tg.field]: on });
			row[tg.field] = on;
			rec.$tr.toggleClass('is-off', !on);
			rec.sig = sigOf(row);
			const body = { [tg.field]: on, ...(tg.body || {}) };
			api.request((tg.method || 'PATCH').toUpperCase(), fill(tg.path, row, { encode: true, key }), body).then((res) => {
				clearOverride(id, tg.field);
				if (tg.pending !== false) $(node).trigger('fs:pending', [{ path: tg.path, id }]);
				announce(on ? t('{name} enabled', { name: nameOf(row) }) : t('{name} disabled', { name: nameOf(row) }));
				$(node).trigger('fs:toggle', [{ id, field: tg.field, value: on, response: res }]);
			}, (e) => {
				clearOverride(id, tg.field);
				const cur = recs.get(id);
				if (cur) {
					cur.row[tg.field] = prev;
					cur.$tr.toggleClass('is-off', !prev);
					cur.$tr.find('.fs-table-switch-input').prop('checked', !!prev);
					cur.sig = sigOf(cur.row);
				} else $in.prop('checked', !!prev);
				toast.error(e);
			});
		});
		function clearOverride(id, field) {
			const o = overrides.get(id);
			if (!o) return;
			delete o[field];
			if (!Object.keys(o).length) overrides.delete(id);
		}

		/* ---------------------------------------------------- row actions */
		function ensureMenu(btn) {
			const tr = btn.closest('tr');
			const rec = tr && recs.get(tr.getAttribute('data-id'));
			if (!rec) return;
			const row = rec.row;
			const card = isCard();
			const locked = isLocked(row);
			const items = [];
			for (const a of rowActions) {
				if ((a.inline && !card) || !visibleFor(a, row)) continue;
				const blocked = locked && blockedOnLocked(a);
				items.push({ id: a.id, label: fill(a.label, row, { key }), icon: a.icon, danger: a.danger, disabled: blocked, href: a.href && !blocked ? fill(a.href, row, { encode: true, key }) : undefined });
			}
			if (c.reorder && !locked) {
				if (items.length) items.push({ divider: true });
				const ok = canReorder();
				items.push({ id: '__up', label: t('Move up'), icon: 'arrow-up', disabled: !ok || !canMove(rec.id, -1) },
					{ id: '__down', label: t('Move down'), icon: 'arrow-down', disabled: !ok || !canMove(rec.id, 1) });
			}
			const $ul = $(btn).siblings('.dropdown-menu');
			$ul.empty().append(menuItems(items, (a) => {
				if (a.id === '__up' || a.id === '__down') moveBy(rec.id, a.id === '__up' ? -1 : 1, '.fs-table-menu-toggle');
				else runRowAction(a.id, rec.id, btn);
			}));
			if (!Dropdown.getInstance(btn)) new Dropdown(btn, { popperConfig: (d) => ({ ...d, strategy: 'fixed' }) });
		}
		$tbody.on(`pointerdown${ns} focusin${ns}`, '.fs-table-menu-toggle', function () { ensureMenu(this); });
		$tbody.on(`click${ns}`, '.fs-table-inline', function () {
			if (this.tagName === 'A') return;
			const tr = this.closest('tr');
			runRowAction(this.getAttribute('data-fs-action'), tr.getAttribute('data-id'), this);
		});

		async function runRowAction(actionId, id, trigger) {
			const a = rowActions.find((x) => x.id === actionId);
			const rec = recs.get(id);
			if (!a || !rec) return;
			const row = rec.row;
			if (isLocked(row) && blockedOnLocked(a)) return;
			const ev = $.Event('fs:row-action');
			$(node).trigger(ev, [{ id: a.id, key: get(row, key), row }]);
			if (ev.isDefaultPrevented() || !a.api) return;
			const A = a.api;
			if (A.confirm) {
				const cf = typeof A.confirm === 'string' ? { title: A.confirm } : A.confirm;
				const o = { ...cf, title: fill(t(cf.title || 'Are you sure?'), row, { key }), text: cf.text ? fill(t(cf.text), row, { key }) : undefined,
					confirmLabel: cf.confirmLabel ? t(cf.confirmLabel) : (a.danger ? t(a.label) : undefined), danger: cf.danger ?? !!a.danger };
				const ok = cf.typed ? await dangerConfirm({ ...o, name: fill(cf.typed === true ? `{${nameField}}` : cf.typed, row, { key }) }) : await confirm(o);
				if (!ok) return;
			}
			rec.$tr.addClass('is-busy');
			try {
				const body = A.body !== undefined ? fillDeep(A.body, row, key) : undefined;
				const method = (A.method || 'POST').toUpperCase();
				const res = await api.request(method, fill(A.path, row, { encode: true, key }), method === 'DELETE' && body === undefined ? null : (body ?? {}));
				const meta = (res && res.meta) || {};
				const msg = A.success ? fill(t(A.success), row, { key }) : meta.message;
				if (msg) toast(msg, { level: 'ok' });
				if (meta.pending || A.pending) $(node).trigger('fs:pending', [{ path: A.path, id }]);
				$(node).trigger('fs:done', [{ id: a.id, key: get(row, key), response: res }]);
				if (method === 'DELETE') { sel.delete(id); }
				await fetchData().catch(() => {});
				if (trigger && !document.body.contains(trigger)) $tbody.find('.fs-table-menu-toggle').first().trigger('focus');
			} catch (e) {
				toast.error(e);
			} finally {
				const cur = recs.get(id);
				if (cur) cur.$tr.removeClass('is-busy');
			}
		}

		/* ----------------------------------------------------------- bulk */
		async function runBulk(b) {
			const ids = [...sel].filter((id) => recs.get(id) && selectable(recs.get(id).row));
			if (!ids.length) return;
			const rows = ids.map((id) => recs.get(id).row);
			const n = ids.length;
			const ev = $.Event('fs:bulk-action');
			$(node).trigger(ev, [{ id: b.id, keys: rows.map((r) => get(r, key)), rows }]);
			if (ev.isDefaultPrevented() || !b.api) return;
			if (b.confirm) {
				const cf = typeof b.confirm === 'string' ? { title: b.confirm } : b.confirm;
				const ok = await confirm({ ...cf, title: t(cf.title || 'Are you sure?', { n }), text: cf.text ? t(cf.text, { n }) : undefined,
					details: rows.slice(0, 8).map(nameOf).concat(n > 8 ? [t('and {n} more', { n: n - 8 })] : []),
					confirmLabel: cf.confirmLabel ? t(cf.confirmLabel) : t(b.label), danger: cf.danger ?? !!b.danger });
				if (!ok) return;
			}
			const A = b.api;
			const method = (A.method || 'POST').toUpperCase();
			$root.addClass('is-busy');
			rows.forEach((r) => { const rec = recs.get(String(get(r, key))); if (rec) rec.$tr.addClass('is-busy'); });
			let results;
			if (A.ids) {
				const body = { ...(A.body || {}), [A.ids === true ? 'ids' : A.ids]: rows.map((r) => get(r, key)) };
				results = await api.request(method, A.path, body).then((value) => [{ ok: true, value }], (error) => [{ ok: false, error }]);
			} else {
				results = await pool(rows.map((r) => () => {
					const body = A.body !== undefined ? fillDeep(A.body, r, key) : undefined;
					return api.request(method, fill(A.path, r, { encode: true, key }), method === 'DELETE' && body === undefined ? null : (body ?? {}));
				}));
			}
			$root.removeClass('is-busy');
			const failed = results.filter((x) => !x.ok);
			const done = A.ids ? (failed.length ? 0 : n) : n - failed.length;
			if (done) {
				const meta = (A.ids && results[0].ok && results[0].value && results[0].value.meta) || {};
				toast(meta.message || (b.success ? t(b.success, { n: done }) : t('{label}: {n} done', { label: t(b.label || b.id), n: done })), { level: 'ok' });
				if (b.pending !== false) $(node).trigger('fs:pending', [{ path: A.path, ids }]);
			}
			if (failed.length) {
				const msg = (failed[0].error && failed[0].error.message) || t('The request failed.');
				toast(A.ids ? msg : t('{failed} of {n} failed: {message}', { failed: failed.length, n, message: msg }), { level: 'crit' });
			}
			sel.clear();
			anchor = null;
			selectionChanged();
			await fetchData().catch(() => {});
			$tbody.find('.is-busy').removeClass('is-busy');
		}

		/* -------------------------------------------------------- reorder */
		const globalIds = () => all.map((r) => String(get(r, key)));
		function lockedOk(oldIds, newIds) {
			for (let i = 0; i < oldIds.length; i++) {
				const rec = recs.get(oldIds[i]);
				if (rec && isLocked(rec.row) && newIds[i] !== oldIds[i]) return false;
			}
			return true;
		}
		function canMove(id, d) {
			const ids = globalIds();
			const i = ids.indexOf(id);
			const j = i + d;
			if (i < 0 || j < 0 || j >= ids.length) return false;
			const next = ids.slice();
			[next[i], next[j]] = [next[j], next[i]];
			return lockedOk(ids, next);
		}
		function moveBy(id, d, focusSel) {
			if (!canReorder()) { announce(t('Clear search, filters and sorting to reorder.')); return; }
			if (!canMove(id, d)) { announce(t('This row cannot move further.')); return; }
			const ids = globalIds();
			const i = ids.indexOf(id);
			[ids[i], ids[i + d]] = [ids[i + d], ids[i]];
			if (paging) page = Math.floor((i + d) / paging.size) + 1;
			commitOrder(ids, id);
			const rec = recs.get(id);
			if (rec && focusSel) $(rec.tr).find(focusSel).first().trigger('focus');
		}

		function applyOrder(ids) {
			const by = new Map(all.map((r) => [String(get(r, key)), r]));
			const next = ids.map((id) => by.get(id)).filter(Boolean);
			for (const r of all) if (!ids.includes(String(get(r, key)))) next.push(r);
			all = next;
			if (c.reorder.field) all.forEach((r, i) => { r[c.reorder.field] = i + 1; });
		}

		function commitOrder(ids, movedId) {
			const before = all.slice();
			const beforePos = c.reorder.field ? before.map((r) => r[c.reorder.field]) : null;
			applyOrder(ids);
			pendingOrder = ids;
			render();
			const R = c.reorder;
			const body = { ...(R.body || {}) };
			for (const p of R.params || []) if (query[p] !== undefined) body[p] = query[p];
			const byId = new Map(before.map((r) => [String(get(r, key)), get(r, key)]));
			body[R.idsKey || 'ids'] = ids.map((id) => byId.get(id) ?? id);
			const rec = recs.get(movedId);
			const pos = ids.indexOf(movedId) + 1;
			announce(t('{name} moved to position {n} of {total}', { name: rec ? nameOf(rec.row) : movedId, n: pos, total: ids.length }));
			api.request((R.method || 'POST').toUpperCase(), R.path, body).then(() => {
				pendingOrder = null;
				if (R.pending !== false) $(node).trigger('fs:pending', [{ path: R.path }]);
				$(node).trigger('fs:reorder', [{ ids: body[R.idsKey || 'ids'] }]);
			}, (e) => {
				pendingOrder = null;
				all = before;
				if (beforePos) all.forEach((r, i) => { r[c.reorder.field] = beforePos[i]; });
				render();
				toast.error(e);
				announce(t('The order was not saved.'));
			});
		}

		$tbody.on(`keydown${ns}`, '.fs-table-handle', function (e) {
			if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
			e.preventDefault();
			moveBy(this.closest('tr').getAttribute('data-id'), e.key === 'ArrowUp' ? -1 : 1, '.fs-table-handle');
		});

		$tbody.on(`pointerdown${ns}`, '.fs-table-handle:not(.is-placeholder)', function (e) {
			if (e.button !== 0 || !canReorder()) return;
			const handle = this;
			const tr = handle.closest('tr');
			const body = $tbody[0];
			const domIds = () => [...body.querySelectorAll(':scope > tr.fs-table-row')].map((r) => r.getAttribute('data-id'));
			const start = domIds();
			const startY = e.clientY;
			let moved = false;
			try { handle.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
			e.preventDefault();
			const move = (ev) => {
				if (!moved && Math.abs(ev.clientY - startY) < 4) return;
				if (!moved) { moved = true; tr.classList.add('is-dragging'); $root.addClass('is-dragging'); }
				const rows = [...body.querySelectorAll(':scope > tr.fs-table-row')];
				let before = null;
				for (const r of rows) {
					if (r === tr) continue;
					const b = r.getBoundingClientRect();
					if (ev.clientY < b.top + b.height / 2) { before = r; break; }
				}
				if (before ? tr.nextElementSibling !== before : body.lastElementChild !== tr) body.insertBefore(tr, before);
				if (ev.clientY < 48) window.scrollBy(0, -14);
				else if (ev.clientY > window.innerHeight - 48) window.scrollBy(0, 14);
			};
			const end = (ev) => {
				handle.removeEventListener('pointermove', move);
				handle.removeEventListener('pointerup', end);
				handle.removeEventListener('pointercancel', end);
				tr.classList.remove('is-dragging');
				$root.removeClass('is-dragging');
				if (!moved) { handle.focus(); return; }
				const now = domIds();
				if (ev.type === 'pointercancel' || now.join() === start.join()) { render(); return; }
				const ids = globalIds();
				const offset = ids.indexOf(start[0]);
				const next = ids.slice(0, offset).concat(now, ids.slice(offset + now.length));
				if (!lockedOk(ids, next)) { render(); announce(t('Locked rows keep their position.')); toast(t('Locked rows keep their position.'), { level: 'warn' }); return; }
				const id = tr.getAttribute('data-id');
				commitOrder(next, id);
				const rec = recs.get(id);
				if (rec) $(rec.tr).find('.fs-table-handle').trigger('focus');
			};
			handle.addEventListener('pointermove', move);
			handle.addEventListener('pointerup', end);
			handle.addEventListener('pointercancel', end);
		});

		/* -------------------------------------------------------- toolbar */
		function wireToolbar() {
			if (!$tb.length) return;
			const a = tbApi();
			if (a && a.values) {
				tbInitial = a.values();
				q = tbInitial.q || '';
				for (const [id, v] of Object.entries(tbInitial.filters || {})) {
					const d = filterDefs[id];
					if (d && d.query) { if (v !== '' && v != null && query[d.query] === undefined) query[d.query] = v; }
					else filt[id] = v;
				}
			}
			$tb.on(`fs:search${ns}`, (e, d) => { q = (d && d.q) || ''; page = 1; refreshView(); announceCount(); });
			$tb.on(`fs:filter${ns}`, (e, d) => {
				if (!d) return;
				const def = filterDefs[d.id];
				if (def && def.query) { api2.setQuery({ [def.query]: d.value === '' ? null : d.value }); return; }
				filt[d.id] = d.value;
				page = 1;
				refreshView();
				announceCount();
			});
			$tb.on(`fs:selection-clear${ns}`, () => { clearSelection(); });
			$tb.on(`fs:action${ns}`, (e, d) => {
				if (!d || !d.bulk) return;
				const b = bulkActions.find((x) => x.id === d.id);
				if (!b) return;
				e.stopPropagation();
				runBulk(b);
			});
		}
		function announceCount() {
			if (server) return;
			const n = view.count;
			announce(t('{n} row shown', { n }, '{n} rows shown'));
		}
		function clearFilters() {
			q = '';
			for (const id of Object.keys(filt)) filt[id] = (tbInitial.filters || {})[id] ?? '';
			const a = tbApi();
			if (a) {
				if (a.setSearch) a.setSearch('');
				if (a.setFilter) for (const id of Object.keys(filt)) a.setFilter(id, filt[id]);
			}
			page = 1;
			refreshView();
			const $f = $tb.find('input[type="search"]');
			if ($f.length) $f.trigger('focus');
		}

		/* ------------------------------------------------------------ data */
		function buildQuery() {
			const out = { ...query };
			for (const k of Object.keys(out)) if (out[k] == null) delete out[k];
			if (server) {
				out.page = page;
				out.limit = paging.size;
				if (q) out.q = q;
				if (sort) { out.sort = sort.field; out.dir = sort.dir; }
				for (const [id, v] of Object.entries(filt)) {
					const d = filterDefs[id] || {};
					if (d.query || v == null || v === '' || v === 'all' || (Array.isArray(v) && !v.length)) continue;
					out[d.param || id] = Array.isArray(v) ? v.join(',') : v;
				}
			}
			return out;
		}

		let reqSeq = 0;
		let applied = 0;
		function fetchData() {
			const my = ++reqSeq;
			const qq = buildQuery();
			const qk = JSON.stringify(qq);
			return batch.get(c.source.path, qq).then((res) => {
				if (my < applied || qk !== JSON.stringify(buildQuery())) return;
				applied = my;
				ingest(res || {});
			}).finally(() => { $root.removeClass('is-busy'); });
		}

		function ingest(res) {
			const d = res.data;
			let rows = Array.isArray(d) ? d : (d && Array.isArray(d.items) ? d.items : []);
			rows = rows.filter((r) => r && typeof r === 'object');
			for (const r of rows) {
				const o = overrides.get(String(get(r, key)));
				if (o) Object.assign(r, o);
			}
			total = (res.meta && typeof res.meta.total === 'number') ? res.meta.total : rows.length;
			all = rows;
			if (pendingOrder) applyOrder(pendingOrder);
			const first = !loaded;
			loaded = true;
			render();
			pruneSelection();
			states.stale($root, false);
			$(node).trigger('fs:table-loaded', [{ rows: all.length, total, first, meta: res.meta || {} }]);
		}

		if (!c.source || !c.source.path) {
			buildHead();
			showError(t('No data source configured.'));
			return {};
		}

		buildHead();
		wireToolbar();
		showSkeleton();
		const task = ctx.live({
			every: c.every || 0,
			run: fetchData,
			onState(s, info) {
				ctx.state(s);
				if (s === 'error' && !loaded) showError(info.error);
				if (s === 'stale' || (s === 'error' && loaded)) states.stale($root, true);
			}
		});

		function rebuild() {
			recs.clear();
			groupRows.clear();
			$tbody.empty();
			buildHead();
			if (loaded) render(); else showSkeleton();
		}

		const api2 = {
			/** Fetch again now (keeps the current rows until the answer arrives). */
			reload() { return fetchData().catch((e) => { if (loaded) states.stale($root, true); else showError(e && e.message); throw e; }); },
			/** Selected row keys (in the row key's original type). */
			getSelection() { return [...sel].map((id) => (recs.get(id) ? get(recs.get(id).row, key) : id)); },
			/** Selected rows. */
			getSelectedRows() { return [...sel].map((id) => recs.get(id) && recs.get(id).row).filter(Boolean); },
			clearSelection,
			/** Set a filter value (as from the toolbar) and update the view. */
			setFilter(id, value) {
				const d = filterDefs[id];
				if (d && d.query) { api2.setQuery({ [d.query]: value }); return; }
				filt[id] = value;
				const a = tbApi();
				if (a && a.setFilter) a.setFilter(id, value);
				page = 1;
				refreshView();
			},
			/** Set the search text and update the view. */
			setSearch(text) {
				q = String(text || '').trim();
				const a = tbApi();
				if (a && a.setSearch) a.setSearch(q);
				page = 1;
				refreshView();
			},
			/** Merge source query parameters (null removes one), e.g. {interface: 'lan'}, and load again. */
			setQuery(params) {
				for (const [k, v] of Object.entries(params || {})) { if (v == null) delete query[k]; else query[k] = v; }
				sel.clear();
				anchor = null;
				selectionChanged();
				page = 1;
				pendingOrder = null;
				showSkeleton();
				return fetchData().catch((e) => showError(e && e.message));
			},
			/** Current query parameters. */
			getQuery() { return { ...query }; },
			/** Rows as loaded (before search and filters). */
			rows() { return all.slice(); },
			/** Rows currently shown (after search, filters, sort and paging). */
			visibleRows() { return view.rows.slice(); },
			/** Sort by a field ('asc' | 'desc'), or null for the default order. */
			setSort(field, dir = 'asc') { sort = field ? { field, dir } : null; page = 1; buildHead(); refreshView(); },
			page(p) { if (p === undefined) return page; goPage(p); return page; },
			destroy() {
				$tb.off(ns);
				disposeMenus(node);
				$(document).off(ns);
			}
		};
		void task;
		return api2;
	}
});
