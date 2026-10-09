/*
 * log-viewer.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * log-viewer — live tail plus history of a log (firewall, system, …) with
 * the log cursor protocol:
 *   ?after=<id>   newer entries (live tail), oldest first
 *   ?before=<id>  an older page (infinite scroll), newest first
 *   ?limit ?q + per-log filters; meta.last_id is the next ?after= cursor.
 * Newest entries are on top. While the user is scrolled away from the top
 * (or the view is paused) new entries wait behind an "N new entries" pill,
 * so the rows never jump. The DOM holds at most maxRows rows. A row opens
 * the drawer with every field and quick actions. See spec.md.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { batch } from '../../js/batch.js';
import { live } from '../../js/live.js';
import { states } from '../../js/states.js';
import { fmt } from '../../js/fmt.js';
import { t } from '../../js/i18n.js';
import { statusNode } from '../status/status.js';
import { childNode, startChildren } from '../card/nest.js';
import { drawer } from '../drawer/drawer.js';
import { toast } from '../toast/toast.js';
import { icon } from '../console/console.js';

/* ------------------------------------------------------------ log types */

const ACTION = { pass: ['pass', 'Pass'], block: ['block', 'Block'], reject: ['reject', 'Reject'], match: ['match', 'Match'] };
const SEVERITY = {
	emerg: ['crit', 'Emergency'], alert: ['crit', 'Alert'], crit: ['crit', 'Critical'], error: ['crit', 'Error'], err: ['crit', 'Error'],
	warning: ['warn', 'Warning'], warn: ['warn', 'Warning'], notice: ['info', 'Notice'], info: ['neutral', 'Info'], debug: ['neutral', 'Debug']
};
/** "host:port", "[v6]:port" or "host". */
export const hostPort = (h, p) => (h == null ? '—' : p == null ? String(h) : String(h).includes(':') ? `[${h}]:${p}` : `${h}:${p}`);

/* Column: label, cell(entry) → node or text, mono, cls. */
const COLUMNS = {
	firewall: {
		action: { label: 'Action', cell: (e) => { const [s, l] = ACTION[e.action] || ['neutral', e.action || '—']; return statusNode(s, t(l), { variant: 'pill' }); } },
		time: { label: 'Time', mono: true, cell: (e) => $('<time>').attr({ datetime: e.time, title: fmt.datetime(e.time) }).text(fmt.time(e.time)) },
		iface: { label: 'Interface', cell: (e) => e.iface_descr || e.iface || '—' },
		dir: { label: 'Direction', cell: (e) => $('<span class="fs-log-viewer-dir">').append(icon(e.dir === 'out' ? 'arrow-right-from-bracket' : 'arrow-right-to-bracket'), $('<span>').text(e.dir === 'out' ? t('out') : t('in'))) },
		src: { label: 'Source', mono: true, cell: (e) => hostPort(e.src, e.srcport) },
		dst: { label: 'Destination', mono: true, cell: (e) => hostPort(e.dst, e.dstport) },
		proto: { label: 'Protocol', mono: true, cell: (e) => e.proto || '—' },
		rule: { label: 'Rule', cls: 'is-wide', cell: (e) => $('<span class="fs-log-viewer-rule">').attr('title', e.rule || '').text(e.rule || '—') }
	},
	system: {
		time: { label: 'Time', mono: true, cell: (e) => $('<time>').attr({ datetime: e.time, title: fmt.datetime(e.time) }).text(fmt.time(e.time)) },
		severity: { label: 'Severity', cell: (e) => { const [s, l] = SEVERITY[e.severity] || ['neutral', e.severity || '—']; return statusNode(s, t(l), { variant: 'pill' }); } },
		process: { label: 'Process', mono: true, cell: (e) => (e.pid ? `${e.process}[${e.pid}]` : e.process || '—') },
		message: { label: 'Message', mono: true, cls: 'is-wide is-message', cell: (e) => e.message || '' }
	}
};

function typeOf(c) {
	if (c.type) return c.type;
	return /firewall/.test((c.source && c.source.path) || '') ? 'firewall' : 'system';
}

