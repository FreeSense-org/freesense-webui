/*
 * system.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Core widgets, system group: System, Resources, Thermal, Storage, Notices,
 * Quick actions and the custom Metric widget. Each composes catalogue
 * elements (kv-list, ring, meter, sparkline, stat-tile, badge, callout).
 */
import $ from 'jquery';
import { widgets } from '../registry.js';
import { badgeNode } from '../../badge/badge.js';
import { calloutNode } from '../../callout/callout.js';
import { statusNode } from '../../status/status.js';
import { sparkSvg } from '../../sparkline/sparkline.js';
import { pick, num, level } from '../../sparkline/viz.js';
import { toast } from '../../toast/toast.js';
import { t, icon, link, keyed, track } from './util.js';

/*
 * API shapes (freesense): /v1/status/system {cpu: {model, count, usage, load,
 * freq_mhz}, memory/swap: {used_bytes, total_bytes}, mbuf: {used, max},
 * states: {current, max}, disks: [{device, mount, type, used_bytes,
 * total_bytes}], temperatures: [{name, celsius}], uptime_seconds};
 * /v1/system/info {hostname, domain, product, version, freebsd, platform,
 * cpu, cpu_count, config_revision: {time, description}}; /v1/system/version
 * {running_version, installed_version, latest_version, update_available,
 * channel}.
 */
const SYS = '/v1/status/system';
const CHANNELS = { devel: 'Development', development: 'Development', stable: 'Stable' };

/* ------------------------------------------------------------------ System */

widgets.define('system', {
	title: 'System',
	icon: 'server',
	category: 'System',
	description: 'Version and updates, uptime, platform and the last configuration change.',
	sizes: ['sm', 'md', 'lg'],
	size: 'md',
	every: 30,
	multiple: false,
	lines: 5,
	settings: [
		{ name: 'hardware', type: 'switch', label: 'Show hardware details', value: true }
	],
	mount(ctx) {
		const $hero = $('<div class="fs-wsys-hero">');
		ctx.state.$name = $('<p class="fs-wsys-name">');
		ctx.state.$ver = $('<p class="fs-wsys-ver fs-num">');
		ctx.state.$badges = $('<div class="fs-wsys-badges">');
		$hero.append($('<div class="fs-wsys-id">').append(ctx.state.$name, ctx.state.$ver), ctx.state.$badges);
		ctx.$body.append($hero);
		const fields = [
			{ path: 'uptime', label: t('Uptime'), format: 'duration' },
			{ path: 'last_config_change', label: t('Config changed'), format: 'ago' },
			{ path: 'freebsd', label: t('FreeBSD') }
		];
		if (ctx.settings.hardware) fields.push({ path: 'platform', label: t('Platform') }, { path: 'cpu_text', label: t('CPU') });
		ctx.state.kv = ctx.child(ctx.$body, 'kv-list', { fields });
	},
	load(ctx) {
		return Promise.all([ctx.get(SYS), ctx.get('/v1/system/info'), ctx.get('/v1/system/version').catch(() => ({}))]).then(([d, info, ver]) => {
			ctx.state.$name.text([info.hostname, info.domain].filter(Boolean).join('.'));
			ctx.state.$ver.text([`${info.product || 'FreeSense'} ${ver.running_version || info.version || ''}`.trim(), ver.installed_version].filter(Boolean).join(' · '));
			const $b = ctx.state.$badges.empty();
			$b.append(badgeNode({ label: t(CHANNELS[ver.channel] || ver.channel || 'Stable'), tone: 'neutral' }));
			if (ver.update_available) {
				$b.append($('<a class="fs-wsys-update" data-fs-nav>').attr({ href: link(ctx, 'update'), title: t('Latest build {v}', { v: ver.latest_version }) })
					.append(badgeNode({ label: t('Update available'), tone: 'info', icon: 'circle-arrow-up' })));
			} else if (ver.status) $b.append(badgeNode({ label: t('Up to date'), tone: 'ok', icon: 'circle-check' }));
			const cores = info.cpu_count || (d.cpu && d.cpu.count);
			const cpu = info.cpu || (d.cpu && d.cpu.model);
			ctx.state.kv.update({
				uptime: d.uptime_seconds ?? info.uptime_seconds,
				last_config_change: info.config_revision && info.config_revision.time ? new Date(info.config_revision.time * 1000).toISOString() : null,
				freebsd: info.freebsd,
				platform: info.platform,
				cpu_text: cpu ? `${cpu}${cores ? ` · ${t('{n} cores', { n: cores })}` : ''}` : null
			});
		});
	}
});

