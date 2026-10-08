/*
 * dashboard.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * dashboard — a 12-column grid of widgets (registry.js, contract in
 * widgets.md). Sizes sm/md/lg/xl/full collapse on narrow containers. Edit mode
 * with pointer drag; keyboard Move earlier/later in each widget's menu and on
 * the grip (arrow keys). Per-widget menu: refresh now, refresh interval, size,
 * settings (FS.modalForm), collapse, remove (with Undo). Widgets are added from
 * the widget catalogue, load lazily when scrolled into view, run one live
 * task each (live dot: loading/ok/stale/error/paused) and the layout is saved
 * per user through the layout API (debounced).
 */
import $ from 'jquery';
import { Dropdown } from 'bootstrap';
import { el } from '../../js/el.js';
import { api } from '../../js/api.js';
import { batch } from '../../js/batch.js';
import { live } from '../../js/live.js';
import { states } from '../../js/states.js';
import { fmt } from '../../js/fmt.js';
import { t } from '../../js/i18n.js';
import { icon } from '../toast/toast.js';
import { toast } from '../toast/toast.js';
import { confirm } from '../confirm/confirm.js';
import { modalForm } from '../modal-form/modal-form.js';
import { childNode, startChildren } from '../card/nest.js';
import { widgets, SIZES, SIZE_ORDER, SIZE_LABELS, SIZE_SHORT, INTERVALS } from './registry.js';
import { openCatalogue } from '../widget-catalogue/widget-catalogue.js';
import './widgets/system.js';
import './widgets/network.js';
import './widgets/security.js';

/* The default layout: calm at 1600 px, degrades to two and one column. */
export const DEFAULT_LAYOUT = [
	{ type: 'system', size: 'md' },
	{ type: 'resources', size: 'md' },
	{ type: 'gateways', size: 'md' },
	{ type: 'traffic', size: 'xl', settings: { iface: 'wan' } },
	{ type: 'interfaces', size: 'md' },
	{ type: 'services', size: 'md' },
	{ type: 'vpn', size: 'md' },
	{ type: 'notices', size: 'md' },
	{ type: 'firewall-log', size: 'lg' },
	{ type: 'top-talkers', size: 'lg' },
	{ type: 'dhcp-leases', size: 'md' },
	{ type: 'states', size: 'md' },
	{ type: 'quick-actions', size: 'md' }
];

const PATH = '/v1/dashboard/layout';
let seq = 0;
const uid = () => `w${Math.random().toString(36).slice(2, 8)}${(++seq).toString(36)}`;
const intervalLabel = (s) => (s ? t('{n}s', { n: s }) : t('Off'));

/** A lazy handle on a child element: calls go to its current instance (it can be re-initialised after a move). */
function lazyInstance(node) {
	return new Proxy({}, {
		get(_, key) {
			if (key === 'node') return node;
			const inst = el.get(node);
			const v = inst ? inst[key] : undefined;
			return typeof v === 'function' ? v.bind(inst) : (v === undefined ? () => {} : v);
		}
	});
}

/** Settings defaults of a definition. */
function defaultSettings(def) {
	const out = {};
	for (const f of def.settings || []) if (f.value !== undefined) out[f.name] = f.value;
	return out;
}