function defaultFilters(type, opts, severity = true) {
	if (type === 'firewall') {
		const f = [{ id: 'action', type: 'chips', multiple: true, label: t('Action'), value: [], options: [
			{ value: 'pass', label: t('Pass'), icon: 'circle-check' }, { value: 'block', label: t('Block'), icon: 'ban' }, { value: 'reject', label: t('Reject'), icon: 'circle-minus' }] }];
		if (opts.interfaces && opts.interfaces.length) f.push({ id: 'iface', label: t('Interface'), all: t('All interfaces'), options: opts.interfaces });
		return f;
	}
	const f = severity ? [{ id: 'severity', type: 'chips', multiple: true, label: t('Severity'), value: [], options: [
		{ value: 'error', label: t('Error'), icon: 'circle-xmark' }, { value: 'warning', label: t('Warning'), icon: 'triangle-exclamation' },
		{ value: 'notice', label: t('Notice'), icon: 'circle-info' }, { value: 'info', label: t('Info'), icon: 'circle' }] }] : [];
	if (opts.processes && opts.processes.length) f.push({ id: 'process', label: t('Process'), all: t('All processes'), options: opts.processes });
	return f;
}

/* ------------------------------------------------------------- element */

el.define('log-viewer', {
	init(node, config, ctx) {
		const type = typeOf(config);
		const c = {
			title: type === 'firewall' ? 'Firewall log' : 'System log', every: 2, limit: 100, maxRows: 1000, height: '36rem',
			live: true, search: true, filters: true, summary: false, columns: null, ruleHref: '/security/rules?rule={rule_id}', severity: true,
			...config
		};
		const defs = COLUMNS[type] || COLUMNS.system;
		/* severity: false = the log has no severity (FreeBSD syslog files): no column, chips or error/warning tiles. */
		const noSeverity = type !== 'firewall' && !c.severity;
		const cols = (c.columns || Object.keys(defs)).filter((k) => defs[k] && !(noSeverity && k === 'severity')).map((k) => ({ id: k, ...defs[k] }));

		const $node = $(node).addClass('fs-log-viewer').empty().attr('data-log', type);
		const $bar = $('<div class="fs-log-viewer-bar">');
		const $tbHost = $('<div class="fs-log-viewer-tools">');
		const $liveBtn = $('<button type="button" class="btn btn-secondary btn-sm fs-log-viewer-live">');
		$bar.append($tbHost, c.live ? $liveBtn : null);
		const $summary = $('<div class="fs-log-viewer-summary" hidden>');
		const $frame = $('<div class="fs-log-viewer-frame">');
		const $pill = $('<button type="button" class="btn btn-primary btn-sm fs-log-viewer-pill" hidden>');
		const $scroll = $('<div class="fs-log-viewer-scroll" tabindex="0">').attr('aria-label', t('{title}: Space pauses or resumes, Enter on a row shows details', { title: t(c.title) }));
		if (c.height !== 'auto') $scroll.css('max-height', c.height);
		const $state = $('<div class="fs-log-viewer-state">');
		const $table = $('<table class="fs-log-viewer-table">').append($('<caption class="visually-hidden">').text(t(c.title)));
		const $thead = $('<thead>').append($('<tr>').append(cols.map((col) => $('<th scope="col">').attr('data-col', col.id).addClass(col.cls || '').text(t(col.label)))));
		const $tbody = $('<tbody>');
		$table.append($thead, $tbody).prop('hidden', true);
		const $more = $('<div class="fs-log-viewer-more">');
		const $older = $('<button type="button" class="btn btn-ghost btn-sm">').append(icon('angles-down'), document.createTextNode(` ${t('Load older')}`));
		const $end = $('<span class="fs-log-viewer-end">').text(t('Beginning of the log'));
		const $sentinel = $('<div class="fs-log-viewer-sentinel" aria-hidden="true">');
		$more.append($older, $end, $sentinel).prop('hidden', true);
		$scroll.append($state, $table, $more);
		$frame.append($pill, $scroll);
		const $announce = $('<span class="visually-hidden" role="status" aria-live="polite">');
		$node.append($bar, $summary, $frame, $announce);

		/* state */
		let rows = []; /* newest first, same order as the DOM */
		let pending = []; /* newest first, waiting behind the pill */
		let gap = false; /* pending overflowed: the pill reloads instead of merging */
		let detached = false; /* the newest rows were trimmed by loading older pages */
		let cursor = 0;
		let loaded = false;
		let hasMore = false;
		let loadingOlder = false;
		let paused = !c.live;
		let gen = 0;
		let q = (c.search && c.search.value) || '';
		let filters = { ...(c.filterValues || {}) };
		let toolbar = null;
		let tiles = null;

		const baseQuery = () => {
			const out = { ...((c.source && c.source.query) || {}) };
			if (q) out.q = q;
			for (const [k, v] of Object.entries(filters)) {
				const val = Array.isArray(v) ? v.join(',') : v;
				if (val !== '' && val != null) out[k] = val;
			}
			return out;
		};
		const atTop = () => !detached && $scroll[0].scrollTop < 8;

		/* -------------------------------------------------------- rows */

		function rowNode(e) {
			const $tr = $('<tr tabindex="0">').attr('data-id', e.id);
			if (type === 'firewall' && e.action) $tr.attr('data-action', e.action);
			if (type !== 'firewall' && e.severity) $tr.attr('data-severity', e.severity);
			for (const col of cols) {
				const v = col.cell(e);
				const $td = $('<td>').attr('data-col', col.id).attr('data-label', t(col.label)).addClass(col.cls || '').toggleClass('fs-mono', !!col.mono);
				if (v && (v.jquery || v.nodeType)) $td.append(v); else $td.text(v == null ? '' : String(v));
				$tr.append($td);
			}
			return $tr;
		}

		function showTable() {
			const has = rows.length > 0;
			$table.prop('hidden', !has);
			$more.prop('hidden', !has);
			if (has) $state.empty();
			$older.prop('hidden', !hasMore).prop('disabled', loadingOlder);
			$end.prop('hidden', hasMore);
		}

		function showEmpty() {
			const filtered = q || Object.values(filters).some((v) => (Array.isArray(v) ? v.length : v));
			states.empty($state, filtered
				? { icon: 'filter', title: t('No entries match'), text: t('Try another search or clear the filters.') }
				: { icon: 'scroll', title: t('No log entries yet'), text: paused ? '' : t('New entries appear here as they are logged.') });
		}

		/** Add entries (newest first) at the top. */
		function prepend(list, { highlight = true } = {}) {
			if (!list.length) return;
			$tbody.children('.is-new').removeClass('is-new');
			const frag = document.createDocumentFragment();
			for (const e of list) frag.appendChild(rowNode(e).toggleClass('is-new', highlight)[0]);
			$tbody[0].insertBefore(frag, $tbody[0].firstChild);
			rows = list.concat(rows);
			if (rows.length > c.maxRows) {
				const extra = rows.length - c.maxRows;
				rows.length = c.maxRows;
				$tbody.children().slice(-extra).remove();
				hasMore = true;
			}
			showTable();
			paintSummary();
		}

		/** Add an older page (newest first) at the bottom. */
		function append(list) {
			if (!list.length) return;
			const frag = document.createDocumentFragment();
			for (const e of list) frag.appendChild(rowNode(e)[0]);
			$tbody[0].appendChild(frag);
			rows = rows.concat(list);
			if (rows.length > c.maxRows) {
				/* keep the DOM bounded: drop the newest rows; "Jump to latest" brings them back */
				const extra = rows.length - c.maxRows;
				const h0 = $scroll[0].scrollHeight;
				const top0 = $scroll[0].scrollTop;
				$tbody.children().slice(0, extra).remove();
				rows = rows.slice(extra);
				$scroll[0].scrollTop = top0 - (h0 - $scroll[0].scrollHeight);
				detached = true;
				gap = true;
				paintPill();
			}
			showTable();
			paintSummary();
		}

		/* ------------------------------------------------------ pill */

		function paintPill() {
			const n = pending.length;
			if (!n && !detached) { $pill.prop('hidden', true); return; }
			$pill.prop('hidden', false).empty().append(icon('arrow-up'), $('<span>').text(
				n ? (gap || detached ? t('{n}+ new entries · Jump to latest', { n: Math.min(n, c.maxRows) }) : t('{n} new entry', { n }, '{n} new entries')) : t('Jump to latest')));
		}

		function mergePending() {
			if (gap || detached) { reset(); return; }
			const list = pending;
			pending = [];
			prepend(list);
			paintPill();
		}

		$pill.on('click', () => {
			mergePending();
			$scroll[0].scrollTop = 0;
			$scroll.trigger('focus');
		});

		/* ----------------------------------------------------- loading */

		function initialLoad(myGen) {
			return batch.get(c.source.path, { ...baseQuery(), limit: c.limit }).then((res) => {
				if (myGen !== gen) return;
				const list = res.data || [];
				const meta = res.meta || {};
				cursor = meta.last_id || (list[0] && list[0].id) || 0;
				hasMore = !!meta.has_more;
				loaded = true;
				$tbody.empty();
				rows = [];
				if (!list.length) { showTable(); showEmpty(); paintSummary(); return; }
				prepend(list, { highlight: false });
				if (!processesKnown) learnProcesses(list);
			});
		}

		function tail(myGen) {
			return batch.get(c.source.path, { ...baseQuery(), after: cursor, limit: 500 }).then((res) => {
				if (myGen !== gen) return;
				const meta = res.meta || {};
				const fresh = (res.data || []).slice().reverse(); /* → newest first */
				if (meta.last_id) cursor = meta.last_id;
				else if (fresh.length) cursor = fresh[0].id;
				if (!fresh.length) return;
				if (fresh.length >= 500) gap = true;
				if (atTop() && !pending.length && !paused) {
					const wasEmpty = !rows.length;
					prepend(fresh);
					if (wasEmpty) showTable();
				} else {
					pending = fresh.concat(pending);
					if (pending.length > c.maxRows) { pending.length = c.maxRows; gap = true; }
					paintPill();
				}
			});
		}

		function run() {
			const my = gen;
			/* No cursor yet (an empty log): load again instead of tailing. */
			return loaded && cursor ? tail(my) : initialLoad(my);
		}

		const task = ctx.live({
			every: c.every,
			run,
			onState(s, info) {
				ctx.state(s);
				if (s === 'error' && !loaded) {
					$table.prop('hidden', true);
					$more.prop('hidden', true);
					states.error($state, { message: info.error, retry: () => { states.loading($state, { lines: 6 }); live.now(task.id); } });
				}
				states.stale($node, s === 'stale' || (s === 'error' && loaded));
				paintLive(s === 'error' && loaded ? 'error' : null);
			}
		});
		states.loading($state, { lines: 6 });

		function reset() {
			gen++;
			loaded = false;
			pending = [];
			gap = false;
			detached = false;
			rows = [];
			cursor = 0;
			hasMore = false;
			$tbody.empty();
			$table.prop('hidden', true);
			$more.prop('hidden', true);
			paintPill();
			states.loading($state, { lines: 6 });
			$scroll[0].scrollTop = 0;
			task.busy = false; /* a request of the old generation is ignored when it lands */
			live.now(task.id);
		}

		function loadOlder() {
			if (loadingOlder || !hasMore || !rows.length) return;
			loadingOlder = true;
			showTable();
			const my = gen;
			batch.get(c.source.path, { ...baseQuery(), before: rows[rows.length - 1].id, limit: c.limit }).then((res) => {
				if (my !== gen) return;
				hasMore = !!(res.meta && res.meta.has_more);
				append(res.data || []);
			}, (e) => toast.error(e)).finally(() => { loadingOlder = false; showTable(); });
		}
		$older.on('click', loadOlder);
		let io = null;
		if ('IntersectionObserver' in window) {
			io = new IntersectionObserver((entries) => { if (entries.some((x) => x.isIntersecting)) loadOlder(); }, { root: $scroll[0], rootMargin: '200px' });
			io.observe($sentinel[0]);
		}

		$scroll.on('scroll', () => {
			if (atTop() && pending.length && !paused && !gap) mergePending();
		});

		/* ------------------------------------------------------ live */

		function paintLive(problem) {
			const label = paused ? t('Paused') : problem ? t('Reconnecting') : t('Live');
			const verb = paused ? t('Resume live updates') : t('Pause live updates');
			$liveBtn.empty().append(
				$('<span class="fs-log-viewer-live-dot" aria-hidden="true">').attr('data-state', paused ? 'paused' : problem || 'live'),
				$('<span aria-hidden="true">').text(label),
				$('<span class="visually-hidden">').text(`${label}. ${verb}`));
			$liveBtn.attr('title', `${verb} (Space)`);
			$node.toggleClass('is-paused', paused);
		}
		function setPaused(v) {
			paused = !!v;
			task.every = paused ? 0 : c.every;
			paintLive();
			$announce.text(paused ? t('Live updates paused') : t('Live updates resumed'));
			if (!paused) {
				if (atTop() && pending.length && !gap) mergePending();
				live.now(task.id);
			}
			$node.trigger('fs:log-live', [{ live: !paused }]);
		}
		$liveBtn.on('click', () => setPaused(!paused));
		if (paused) task.every = 0;
		paintLive();

		/* ------------------------------------------------- keyboard */

		$scroll.on('keydown', (e) => {
			const tag = e.target.tagName;
			if (e.key === ' ' && !/^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(tag)) {
				e.preventDefault();
				if (c.live) setPaused(!paused);
				return;
			}
			if (tag !== 'TR') return;
			if (e.key === 'Enter') { e.preventDefault(); openRow(e.target); }
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault();
				const next = e.key === 'ArrowDown' ? e.target.nextElementSibling : e.target.previousElementSibling;
				if (next) next.focus();
			}
			if (e.key === 'Home') { e.preventDefault(); $tbody.children().first().trigger('focus'); }
			if (e.key === 'End') { e.preventDefault(); $tbody.children().last().trigger('focus'); }
		});
		$tbody.on('click', 'tr', function (e) {
			if (window.getSelection && String(window.getSelection()).length) return; /* selecting text, not opening */
			if ($(e.target).closest('a,button').length) return;
			openRow(this);
		});

		/* --------------------------------------------------- drawer */

		const fill = (tpl, e) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (e[k] == null ? '' : encodeURIComponent(e[k])));

		function fieldItems(e) {
			if (type === 'firewall') {
				const [, al] = ACTION[e.action] || [null, e.action];
				return [
					{ label: t('Action'), value: t(al || '—') },
					{ label: t('Time'), value: fmt.datetime(e.time) },
					{ label: t('Interface'), value: e.iface_descr ? `${e.iface_descr} (${e.iface})` : e.iface },
					{ label: t('Direction'), value: e.dir === 'out' ? t('Outbound') : t('Inbound') },
					{ label: t('Source'), value: e.src, mono: true, copyable: true },
					{ label: t('Source port'), value: e.srcport ?? '—', mono: true },
					{ label: t('Destination'), value: e.dst, mono: true, copyable: true },
					{ label: t('Destination port'), value: e.dstport ?? '—', mono: true },
					{ label: t('Protocol'), value: e.proto, mono: true },
					{ label: t('Length'), value: e.len != null ? `${e.len} B` : '—', mono: true },
					{ label: t('Rule'), value: e.rule || '—' },
					{ label: t('Rule ID'), value: e.rule_id ?? '—', mono: true },
					{ label: t('Tracker'), value: e.tracker ?? '—', mono: true, copyable: e.tracker != null },
					{ label: t('Entry ID'), value: e.id, mono: true }
				];
			}
			const [, sl] = SEVERITY[e.severity] || [null, e.severity];
			const known = ['id', 'time', 'severity', 'process', 'pid', 'message', 'host'];
			return [
				{ label: t('Time'), value: fmt.datetime(e.time) },
				{ label: t('Severity'), value: t(sl || '—') },
				{ label: t('Host'), value: e.host || '—', mono: true },
				{ label: t('Process'), value: e.process || '—', mono: true },
				{ label: t('PID'), value: e.pid ?? '—', mono: true },
				{ label: t('Message'), value: e.message || '', mono: true, copyable: true },
				...Object.keys(e).filter((k) => !known.includes(k)).map((k) => ({ label: k, value: e[k] == null ? '—' : String(e[k]), mono: true })),
				{ label: t('Entry ID'), value: e.id, mono: true }
			];
		}

		function quick(e, kind) {
			const conf = c.quickRules && c.quickRules[kind];
			const msg = kind === 'block'
				? t('Block rule for {src} drafted on {iface}. Review and apply it in Rules.', { src: e.src, iface: e.iface_descr || e.iface })
				: t('Pass rule for {proto} {src} → {dst} drafted on {iface}. Review and apply it in Rules.', { proto: e.proto, src: e.src, dst: hostPort(e.dst, e.dstport), iface: e.iface_descr || e.iface });
			if (conf && conf.path) {
				const body = JSON.parse(fill(JSON.stringify(conf.body || {}), e).replace(/%2F/g, '/'));
				return { action: { method: conf.method || 'POST', path: fill(conf.path, e), body }, success: msg };
			}
			return { onClick: () => { toast(msg, { level: 'ok' }); $node.trigger('fs:log-quick-rule', [{ kind, entry: e }]); }, close: true };
		}

		function openRow(tr) {
			const id = Number(tr.getAttribute('data-id'));
			const e = rows.find((r) => r.id === id);
			if (!e) return;
			let footer;
			if (type === 'firewall') {
				footer = [
					{ label: t('Block source'), icon: 'ban', variant: 'secondary', ...quick(e, 'block') },
					{ label: t('Pass this traffic'), icon: 'circle-check', variant: 'secondary', ...quick(e, 'pass') }
				];
				if (c.ruleHref && e.rule_id != null) footer.push({ label: t('Open rule'), icon: 'pen-to-square', variant: 'primary', href: fill(c.ruleHref, e) });
			} else {
				footer = [];
				if (e.process && toolbar) footer.push({ label: t('Only {process}', { process: e.process }), icon: 'filter', onClick: () => { setFilter('process', e.process); }, close: true });
				footer.push({ label: t('Close'), variant: 'primary' });
			}
			const [st] = type === 'firewall' ? (ACTION[e.action] || ['neutral']) : (SEVERITY[e.severity] || ['neutral']);
			drawer.open({
				title: type === 'firewall' ? `${hostPort(e.src, e.srcport)} → ${hostPort(e.dst, e.dstport)}` : (e.process || t('Log entry')),
				subtitle: `${t(c.title)} · ${fmt.datetime(e.time)}`,
				icon: type === 'firewall' ? (st === 'pass' ? 'circle-check' : 'ban') : 'scroll',
				size: 'md',
				body: [{ el: 'kv-list', config: { items: fieldItems(e) } }],
				footer
			});
		}

		/* -------------------------------------------- toolbar + filters */

		let processesKnown = type === 'firewall' || !!c.processes;
		function learnProcesses(list) {
			processesKnown = true;
			const procs = [...new Set(list.map((e) => e.process).filter(Boolean))].sort();
			if (procs.length && c.filters === true) buildToolbar({ processes: procs.map((p) => ({ value: p, label: p })) });
		}

		function setFilter(id, value) {
			filters[id] = value;
			if (toolbar) el.get(toolbar[0]).setFilter(id, value);
			reset();
		}

		function buildToolbar(opts) {
			if (!c.search && !c.filters) return;
			const fl = c.filters === true ? defaultFilters(type, opts, !noSeverity) : (c.filters || []);
			for (const f of fl) if (filters[f.id] !== undefined) f.value = filters[f.id];
			const search = c.search ? { placeholder: type === 'firewall' ? t('Search address, port, rule…') : t('Search process or message…'), label: t('Search the log'), delay: 300, ...(typeof c.search === 'object' ? c.search : {}), value: q } : false;
			const $tb = childNode({ el: 'toolbar', config: { label: t('Log filters'), search, filters: fl } });
			if (toolbar) toolbar.replaceWith($tb); else $tbHost.append($tb);
			toolbar = $tb;
			startChildren($tb);
			$tb.on('fs:search', (ev, d) => { ev.stopPropagation(); if ((d.q || '') === q) return; q = d.q || ''; reset(); })
				.on('fs:filter', (ev, d) => { ev.stopPropagation(); filters = { ...d.values }; reset(); });
		}

		if (type === 'firewall' && c.filters === true && !c.interfaces) {
			buildToolbar({});
			batch.get('/v1/status/interfaces').then((r) => {
				/* The API names interfaces name/description; fixtures id/descr. */
				const list = (r.data || []).map((i) => ({ value: i.id || i.name, label: i.descr || i.description || i.id || i.name }));
				if (list.length) buildToolbar({ interfaces: list });
			}, () => { /* keep the toolbar without an interface filter */ });
		} else {
			buildToolbar({ interfaces: c.interfaces, processes: c.processes && c.processes.map((p) => (typeof p === 'string' ? { value: p, label: p } : p)) });
		}

		/* -------------------------------------------------- summary */

		let summaryQueued = false;
		function paintSummary() {
			if (!c.summary || summaryQueued) return;
			summaryQueued = true;
			requestAnimationFrame(() => {
				summaryQueued = false;
				const fw = type === 'firewall';
				const bad = noSeverity ? rows.length : rows.filter((e) => (fw ? e.action === 'block' || e.action === 'reject' : SEVERITY[e.severity] && SEVERITY[e.severity][0] === 'crit')).length;
				const other = noSeverity ? new Set(rows.map((e) => e.process).filter(Boolean)).size
					: rows.filter((e) => (fw ? e.action === 'pass' : e.severity === 'warning' || e.severity === 'warn')).length;
				if (!tiles) {
					const [la, ia, lb, ib] = fw ? [t('Blocked in view'), 'ban', t('Passed in view'), 'circle-check']
						: noSeverity ? [t('Entries in view'), 'list', t('Processes in view'), 'microchip']
							: [t('Errors in view'), 'circle-xmark', t('Warnings in view'), 'triangle-exclamation'];
					const a = childNode({ el: 'stat-tile', config: { label: la, icon: ia, value: bad, size: 'compact', plain: true } });
					const b = childNode({ el: 'stat-tile', config: { label: lb, icon: ib, value: other, size: 'compact', plain: true } });
					const $top = $('<div class="fs-log-viewer-top">');
					$summary.prop('hidden', false).append($('<div class="fs-log-viewer-tile">').append(a), $('<div class="fs-log-viewer-tile">').append(b), $top);
					startChildren(a.add(b));
					tiles = { a, b, $top };
				} else {
					const ia = el.get(tiles.a[0]), ib = el.get(tiles.b[0]);
					if (ia && ia.set) ia.set(bad);
					if (ib && ib.set) ib.set(other);
				}
				/* top sources (firewall: blocked sources; system: busiest processes) */
				const counts = new Map();
				for (const e of rows) {
					const k = fw ? ((e.action === 'block' || e.action === 'reject') ? e.src : null) : e.process;
					if (k) counts.set(k, (counts.get(k) || 0) + 1);
				}
				const top = [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3);
				tiles.$top.empty().append($('<p class="fs-log-viewer-top-label">').text(fw ? t('Top blocked sources') : t('Busiest processes')));
				if (!top.length) tiles.$top.append($('<p class="fs-log-viewer-top-none">').text('—'));
				const $ul = $('<ul class="fs-log-viewer-top-list">');
				for (const [k, n] of top) {
					$ul.append($('<li>').append($('<button type="button" class="fs-log-viewer-top-btn">')
						.attr('title', fw ? t('Search for {v}', { v: k }) : t('Show only {v}', { v: k }))
						.append($('<span class="fs-mono">').text(k), $('<span class="fs-log-viewer-top-n fs-num">').text(fmt.num(n)))
						.on('click', () => {
							if (fw) { q = k; if (toolbar) el.get(toolbar[0]).setSearch(k); reset(); } else setFilter('process', k);
						})));
				}
				tiles.$top.append($ul);
			});
		}

		return {
			/** Reload from the newest entry (keeps search and filters). */
			reload: reset,
			/** Pause (true) or resume (false) the live tail. */
			pause: (v = true) => setPaused(v),
			/** Whether the live tail is running. */
			isLive: () => !paused,
			/** Set the search text and reload. */
			search(text) { q = text || ''; if (toolbar) el.get(toolbar[0]).setSearch(q); reset(); },
			/** Set one filter (e.g. 'action', ['block']) and reload. */
			filter: setFilter,
			/** Entries currently in the DOM (newest first). */
			rows: () => rows.slice(),
			destroy() { if (io) io.disconnect(); }
		};
	}
});