/* --------------------------------------------------------------- Resources */

widgets.define('resources', {
	title: 'Resources',
	icon: 'gauge-high',
	category: 'System',
	description: 'CPU, memory and state table at a glance, with a CPU trend.',
	sizes: ['sm', 'md', 'lg'],
	size: 'md',
	every: 2,
	lines: 4,
	settings: [
		{ name: 'view', type: 'select', label: 'Show as', value: 'rings', options: [{ value: 'rings', label: 'Rings' }, { value: 'meters', label: 'Bars' }] },
		{ name: 'trend', type: 'switch', label: 'Show the CPU trend', value: true }
	],
	mount(ctx) {
		const s = ctx.state;
		if (ctx.settings.view === 'meters') {
			const $m = $('<div class="fs-wstack">').appendTo(ctx.$body);
			s.cpu = ctx.child($m, 'meter', { label: t('CPU'), format: 'pct', warn: 75, crit: 90 });
			s.mem = ctx.child($m, 'meter', { label: t('Memory'), format: 'bytes', max: 1, warn: 80, crit: 92 });
			s.states = ctx.child($m, 'meter', { label: t('State table'), format: 'compact', max: 1, warn: 70, crit: 90 });
			s.mbuf = ctx.child($m, 'meter', { label: t('Network buffers'), format: 'compact', max: 1, show: 'pct', size: 'sm' });
		} else {
			const $r = $('<div class="fs-wrings">').appendTo(ctx.$body);
			s.cpu = ctx.child($r, 'ring', { label: t('CPU'), format: 'pct', size: 'sm', warn: 75, crit: 90 });
			s.mem = ctx.child($r, 'ring', { label: t('Memory'), format: 'bytes', display: 'pct', size: 'sm', max: 1, warn: 80, crit: 92 });
			s.states = ctx.child($r, 'ring', { label: t('States'), format: 'compact', display: 'pct', size: 'sm', max: 1, warn: 70, crit: 90 });
		}
		if (ctx.settings.trend) {
			s.spark = ctx.child($('<div class="fs-wresources-trend">').appendTo(ctx.$body), 'sparkline', { label: t('CPU, last minutes'), showLabel: true, showValue: true, format: 'pct', variant: 'area', points: 60, min: 0, max: 100 });
			/* Seed the trend from the history once (RRD), then append live values. */
			ctx.get('/v1/status/system/history', { range: '10m' }).then((h) => {
				if (!Array.isArray(h.cpu)) return;
				const live = (s.hist && s.hist.cpu) || [];
				(s.hist = s.hist || {}).cpu = h.cpu.slice(-(60 - live.length)).concat(live);
				s.spark.set(s.hist.cpu);
			}, () => {});
		}
	},
	load(ctx) {
		const s = ctx.state;
		return ctx.get(SYS).then((d) => {
			s.cpu.set(d.cpu.usage, 100);
			s.mem.set(d.memory.used_bytes, d.memory.total_bytes);
			s.states.set(d.states.current, d.states.max);
			if (s.mbuf) s.mbuf.set(d.mbuf.used, d.mbuf.max);
			/* set() with the kept history (not push), so the trend survives a re-initialised child after a move. */
			if (s.spark) s.spark.set(track(ctx, 'cpu', d.cpu.usage, 60));
			const ld = (d.cpu.load || []).map((x) => Number(x).toFixed(2));
			ctx.setSubtitle(ld.length === 3 ? t('Load {a} · {b} · {c}', { a: ld[0], b: ld[1], c: ld[2] }) : '');
		});
	}
});