el.define('dashboard', {
	init(node, config, elCtx) {
		const c = { layout: { path: PATH, query: { style: 'default' } }, persist: true, editable: true, lazy: true, saveDelay: 800, actions: { edit: 'edit-layout', add: 'add-widget', reset: 'reset-layout', done: 'done-layout' }, ...config };
		const ns = `.fsdash${++seq}`;
		const $node = $(node).addClass('fs-dash').empty();
		const $bar = $('<div class="fs-dash-editbar" hidden>');
		const $grid = $('<div class="fs-dash-grid">').attr('aria-label', t('Dashboard widgets')).attr('role', 'list');
		const $empty = $('<div class="fs-dash-empty" hidden>');
		const $announce = $('<p class="visually-hidden" aria-live="polite">');
		$node.append($bar, $grid, $empty, $announce);

		const list = [];          /* widget instances in order */
		let editing = false;
		let saveTimer = null;
		let destroyed = false;
		let paused = live.paused;

		const announce = (msg) => { $announce.text(''); setTimeout(() => $announce.text(msg), 30); };
		const counts = () => list.reduce((o, w) => { o[w.type] = (o[w.type] || 0) + 1; return o; }, {});
		const titleOf = (w) => (w.settings.title || (w.def ? t(w.def.title) : w.type));

		/* ------------------------------------------------------- persistence */

		function serialize() {
			return list.map((w) => {
				const o = { id: w.id, type: w.type, size: w.size };
				if (w.collapsed) o.collapsed = true;
				if (w.every !== null && w.every !== undefined) o.every = w.every;
				if (w.settings && Object.keys(w.settings).length) o.settings = w.settings;
				return o;
			});
		}
		function save(now = false) {
			if (!c.persist || destroyed) return;
			clearTimeout(saveTimer);
			const send = () => {
				saveTimer = null;
				api.put(c.layout.path, { ...(c.layout.query || {}), widgets: serialize() }).catch((e) => toast.error(e));
			};
			if (now) send(); else saveTimer = setTimeout(send, c.saveDelay);
		}
		function flush() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; save(true); } }

		/* --------------------------------------------------------- the widgets */

		function liveDot(w, s) {
			w.liveState = s;
			const shown = paused && s !== 'error' ? 'paused' : (!w.every && s === 'ok' ? 'manual' : s);
			const text = {
				loading: t('Loading'), ok: t('Live, every {n} seconds', { n: w.every }), manual: t('Loaded; automatic refresh is off'),
				stale: t('Out of date'), error: t('Could not refresh'), paused: t('Live updates paused'), idle: t('Waiting until visible')
			}[shown] || '';
			w.$dot.attr({ 'data-state': shown, title: text }).find('.visually-hidden').text(text);
		}

		function makeCtx(w) {
			return {
				id: w.id,
				type: w.type,
				def: w.def,
				$root: w.$w,
				$body: w.$content,
				get settings() { return w.settings; },
				get size() { return w.size; },
				get every() { return w.every; },
				state: {},
				links: c.links || {},
				linkBase: c.linkBase || '',
				t, fmt, api, batch,
				/** GET through FS.batch; resolves to the response data. */
				get: (path, query) => batch.get(path, query).then((r) => r.data),
				/** GET through FS.batch; resolves to the whole body {data, meta}. */
				fetch: (path, query) => batch.get(path, query),
				/** Create a child element inside $parent; returns a lazy instance handle. */
				child($parent, name, conf = {}) {
					const $n = childNode({ el: name, config: conf });
					$($parent).append($n);
					startChildren($n);
					return lazyInstance($n[0]);
				},
				setSubtitle(text) { w.$sub.text(text || '').prop('hidden', !text); },
				setFooter(content) {
					w.$foot.empty().prop('hidden', !content);
					if (typeof content === 'string') w.$foot.append($('<span>').text(content));
					else if (content) w.$foot.append(content);
				},
				refresh() { if (w.task) live.now(w.task.id); },
				/** Merge settings, save the layout and re-mount the widget. */
				save(next) { w.settings = { ...w.settings, ...next }; save(); remount(w); }
			};
		}

		function setMsg(w, kind, opts = {}) {
			w.$msg.empty().prop('hidden', !kind);
			w.$content.prop('hidden', !!kind && kind !== 'stale');
			if (kind === 'loading') states.loading(w.$msg, { lines: w.def ? w.def.lines : 3 });
			else if (kind === 'error') states.error(w.$msg, { compact: true, message: opts.message, retry: () => { setMsg(w, 'loading'); w.loaded = false; if (w.task) live.now(w.task.id); } });
			else if (kind === 'empty') {
				const e = { icon: 'inbox', title: 'Nothing to show', ...((w.def && w.def.empty) || {}), ...(opts.empty || {}) };
				states.empty(w.$msg, { icon: e.icon, title: t(e.title), text: e.text ? t(e.text) : '' });
			}
		}

		function startTask(w) {
			if (w.task || !w.def || !w.def.load || destroyed) return;
			const every = w.collapsed ? 0 : (w.every || 0);
			w.task = elCtx.live({
				id: w.id,
				every,
				run: () => Promise.resolve(w.def.load(w.ctx)).then((r) => {
					if (r === false) setMsg(w, 'empty', { empty: w.ctx.state.empty });
					else if (!w.$msg.prop('hidden')) setMsg(w, null);
					w.loaded = true;
					states.stale(w.$w, false);
				}),
				onState(s, info) {
					liveDot(w, s);
					if (s === 'error' && !w.loaded) setMsg(w, 'error', { message: info.error });
					if (s === 'stale' || (s === 'error' && w.loaded)) states.stale(w.$w, true);
				}
			});
		}
		function stopTask(w) {
			if (w.task) { live.remove(w.task.id); w.task = null; }
		}

		function mountBody(w) {
			w.loaded = false;
			w.$content.empty();
			w.ctx = makeCtx(w);
			w.ctx.setSubtitle('');
			w.ctx.setFooter(null);
			if (!w.def) {
				w.$content.prop('hidden', true);
				w.$msg.prop('hidden', false).empty();
				states.empty(w.$msg, { icon: 'puzzle-piece', title: t('Widget not available'), text: t('The widget "{type}" is not installed. Remove it, or install the package that provides it.', { type: w.type }) });
				liveDot(w, 'idle');
				return;
			}
			/* Lazy: nothing is mounted (and no child element loads) until the widget is near the viewport. */
			if (!w.visible && c.lazy && io) { setMsg(w, 'loading'); liveDot(w, 'idle'); w.mounted = false; return; }
			w.mounted = true;
			setMsg(w, w.def.load && w.def.skeleton !== false ? 'loading' : null);
			try { if (w.def.mount) w.def.mount(w.ctx); } catch (e) { console.error(`fs-dashboard: mount of "${w.type}" failed`, e); setMsg(w, 'error', { message: t('This widget failed to start.') }); return; }
			liveDot(w, w.def.load ? (w.visible ? 'loading' : 'idle') : 'ok');
			startTask(w);
		}
		function unmountBody(w) {
			stopTask(w);
			if (w.mounted && w.def && w.def.destroy && w.ctx) { try { w.def.destroy(w.ctx); } catch (e) { console.error(e); } }
			states.stale(w.$w, false);
		}
		function remount(w) { unmountBody(w); mountBody(w); }

		function headTitle(w) {
			w.$title.text(titleOf(w));
			w.$icon.empty().append(icon(w.def ? w.def.icon : 'puzzle-piece'));
			w.$grip.attr('aria-label', t('Move {title}. Use the arrow keys.', { title: titleOf(w) }));
			w.$menuBtn.attr({ 'aria-label': t('{title} options', { title: titleOf(w) }), title: t('Widget options') });
		}

		function build(spec) {
			const def = widgets.get(spec.type);
			const w = {
				id: spec.id || uid(), type: spec.type, def,
				size: SIZES[spec.size] && (!def || def.sizes.includes(spec.size)) ? spec.size : (def ? def.size : 'md'),
				every: spec.every !== undefined && spec.every !== null ? +spec.every : (def ? def.every : 0),
				collapsed: !!spec.collapsed,
				settings: { ...(def ? defaultSettings(def) : {}), ...(spec.settings || {}) },
				visible: false, task: null, loaded: false
			};
			const tid = `fs-widget-${w.id}-title`;
			w.$w = $('<section class="fs-widget" role="listitem">').attr({ id: `fs-widget-${w.id}`, 'data-type': w.type, 'data-size': w.size, 'aria-labelledby': tid, 'data-widget-id': w.id });
			w.$grip = $('<button type="button" class="fs-widget-grip">').prop('tabindex', editing ? 0 : -1).append(icon('grip-vertical'));
			w.$icon = $('<span class="fs-widget-icon" aria-hidden="true">');
			w.$title = $('<span class="fs-widget-title-text">');
			w.$sub = $('<p class="fs-widget-subtitle" hidden>');
			w.$dot = $('<span class="fs-widget-live">').append($('<span class="fs-widget-live-mark" aria-hidden="true">'), $('<span class="visually-hidden">'));
			w.$menuBtn = $('<button type="button" class="btn btn-ghost btn-sm fs-widget-menu-btn fs-action-icon" data-bs-toggle="dropdown" aria-expanded="false">').append(icon('ellipsis'));
			w.$menu = $('<ul class="dropdown-menu dropdown-menu-end fs-widget-menu">');
			const $head = $('<header class="fs-widget-head">').append(
				w.$grip, w.$icon,
				$('<div class="fs-widget-titles">').append($('<h2 class="fs-widget-title">').attr('id', tid).append(w.$title), w.$sub),
				w.$dot,
				$('<div class="dropdown fs-widget-tools">').append(w.$menuBtn, w.$menu));
			w.$content = $('<div class="fs-widget-content">');
			w.$msg = $('<div class="fs-widget-msg" hidden>');
			w.$body = $('<div class="fs-widget-body">').attr('id', `fs-widget-${w.id}-body`).append(w.$content, w.$msg);
			w.$foot = $('<footer class="fs-widget-foot" hidden>');
			w.$w.append($head, w.$body, w.$foot);
			headTitle(w);
			applyCollapsed(w);

			w.$menuBtn.on('show.bs.dropdown', () => fillMenu(w));
			w.$grip.on('keydown', (e) => {
				const k = e.key;
				if (k === 'ArrowLeft' || k === 'ArrowUp') { e.preventDefault(); move(w, -1, true); }
				else if (k === 'ArrowRight' || k === 'ArrowDown') { e.preventDefault(); move(w, 1, true); }
				else if (k === 'Home') { e.preventDefault(); moveTo(w, 0, true); }
				else if (k === 'End') { e.preventDefault(); moveTo(w, list.length - 1, true); }
			});
			w.$grip.on('pointerdown', (e) => startDrag(w, e));
			return w;
		}

		function applyCollapsed(w) {
			w.$w.toggleClass('is-collapsed', w.collapsed);
			w.$body.prop('hidden', w.collapsed);
			if (w.collapsed) w.$foot.addClass('is-collapsed-hidden'); else w.$foot.removeClass('is-collapsed-hidden');
		}

		/* Lazy loading: a widget starts its live task once it is near the viewport. */
		const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => {
			for (const en of entries) {
				if (!en.isIntersecting) continue;
				const w = list.find((x) => x.$w[0] === en.target);
				io.unobserve(en.target);
				if (!w) continue;
				w.visible = true;
				if (!w.mounted) mountBody(w);
				else if (w.def && w.def.load && !w.task) startTask(w);
			}
		}, { rootMargin: '240px 0px' }) : null;

		function attach(w, index = list.length) {
			const before = list[index];
			if (before) w.$w.insertBefore(before.$w); else $grid.append(w.$w);
			list.splice(index, 0, w);
			if (!io || !c.lazy) w.visible = true;
			mountBody(w);
			if (io && c.lazy && !w.visible) io.observe(w.$w[0]);
			updateEmpty();
		}

		function detach(w) {
			const i = list.indexOf(w);
			if (i < 0) return -1;
			unmountBody(w);
			if (io) io.unobserve(w.$w[0]);
			const d = Dropdown.getInstance(w.$menuBtn[0]);
			if (d) d.dispose();
			w.$w.remove();
			list.splice(i, 1);
			updateEmpty();
			return i;
		}

		function updateEmpty() {
			const none = !list.length;
			$empty.prop('hidden', !none);
			$grid.prop('hidden', none);
			if (none && !$empty.children().length) {
				states.empty($empty, {
					icon: 'table-cells-large', title: t('Your dashboard is empty'),
					text: t('Add widgets for the things you want to keep an eye on: traffic, gateways, VPN tunnels, logs and more.'),
					action: { label: t('Add widget'), icon: 'plus', onClick: () => openAdd() }
				});
				const $reset = $('<button type="button" class="btn btn-link btn-sm">').text(t('Restore the default layout')).on('click', () => reset());
				$empty.find('.fs-state').append($reset);
			}
		}

		/* ------------------------------------------------------------ menu */

		function fillMenu(w) {
			const i = list.indexOf(w);
			const def = w.def;
			const $m = w.$menu.empty();
			const item = (ic, label, fn, { danger = false, disabled = false } = {}) => $('<li>').append(
				$('<button type="button" class="dropdown-item fs-menu-item">').toggleClass('is-danger', danger).prop('disabled', disabled)
					.append(icon(ic), $('<span class="fs-action-label">').text(label)).on('click', fn));
			const group = (label, values, current, text, full, fn) => {
				const gid = `${w.id}-${label.replace(/\W+/g, '')}`;
				return $('<li class="fs-widget-menu-group">').append(
					$('<p class="fs-widget-menu-label">').attr('id', gid).text(label),
					$('<div class="fs-widget-seg" role="group">').attr('aria-labelledby', gid).append(values.map((v) =>
						$('<button type="button" class="dropdown-item fs-widget-seg-btn">').attr({ 'aria-pressed': String(v === current), title: full(v), 'aria-label': full(v) })
							.text(text(v)).on('click', () => fn(v)))));
			};
			if (def && def.load) $m.append(item('rotate-right', t('Refresh now'), () => { w.ctx.refresh(); announce(t('{title} refreshed', { title: titleOf(w) })); }, { disabled: w.collapsed }));
			if (def) $m.append(item('sliders', t('Settings…'), () => openSettings(w)));
			$m.append(item(w.collapsed ? 'chevron-down' : 'chevron-up', w.collapsed ? t('Expand') : t('Collapse'), () => collapse(w, !w.collapsed)));
			if (def && def.sizes.length > 1) {
				$m.append($('<li>').append($('<hr class="dropdown-divider">')));
				$m.append(group(t('Size'), SIZE_ORDER.filter((s) => def.sizes.includes(s)), w.size, (s) => t(SIZE_SHORT[s]), (s) => t(SIZE_LABELS[s]), (s) => resize(w, s)));
			}
			if (def && def.load) {
				if (!(def.sizes.length > 1)) $m.append($('<li>').append($('<hr class="dropdown-divider">')));
				$m.append(group(t('Refresh'), INTERVALS, w.every || 0, intervalLabel, (s) => (s ? t('Every {n} seconds', { n: s }) : t('Automatic refresh off')), (s) => setEvery(w, s)));
			}
			$m.append($('<li>').append($('<hr class="dropdown-divider">')));
			$m.append(item('arrow-left', t('Move earlier'), () => move(w, -1, false), { disabled: i <= 0 }));
			$m.append(item('arrow-right', t('Move later'), () => move(w, 1, false), { disabled: i >= list.length - 1 }));
			$m.append($('<li>').append($('<hr class="dropdown-divider">')));
			$m.append(item('trash-can', t('Remove'), () => remove(w), { danger: true }));
		}

		function collapse(w, on) {
			w.collapsed = !!on;
			applyCollapsed(w);
			if (w.task) {
				if (on) live.every(w.task.id, 0);
				else if (w.every) live.every(w.task.id, w.every); else live.now(w.task.id);
			} else if (!on && w.visible) startTask(w);
			announce(on ? t('{title} collapsed', { title: titleOf(w) }) : t('{title} expanded', { title: titleOf(w) }));
			save();
		}

		function resize(w, s) {
			w.size = s;
			w.$w.attr('data-size', s);
			announce(t('{title} is now {size}', { title: titleOf(w), size: t(SIZE_LABELS[s]).toLowerCase() }));
			save();
			if (w.def && w.def.resize) w.def.resize(w.ctx);
		}

		function setEvery(w, s) {
			w.every = s;
			if (w.def && w.def.restartOnEvery) remount(w);
			else if (w.task) {
				if (!w.collapsed) live.every(w.task.id, s);
				if (!s) live.now(w.task.id);
			}
			liveDot(w, w.liveState || 'ok');
			announce(s ? t('{title} refreshes every {n} seconds', { title: titleOf(w), n: s }) : t('Automatic refresh off for {title}', { title: titleOf(w) }));
			save();
		}

		async function openSettings(w) {
			const def = w.def;
			const fields = [{ name: 'title', label: t('Title'), placeholder: t(def.title), help: t('Leave empty to use the default title.'), maxlength: 60 }];
			for (const f of def.settings || []) {
				const g = { ...f, label: t(f.label || f.name) };
				if (g.type === 'select' && g.required === undefined) g.required = true;
				if (f.help) g.help = t(f.help);
				if (typeof f.options === 'function') {
					try { g.options = await f.options(w.ctx); } catch { g.options = []; }
				}
				if (Array.isArray(g.options)) g.options = g.options.map((o) => (typeof o === 'object' ? { ...o, label: t(String(o.label)) } : o));
				fields.push(g);
			}
			const res = await modalForm({
				title: t('{title} settings', { title: titleOf(w) }),
				icon: 'sliders',
				fields,
				values: { title: '', ...w.settings },
				method: 'PUT',
				path: `${c.layout.path}/widgets/${encodeURIComponent(w.id)}${c.layout.query && c.layout.query.style ? `?style=${encodeURIComponent(c.layout.query.style)}` : ''}`,
				submitLabel: t('Save'),
				success: t('Widget settings saved'),
				transform: (v) => {
					const s = { ...v };
					if (!s.title) delete s.title;
					return { type: w.type, settings: s };
				}
			});
			if (!res) { w.$menuBtn.trigger('focus'); return; }
			const next = (res.data && res.data.settings) || {};
			w.settings = { ...defaultSettings(def), ...next };
			if (!next.title) delete w.settings.title;
			headTitle(w);
			remount(w);
			save();
			w.$menuBtn.trigger('focus');
		}

		/* ----------------------------------------------------------- order */

		function placeNode(w, index) {
			/* One DOM move: child elements are re-initialised by FS.el, so the widget refreshes right away. */
			const others = list.filter((x) => x !== w);
			const after = others[index];
			if (after) w.$w.insertBefore(after.$w); else $grid.append(w.$w);
			list.splice(list.indexOf(w), 1);
			list.splice(index, 0, w);
			if (w.task) live.now(w.task.id);
		}

		function moveTo(w, index, fromGrip) {
			const from = list.indexOf(w);
			index = Math.max(0, Math.min(list.length - 1, index));
			if (index === from) return;
			placeNode(w, index);
			announce(t('{title} moved to position {pos} of {n}', { title: titleOf(w), pos: index + 1, n: list.length }));
			(fromGrip && editing ? w.$grip : w.$menuBtn).trigger('focus');
			save();
		}
		function move(w, delta, fromGrip) { moveTo(w, list.indexOf(w) + delta, fromGrip); }

		/* Pointer drag (edit mode): a ghost follows the pointer; the widget itself shows the drop place. */
		function startDrag(w, e) {
			if (!editing || e.button !== 0) return;
			e.preventDefault();
			const grip = w.$grip[0];
			const r = w.$w[0].getBoundingClientRect();
			const from = list.indexOf(w);
			const dx = e.clientX - r.left, dy = e.clientY - r.top;
			const $ghost = $('<div class="fs-dash-ghost" aria-hidden="true">').css({ width: `${r.width}px`, height: `${Math.min(r.height, 160)}px` })
				.append($('<span class="fs-widget-icon">').append(icon(w.def ? w.def.icon : 'puzzle-piece')), $('<span class="fs-dash-ghost-title">').text(titleOf(w)));
			$('body').append($ghost);
			const place = (x, y) => $ghost.css('transform', `translate(${x - dx}px, ${y - dy}px)`);
			place(e.clientX, e.clientY);
			w.$w.addClass('is-dragging');
			$node.addClass('is-dragging');
			try { grip.setPointerCapture(e.pointerId); } catch { /* not supported */ }
			let target = from;

			const onMove = (ev) => {
				place(ev.clientX, ev.clientY);
				if (ev.clientY < 64) window.scrollBy(0, -14); else if (ev.clientY > window.innerHeight - 64) window.scrollBy(0, 14);
				const hit = document.elementFromPoint(ev.clientX, ev.clientY);
				const $over = hit ? $(hit).closest('.fs-widget') : $();
				if (!$over.length || $over[0] === w.$w[0] || !$.contains($grid[0], $over[0])) return;
				const ow = list.find((x) => x.$w[0] === $over[0]);
				const or = $over[0].getBoundingClientRect();
				const after = ev.clientX > or.left + or.width / 2 || (or.width > $grid.width() * 0.9 && ev.clientY > or.top + or.height / 2);
				const others = list.filter((x) => x !== w);
				let idx = others.indexOf(ow) + (after ? 1 : 0);
				if (idx === target) return;
				target = idx;
				/* Preview with CSS order only (no DOM move while dragging). */
				others.splice(idx, 0, w);
				others.forEach((x, n) => x.$w.css('order', n));
			};
			const end = (cancel) => {
				$(grip).off('pointermove pointerup pointercancel lostpointercapture');
				$(document).off(`keydown${ns}drag`);
				$ghost.remove();
				w.$w.removeClass('is-dragging');
				$node.removeClass('is-dragging');
				list.forEach((x) => x.$w.css('order', ''));
				if (!cancel && target !== from) {
					placeNode(w, target);
					announce(t('{title} moved to position {pos} of {n}', { title: titleOf(w), pos: target + 1, n: list.length }));
					save();
				}
				w.$grip.trigger('focus');
			};
			$(grip).on('pointermove', (ev) => onMove(ev.originalEvent || ev))
				.on('pointerup', () => end(false))
				.on('pointercancel', () => end(true))
				.on('lostpointercapture', () => { if (w.$w.hasClass('is-dragging')) end(false); });
			$(document).on(`keydown${ns}drag`, (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); target = from; end(true); } });
		}

		/* -------------------------------------------------- add / remove / reset */

		function add(type, settings = {}, size = null) {
			const def = widgets.get(type);
			if (!def) { toast(t('The widget "{type}" is not available.', { type }), { level: 'warn' }); return null; }
			if (!def.multiple && list.some((w) => w.type === type)) {
				const w0 = list.find((w) => w.type === type);
				focusWidget(w0);
				return w0;
			}
			const w = build({ type, size: size || def.size, settings });
			w.visible = true;
			attach(w);
			save();
			focusWidget(w, true);
			toast(t('{title} added', { title: titleOf(w) }), { level: 'ok' });
			$node.trigger('fs:widget-added', [{ id: w.id, type }]);
			return w;
		}

		function focusWidget(w, flash = false) {
			const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			w.$w[0].scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
			w.$menuBtn[0].focus({ preventScroll: true });
			if (flash) {
				w.$w.addClass('is-new');
				setTimeout(() => w.$w.removeClass('is-new'), 1600);
			}
		}

		function remove(w) {
			const title = titleOf(w);
			const spec = { id: w.id, type: w.type, size: w.size, every: w.every, collapsed: w.collapsed, settings: { ...w.settings } };
			const i = list.indexOf(w);
			const next = list[i + 1] || list[i - 1];
			detach(w);
			save();
			if (next) next.$menuBtn.trigger('focus');
			$node.trigger('fs:widget-removed', [{ id: spec.id, type: spec.type }]);
			toast(t('{title} removed', { title }), {
				level: 'ok',
				action: {
					label: t('Undo'),
					onClick: () => {
						if (destroyed || list.some((x) => x.id === spec.id)) return;
						const w2 = build(spec);
						w2.visible = true;
						attach(w2, Math.min(i, list.length));
						save();
						focusWidget(w2);
						announce(t('{title} restored', { title }));
					}
				}
			});
		}

		function render(specs) {
			list.slice().forEach(detach);
			(specs || []).filter((s) => s && s.type).forEach((s) => attach(build(s)));
			updateEmpty();
		}

		async function reset() {
			const ok = await confirm({
				title: t('Reset the dashboard?'),
				text: t('Your widgets, sizes and settings are replaced by the default layout. This cannot be undone.'),
				confirmLabel: t('Reset'),
				danger: true
			});
			if (!ok) return false;
			clearTimeout(saveTimer);
			saveTimer = null;
			if (c.persist) {
				try { await api.del(c.layout.path, { query: c.layout.query }); } catch (e) { toast.error(e); return false; }
			}
			render(c.defaults || DEFAULT_LAYOUT);
			toast(t('Dashboard reset to the default layout'), { level: 'ok' });
			return true;
		}

		function openAdd() {
			openCatalogue({ counts: counts(), onAdd: (type) => add(type) });
		}

		/* ------------------------------------------------------- edit mode */

		function buildBar() {
			$bar.empty().append(
				$('<div class="fs-dash-editbar-text">').append(icon('up-down-left-right'), $('<span>').text(t('Drag widgets by their handle, or use the arrow keys on it. Sizes, refresh and settings are in each widget\'s menu.'))),
				$('<div class="fs-dash-editbar-actions">').append(
					$('<button type="button" class="btn btn-secondary btn-sm fs-action">').append(icon('plus'), $('<span>').text(t('Add widget'))).on('click', openAdd),
					$('<button type="button" class="btn btn-ghost btn-sm fs-action">').append(icon('rotate-left'), $('<span>').text(t('Reset'))).on('click', () => reset()),
					$('<button type="button" class="btn btn-primary btn-sm fs-action fs-dash-done">').append(icon('check'), $('<span>').text(t('Done'))).on('click', () => setEditing(false))));
		}
		function setEditing(on) {
			if (!c.editable) return;
			editing = !!on;
			$node.toggleClass('is-editing', editing);
			$bar.prop('hidden', !editing);
			list.forEach((w) => w.$grip.prop('tabindex', editing ? 0 : -1));
			if (c.actions && c.actions.edit) $(document).find(`[data-fs-action="${CSS.escape(c.actions.edit)}"]`).attr('aria-pressed', String(editing));
			if (editing) { $bar.find('.fs-dash-done').trigger('focus'); announce(t('Editing the layout')); } else { flush(); announce(t('Layout saved')); }
			$node.trigger('fs:dashboard-edit', [{ editing }]);
		}
		buildBar();

		/* Page-header actions (buttons emit fs:action, which bubbles to the document). */
		$(document).on(`fs:action${ns}`, (e, d) => {
			if (!d || !c.actions || !$.contains(document, node)) return;
			if (d.id === c.actions.edit) setEditing(!editing);
			else if (d.id === c.actions.add) openAdd();
			else if (d.id === c.actions.reset) reset();
			else if (d.id === c.actions.done) setEditing(false);
		});
		$(document).on(`fs:live-paused${ns}`, (e, p) => { paused = !!p; list.forEach((w) => { if (w.def && w.def.load) liveDot(w, w.liveState || 'loading'); }); });
		$(document).on(`fs:widget-defined${ns}`, (e, type) => {
			list.filter((w) => w.type === type && !w.def).forEach((w) => { w.def = widgets.get(type); w.settings = { ...defaultSettings(w.def), ...w.settings }; headTitle(w); remount(w); });
		});
		$(window).on(`pagehide${ns}`, flush);

		/* --------------------------------------------------------- start */

		if (Array.isArray(c.widgets)) {
			render(c.widgets);
		} else if (c.persist) {
			const $sk = $('<div class="fs-dash-skeleton" aria-hidden="true">');
			for (let i = 0; i < 6; i++) $sk.append($('<div class="fs-dash-skel-card">').append($('<span class="fs-skel">'), $('<span class="fs-skel">'), $('<span class="fs-skel">')));
			$grid.append($sk).attr('aria-busy', 'true');
			api.get(c.layout.path, c.layout.query).then((res) => {
				const d = res && res.data;
				const specs = Array.isArray(d) ? d : (d && Array.isArray(d.widgets) ? d.widgets : null);
				return specs;
			}, (e) => {
				toast(t('Your saved layout could not be loaded, so the default layout is shown.'), { level: 'warn', title: e && e.message });
				return null;
			}).then((specs) => {
				if (destroyed) return;
				$sk.remove();
				$grid.removeAttr('aria-busy');
				render(specs || c.defaults || DEFAULT_LAYOUT);
			});
		} else render(c.defaults || DEFAULT_LAYOUT);
		if (c.editing) setEditing(true);

		return {
			/** Add a widget of a registered type; returns its id. */
			add: (type, settings, size) => { const w = add(type, settings, size); return w ? w.id : null; },
			/** Remove a widget by id (with an Undo toast). */
			remove(id) { const w = list.find((x) => x.id === id); if (w) remove(w); },
			/** Move a widget to a position (0-based). */
			move(id, index) { const w = list.find((x) => x.id === id); if (w) moveTo(w, index, false); },
			/** Enter or leave edit mode. */
			edit: (on = true) => setEditing(on),
			get editing() { return editing; },
			/** Reset to the default layout (asks first). Resolves true when reset. */
			reset,
			/** Open the widget catalogue. */
			openCatalogue: openAdd,
			/** The current layout (what is saved). */
			layout: serialize,
			/** {type: n} counts of the widgets on the dashboard. */
			counts,
			/** Refresh one widget (id) or all of them. */
			refresh(id) { list.filter((w) => !id || w.id === id).forEach((w) => w.ctx && w.ctx.refresh()); },
			/** Save now instead of after the debounce. */
			flush,
			destroy() {
				flush();
				destroyed = true;
				$(document).off(ns).off(`${ns}drag`);
				$(window).off(ns);
				if (io) io.disconnect();
				list.slice().forEach((w) => { unmountBody(w); const d = Dropdown.getInstance(w.$menuBtn[0]); if (d) d.dispose(); });
			}
		};
	}
});