/* ----------------------------------------------------------------- Thermal */

widgets.define('thermal', {
	title: 'Thermal',
	icon: 'temperature-half',
	category: 'System',
	description: 'CPU core temperatures with warning levels and a short trend.',
	sizes: ['sm', 'md', 'lg'],
	size: 'sm',
	every: 5,
	settings: [
		{ name: 'warn', type: 'number', label: 'Warning at (°C)', value: 70, min: 40, max: 110 },
		{ name: 'crit', type: 'number', label: 'Critical at (°C)', value: 85, min: 40, max: 120 }
	],
	mount(ctx) {
		ctx.state.$list = $('<ul class="fs-wlist fs-wthermal" role="list">').appendTo(ctx.$body);
	},
	load(ctx) {
		return ctx.get(SYS).then((d) => {
			const temps = (d.temperatures || []).map((x) => ({ name: x.name, c: Number(x.celsius) })).filter((x) => Number.isFinite(x.c));
			if (!temps.length) { ctx.state.empty = { icon: 'temperature-empty', title: t('No sensors'), text: t('This hardware reports no temperatures.') }; return false; }
			const max = Math.max(...temps.map((x) => x.c));
			ctx.setSubtitle(t('Hottest {v} °C', { v: max.toFixed(1) }));
			keyed(ctx.state.$list, temps, (x) => x.name, () => $('<li class="fs-wrow">').append(
				$('<span class="fs-wrow-main">').append($('<span class="fs-wrow-title">'), $('<span class="fs-wrow-status">')),
				$('<span class="fs-spark-plot fs-wrow-spark" aria-hidden="true">'),
				$('<span class="fs-wrow-value fs-num">')), ($r, x) => {
				const lv = level(x.c, ctx.settings.warn, ctx.settings.crit);
				$r.find('.fs-wrow-title').text(x.name);
				$r.find('.fs-wrow-status').empty().append(lv === 'ok' ? null : statusNode(lv, lv === 'crit' ? t('Hot') : t('Warm'), { variant: 'pill' }));
				$r.find('.fs-wrow-value').empty().append(document.createTextNode(x.c.toFixed(1)), $('<span class="fs-unit">').text(' °C'));
				sparkSvg(track(ctx, x.name, x.c, 30), { color: lv === 'ok' ? 3 : lv }, $r.find('.fs-wrow-spark'));
			});
		});
	}
});

/* ----------------------------------------------------------------- Storage */

widgets.define('storage', {
	title: 'Storage',
	icon: 'hard-drive',
	category: 'System',
	description: 'Disk usage per mount point, plus memory and swap if you like.',
	sizes: ['sm', 'md', 'lg'],
	size: 'md',
	every: 60,
	settings: [
		{ name: 'memory', type: 'switch', label: 'Include memory and swap', value: false }
	],
	mount(ctx) {
		ctx.state.$list = $('<div class="fs-wstack">').appendTo(ctx.$body);
		ctx.state.meters = {};
	},
	load(ctx) {
		return ctx.get(SYS).then((d) => {
			const rows = (d.disks || []).map((x) => ({ key: x.mount, label: `${x.mount} · ${x.type || x.device}`, used: x.used_bytes, total: x.total_bytes }));
			if (ctx.settings.memory) {
				rows.push({ key: 'mem', label: t('Memory'), used: d.memory.used_bytes, total: d.memory.total_bytes });
				if (d.swap && d.swap.total_bytes) rows.push({ key: 'swap', label: t('Swap'), used: d.swap.used_bytes, total: d.swap.total_bytes });
			}
			if (!rows.length) { ctx.state.empty = { icon: 'hard-drive', title: t('No disks reported') }; return false; }
			for (const r of rows) {
				if (!ctx.state.meters[r.key]) ctx.state.meters[r.key] = ctx.child(ctx.state.$list, 'meter', { label: r.label, format: 'bytes', max: 1, warn: 80, crit: 92 });
				ctx.state.meters[r.key].set(r.used, r.total);
			}
			return true;
		});
	}
});

/* ----------------------------------------------------------------- Notices */

/* API notices: {id, source, text, url, category, level: crit | warn | info, time}. */
const NOTICE_LEVEL = { crit: 'danger', warn: 'warn', info: 'info' };

widgets.define('notices', {
	title: 'Notices',
	icon: 'bell',
	category: 'System',
	description: 'System notices such as a gateway down or an update. Dismiss them here.',
	sizes: ['md', 'lg', 'xl', 'full'],
	size: 'md',
	every: 30,
	multiple: false,
	lines: 4,
	empty: { icon: 'bell-slash', title: 'No notices', text: 'You are all caught up.' },
	settings: [
		{ name: 'level', type: 'select', label: 'Show', value: 'all', options: [{ value: 'all', label: 'All notices' }, { value: 'important', label: 'Warnings and errors only' }] }
	],
	mount(ctx) {
		ctx.state.$list = $('<ul class="fs-wnotices" role="list">').appendTo(ctx.$body);
		ctx.state.gone = new Set();
	},
	load(ctx) {
		return ctx.get('/v1/notices').then((list) => {
			const show = (list || []).filter((n) => !ctx.state.gone.has(n.id) && (ctx.settings.level !== 'important' || n.level !== 'info'));
			ctx.setSubtitle(show.length ? t('{n} open', { n: show.length }) : '');
			if (!show.length) { ctx.state.$list.empty(); return false; }
			keyed(ctx.state.$list, show, (n) => n.id, (n) => {
				const $li = $('<li class="fs-wnotice">');
				const dismiss = () => {
					ctx.state.gone.add(n.id);
					const $next = $li.next().find('button').first();
					$li.remove();
					if ($next.length) $next.trigger('focus'); else ctx.$root.find('.fs-widget-menu-btn').trigger('focus');
					if (!ctx.state.$list.children().length) ctx.refresh();
					ctx.api.del(`/v1/notices/${encodeURIComponent(n.id)}`).then(() => { toast(t('Notice dismissed'), { level: 'ok' }); ctx.refresh(); }, (e) => { ctx.state.gone.delete(n.id); toast.error(e); ctx.refresh(); });
				};
				return $li.append(calloutNode({ level: NOTICE_LEVEL[n.level] || 'info', title: n.category || n.source || t('Notice'), text: n.text, compact: true, dismissible: true }, { onDismiss: dismiss }),
					$('<span class="fs-wnotice-time">').attr('title', ctx.fmt.datetime(n.time)));
			}, ($li, n) => { $li.find('.fs-wnotice-time').text(ctx.fmt.ago(n.time)); });
			return true;
		});
	}
});

/* ----------------------------------------------------------- Quick actions */

widgets.define('quick-actions', {
	title: 'Quick actions',
	icon: 'bolt',
	category: 'Shortcuts',
	description: 'Apply pending changes, back up the configuration and jump to common pages.',
	sizes: ['sm', 'md', 'lg'],
	size: 'md',
	every: 10,
	lines: 3,
	settings: [
		{ name: 'links', type: 'switch', label: 'Show page shortcuts', value: true }
	],
	mount(ctx) {
		const s = ctx.state;
		s.$status = $('<div class="fs-wqa-status">');
		s.$apply = $('<button type="button" class="btn btn-primary btn-sm fs-action">').append(icon('check'), $('<span>').text(t('Apply changes')));
		const $backup = $('<a class="btn btn-secondary btn-sm fs-action" data-fs-nav>').attr('href', link(ctx, 'backup')).append(icon('download'), $('<span>').text(t('Back up')));
		ctx.$body.append(s.$status, $('<div class="fs-wqa-buttons">').append(s.$apply, $backup));
		s.$apply.on('click', () => {
			s.$apply.prop('disabled', true).attr('aria-busy', 'true');
			ctx.api.post('/v1/firewall/apply').then((r) => {
				toast((r.meta && r.meta.message) || t('Changes applied'), { level: 'ok' });
				$(document).trigger('fs:applied', [{ path: '/v1/firewall/apply' }]);
			}, (e) => toast.error(e)).finally(() => { s.$apply.removeAttr('aria-busy'); ctx.refresh(); });
		});
		if (ctx.settings.links) {
			const items = [['rules', 'shield-halved', t('Firewall rules')], ['firewallLog', 'list', t('Logs')], ['update', 'circle-arrow-up', t('Update Center')], ['general', 'gear', t('General setup')]];
			ctx.$body.append($('<ul class="fs-wqa-links" role="list">').append(items.map(([k, ic, label]) =>
				$('<li>').append($('<a class="fs-wqa-link" data-fs-nav>').attr('href', link(ctx, k)).append(icon(ic), $('<span>').text(label), icon('chevron-right').addClass('fs-wqa-chev'))))));
		}
		/* Pending changes made elsewhere on the page show up at once. */
		$(document).on(`fs:pending.${ctx.id}`, () => ctx.refresh());
	},
	load(ctx) {
		return ctx.get('/v1/firewall/pending').then((d) => {
			const s = ctx.state;
			const pending = Array.isArray(d.pending) ? d.pending.length > 0 : !!d.pending;
			s.$status.empty().append(pending ? statusNode('warn', t('Changes not applied yet')) : statusNode('ok', t('Everything is applied')));
			s.$apply.prop('disabled', !pending);
		});
	},
	destroy(ctx) { $(document).off(`fs:pending.${ctx.id}`); }
});

/* ------------------------------------------------------------------ Metric */

widgets.define('metric', {
	title: 'Metric',
	icon: 'chart-simple',
	category: 'Custom',
	description: 'Any single value from the API as a big number with a trend. Add several.',
	isNew: true,
	sizes: ['sm', 'md', 'lg'],
	size: 'sm',
	every: 5,
	lines: 2,
	empty: { icon: 'chart-simple', title: 'No value', text: 'The source did not return this field.' },
	settings: [
		{ name: 'label', label: 'Label', value: 'CPU usage', required: true },
		{ name: 'path', label: 'API source', value: '/v1/status/system', required: true, mono: true, help: 'A GET path, for example /v1/status/traffic' },
		{ name: 'field', label: 'Field', value: 'cpu.usage', mono: true, help: 'Path in the data: cpu.usage, wan.in_bps, [name=WAN_DHCP].rtt' },
		{ name: 'format', type: 'select', label: 'Format', value: 'pct', options: ['num', 'compact', 'pct', 'bps', 'bytes', 'ms', 'duration'].map((v) => ({ value: v, label: v })) },
		{ name: 'warn', type: 'number', label: 'Warning at', value: null },
		{ name: 'crit', type: 'number', label: 'Critical at', value: null }
	],
	mount(ctx) {
		const st = ctx.settings;
		const tile = { label: st.label, plain: true, format: st.format, trend: true };
		if (num(st.warn) !== null) tile.warn = num(st.warn);
		if (num(st.crit) !== null) tile.crit = num(st.crit);
		ctx.state.tile = ctx.child(ctx.$body, 'stat-tile', tile);
		ctx.state.spark = ctx.child(ctx.$body, 'sparkline', { label: st.label, format: st.format, variant: 'area', points: 40 });
	},
	load(ctx) {
		return ctx.get(ctx.settings.path).then((d) => {
			const v = num(pick(d, ctx.settings.field));
			if (v === null) return false;
			ctx.state.tile.set(v);
			ctx.state.spark.set(track(ctx, 'v', v, 40));
			return true;
		});
	}
});

