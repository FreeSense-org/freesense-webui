/*
 * network.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Core widgets, network group: Traffic, Interfaces, Gateways, Top talkers,
 * DHCP leases and State table.
 */
import $ from 'jquery';
import { widgets } from '../registry.js';
import { statusNode } from '../../status/status.js';
import { chipNode } from '../../chip/chip.js';
import { sparkSvg } from '../../sparkline/sparkline.js';
import { statusOf } from '../../sparkline/viz.js';
import { t, icon, link, keyed, track, footLink, bar, setBar } from './util.js';

/* Options for an interface select, from the API (used by several widgets' settings). */
const ifaceOptions = (ctx) => ctx.get('/v1/status/interfaces').then((list) => list.map((i) => ({ value: i.id, label: `${i.descr} (${i.if})` })));

/* ----------------------------------------------------------------- Traffic */

widgets.define('traffic', {
	title: 'Traffic',
	icon: 'chart-area',
	category: 'Network',
	description: 'Live throughput of one interface on top of its recent history. Add one per interface.',
	sizes: ['md', 'lg', 'xl', 'full'],
	size: 'xl',
	every: 2,
	skeleton: false,
	restartOnEvery: true,
	settings: [
		{ name: 'iface', type: 'select', label: 'Interface', value: 'wan', options: ifaceOptions },
		{ name: 'range', type: 'select', label: 'Start with', value: '10m', options: [{ value: '10m', label: 'Last 10 minutes (live)' }, { value: '1h', label: 'Last hour' }, { value: '24h', label: 'Last 24 hours' }] },
		{ name: 'chips', type: 'switch', label: 'Show interface chips', value: true }
	],
	mount(ctx) {
		const id = ctx.settings.iface || 'wan';
		ctx.state.$chips = $('<div class="fs-chips fs-wtraffic-chips" role="group">').attr('aria-label', t('Interface')).prop('hidden', !ctx.settings.chips).appendTo(ctx.$body);
		ctx.state.$chips.on('fs:chip-toggle', (e, d) => {
			if (d.value && d.value !== ctx.settings.iface) ctx.save({ iface: d.value });
			else ctx.state.$chips.find(`.fs-chip[data-value="${CSS.escape(d.value)}"] .fs-chip-main`).attr('aria-pressed', 'true').closest('.fs-chip').addClass('is-pressed');
		});
		ctx.child(ctx.$body, 'chart', {
			unit: 'bps',
			height: 210,
			history: { path: '/v1/status/traffic/history', query: { if: id } },
			live: { path: '/v1/status/traffic', query: { if: id }, every: ctx.every || 5 },
			series: [
				{ field: 'in_bps', live: `${id}.in_bps`, label: t('In'), color: 1, fill: true },
				{ field: 'out_bps', live: `${id}.out_bps`, label: t('Out'), color: 2 }
			],
			range: ctx.settings.range || '10m',
			ranges: ['10m', '1h', '24h'],
			liveRanges: ctx.every ? ['10m'] : []
		});
		ctx.setFooter(footLink(ctx, 'traffic', t('Traffic graphs')));
	},
	load(ctx) {
		return ctx.get('/v1/status/interfaces').then((list) => {
			const cur = list.find((i) => i.id === ctx.settings.iface);
			ctx.setSubtitle(cur ? `${cur.descr} · ${cur.if}${cur.speed ? ` · ${ctx.fmt.bps(cur.speed * 1e6)}` : ''}` : t('Interface {id} not found', { id: ctx.settings.iface }));
			const up = list.filter((i) => i.status === 'up' || i.id === ctx.settings.iface);
			keyed(ctx.state.$chips, up, (i) => i.id, (i) => chipNode({ label: i.descr, value: i.id, toggle: true, pressed: i.id === ctx.settings.iface }), () => {});
		});
	}
});

/* -------------------------------------------------------------- Interfaces */

widgets.define('interfaces', {
	title: 'Interfaces',
	icon: 'ethernet',
	category: 'Network',
	description: 'Link state, address and live rates of every interface.',
	sizes: ['md', 'lg', 'xl', 'full'],
	size: 'md',
	every: 5,
	lines: 5,
	empty: { icon: 'ethernet', title: 'No interfaces' },
	settings: [
		{ name: 'down', type: 'switch', label: 'Show interfaces that are down', value: true },
		{ name: 'spark', type: 'switch', label: 'Show a trend per interface', value: true }
	],
	mount(ctx) {
		ctx.state.$list = $('<ul class="fs-wlist" role="list">').appendTo(ctx.$body);
		ctx.setFooter(footLink(ctx, 'interfaces', t('All interfaces')));
	},
	load(ctx) {
		return ctx.get('/v1/status/interfaces').then((list) => {
			const rows = list.filter((i) => ctx.settings.down || i.status === 'up');
			const upN = list.filter((i) => i.status === 'up').length;
			ctx.setSubtitle(t('{up} of {n} up', { up: upN, n: list.length }));
			if (!rows.length) return false;
			keyed(ctx.state.$list, rows, (i) => i.id, () => $('<li class="fs-wrow">').append(
				$('<span class="fs-wrow-main">').append($('<span class="fs-wrow-title">'), $('<span class="fs-wrow-sub fs-mono">')),
				ctx.settings.spark ? $('<span class="fs-spark-plot fs-wrow-spark" aria-hidden="true">') : null,
				$('<span class="fs-wrow-value fs-wrates fs-num">')), ($r, i) => {
				const up = i.status === 'up';
				$r.toggleClass('is-down', !up);
				$r.find('.fs-wrow-title').empty().append(statusNode(up ? 'ok' : 'crit', i.descr, { variant: 'dot' }), $('<span class="fs-wrow-meta">').text(i.if));
				$r.find('.fs-wrow-sub').text(up ? (i.ipv4 || i.ipv6 || t('No address')) : (i.media || t('No carrier')));
				const $v = $r.find('.fs-wrates').empty();
				if (up) {
					$v.append($('<span>').append(icon('arrow-down'), $('<span class="visually-hidden">').text(t('In'))).append(document.createTextNode(` ${ctx.fmt.bps(i.in_bps)}`)),
						$('<span>').append(icon('arrow-up'), $('<span class="visually-hidden">').text(t('Out'))).append(document.createTextNode(` ${ctx.fmt.bps(i.out_bps)}`)));
				} else $v.append($('<span class="fs-muted">').text(t('Down')));
				if (ctx.settings.spark) sparkSvg(track(ctx, i.id, up ? i.in_bps : 0, 30), { variant: 'area', color: up ? 1 : 'neutral', min: 0 }, $r.find('.fs-wrow-spark'));
			});
			return true;
		});
	}
});

/* ---------------------------------------------------------------- Gateways */

widgets.define('gateways', {
	title: 'Gateways',
	icon: 'route',
	category: 'Network',
	description: 'Latency, jitter and packet loss of every gateway, with an RTT trend.',
	sizes: ['sm', 'md', 'lg', 'xl'],
	size: 'md',
	every: 5,
	lines: 4,
	empty: { icon: 'route', title: 'No gateways', text: 'Add a gateway under Network to monitor it here.' },
	settings: [
		{ name: 'spark', type: 'switch', label: 'Show the RTT trend', value: true },
		{ name: 'v6', type: 'switch', label: 'Show IPv6 gateways', value: true }
	],
	mount(ctx) {
		ctx.state.$list = $('<ul class="fs-wlist" role="list">').appendTo(ctx.$body);
		ctx.setFooter(footLink(ctx, 'gateways', t('Gateway details')));
		if (ctx.settings.spark) {
			ctx.get('/v1/status/gateways/history', { range: '10m' }).then((h) => {
				for (const [k, v] of Object.entries(h)) if (Array.isArray(v) && k !== 't') (ctx.state.hist = ctx.state.hist || {})[k] = v.slice(-29);
			}, () => {});
		}
	},
	load(ctx) {
		return ctx.get('/v1/status/gateways').then((list) => {
			const rows = list.filter((g) => ctx.settings.v6 || !/6$/.test(g.name));
			if (!rows.length) return false;
			const bad = rows.filter((g) => g.status !== 'online').length;
			ctx.setSubtitle(bad ? t('{n} need attention', { n: bad }) : t('All online'));
			keyed(ctx.state.$list, rows, (g) => g.name, () => $('<li class="fs-wrow">').append(
				$('<span class="fs-wrow-main">').append($('<span class="fs-wrow-title">'), $('<span class="fs-wrow-sub">')),
				ctx.settings.spark ? $('<span class="fs-spark-plot fs-wrow-spark" aria-hidden="true">') : null,
				$('<span class="fs-wrow-value fs-num">')), ($r, g) => {
				const st = statusOf(g.status);
				$r.find('.fs-wrow-title').empty().append($('<span class="fs-wrow-name">').text(g.name), g.default ? $('<span class="fs-wrow-meta">').text(t('default')) : null);
				$r.find('.fs-wrow-sub').empty().append(statusNode(st, st === 'ok' ? t('Online') : st === 'warn' ? t('Degraded') : t('Down'), { variant: 'pill' }),
					$('<span class="fs-wrow-meta">').text(g.rtt != null ? t('loss {l}% · ±{sd} ms', { l: g.loss, sd: g.sd }) : t('monitor {m}', { m: g.monitor })));
				const $v = $r.find('.fs-wrow-value').empty();
				if (g.rtt != null) $v.append(document.createTextNode(String(g.rtt)), $('<span class="fs-unit">').text(' ms')); else $v.append($('<span class="fs-muted">').text('—'));
				if (ctx.settings.spark) sparkSvg(track(ctx, g.name, g.rtt, 30), { color: st === 'ok' ? 2 : st }, $r.find('.fs-wrow-spark'));
			});
			return true;
		});
	}
});

/* ------------------------------------------------------------- Top talkers */

widgets.define('top-talkers', {
	title: 'Top talkers',
	icon: 'ranking-star',
	category: 'Network',
	description: 'The hosts moving the most traffic right now.',
	sizes: ['md', 'lg', 'xl', 'full'],
	size: 'lg',
	every: 5,
	lines: 5,
	empty: { icon: 'ranking-star', title: 'No traffic', text: 'Nothing is moving right now.' },
	settings: [
		{ name: 'count', type: 'number', label: 'Hosts to show', value: 6, min: 1, max: 20 },
		{ name: 'by', type: 'select', label: 'Rank by', value: 'total', options: [{ value: 'total', label: 'In + out' }, { value: 'in', label: 'Download' }, { value: 'out', label: 'Upload' }] }
	],
	mount(ctx) {
		ctx.state.$list = $('<ol class="fs-wlist fs-wtalkers">').appendTo(ctx.$body);
	},
	load(ctx) {
		return ctx.fetch('/v1/status/top-talkers').then((res) => {
			const by = ctx.settings.by;
			const val = (h) => (by === 'in' ? h.in_bps : by === 'out' ? h.out_bps : h.in_bps + h.out_bps);
			const rows = (res.data || []).slice().sort((a, b) => val(b) - val(a)).slice(0, Math.max(1, +ctx.settings.count || 6));
			if (!rows.length) return false;
			const max = Math.max(...rows.map(val), 1);
			ctx.setSubtitle(res.meta && res.meta.window ? t('Average over {w}', { w: res.meta.window }) : '');
			keyed(ctx.state.$list, rows, (h) => h.ip, () => $('<li class="fs-wtalker">').append(
				$('<span class="fs-wtalker-head">').append($('<span class="fs-wtalker-host">'), $('<span class="fs-wtalker-ip fs-mono">'), $('<span class="fs-wtalker-rate fs-num">')),
				bar(0, 1)), ($r, h) => {
				$r.find('.fs-wtalker-host').text(h.host || h.ip);
				$r.find('.fs-wtalker-ip').text(h.host ? h.ip : t('{n} flows', { n: h.flows }));
				$r.find('.fs-wtalker-rate').text(ctx.fmt.bps(val(h))).attr('title', t('In {a} · out {b}', { a: ctx.fmt.bps(h.in_bps), b: ctx.fmt.bps(h.out_bps) }));
				setBar($r.find('.fs-wbar'), val(h) / max);
			});
			return true;
		});
	}
});

/* ------------------------------------------------------------- DHCP leases */

widgets.define('dhcp-leases', {
	title: 'DHCP leases',
	icon: 'address-book',
	category: 'Network',
	description: 'Who is on the network: online count and a searchable lease list.',
	sizes: ['md', 'lg', 'xl', 'full'],
	size: 'md',
	every: 30,
	lines: 5,
	settings: [
		{ name: 'iface', type: 'select', label: 'Network', value: 'all', options: [{ value: 'all', label: 'All networks' }, 'LAN', 'GUEST', 'IOT', 'DMZ'] },
		{ name: 'online', type: 'switch', label: 'Only devices that are online', value: false },
		{ name: 'limit', type: 'number', label: 'Rows to show', value: 6, min: 1, max: 30 }
	],
	mount(ctx) {
		const s = ctx.state;
		s.q = '';
		s.$stat = $('<div class="fs-wleases-stat">');
		const sid = `${ctx.id}-q`;
		s.$q = $('<input type="search" class="form-control form-control-sm" autocomplete="off">').attr({ id: sid, placeholder: t('Search host, IP or MAC'), 'aria-label': t('Search leases') });
		s.$list = $('<ul class="fs-wlist" role="list">');
		s.$none = $('<p class="fs-wnote" hidden>');
		s.$count = $('<p class="visually-hidden" role="status" aria-live="polite">');
		ctx.$body.append(s.$stat, $('<div class="fs-wsearch">').append(icon('magnifying-glass'), s.$q), s.$list, s.$none, s.$count);
		s.$q.on('input', () => { s.q = s.$q.val().trim().toLowerCase(); draw(ctx); s.$count.text(t('{n} matching leases', { n: s.matches })); });
		ctx.setFooter(footLink(ctx, 'leases', t('All leases')));
	},
	load(ctx) {
		return ctx.get('/v1/status/dhcp-leases').then((list) => {
			ctx.state.all = list || [];
			if (!ctx.state.all.length) { ctx.state.empty = { icon: 'address-book', title: t('No leases yet'), text: t('Devices appear here once they get an address.') }; return false; }
			draw(ctx);
			return true;
		});
	}
});

function draw(ctx) {
	const s = ctx.state;
	const scope = s.all.filter((l) => (!ctx.settings.iface || ctx.settings.iface === 'all' || l.iface === ctx.settings.iface) && (!ctx.settings.online || l.online));
	const on = scope.filter((l) => l.online).length;
	s.$stat.empty().append(
		$('<span class="fs-wleases-num fs-num">').text(on),
		$('<span class="fs-wleases-label">').text(t('online')),
		$('<span class="fs-wleases-of fs-muted">').text(t('of {n} leases', { n: scope.length })));
	const hits = scope.filter((l) => !s.q || [l.hostname, l.ip, l.mac, l.vendor, l.iface].join(' ').toLowerCase().includes(s.q));
	s.matches = hits.length;
	const rows = hits.slice(0, Math.max(1, +ctx.settings.limit || 6));
	s.$none.prop('hidden', !!hits.length).text(t('No lease matches "{q}".', { q: s.q }));
	keyed(s.$list, rows, (l) => l.mac, () => $('<li class="fs-wrow">').append(
		$('<span class="fs-wrow-main">').append($('<span class="fs-wrow-title">'), $('<span class="fs-wrow-sub fs-mono">')),
		$('<span class="fs-wrow-value">')), ($r, l) => {
		$r.find('.fs-wrow-title').empty().append(statusNode(l.online ? 'ok' : 'neutral', l.hostname || t('Unknown device'), { variant: 'dot' }), $('<span class="fs-wrow-meta">').text(l.vendor || ''));
		$r.find('.fs-wrow-sub').text(`${l.ip} · ${l.mac}`);
		$r.find('.fs-wrow-value').empty().append($('<span class="fs-wtag">').text(l.iface), l.type === 'static' ? $('<span class="fs-wtag">').text(t('static')) : null);
	});
	if (hits.length > rows.length) s.$none.prop('hidden', false).text(t('{n} more; refine the search or open all leases.', { n: hits.length - rows.length }));
}

/* ------------------------------------------------------------- State table */

const PROTOS = [['tcp', 'TCP', 1], ['udp', 'UDP', 2], ['icmp', 'ICMP', 3], ['other', 'Other', 'other']];

widgets.define('states', {
	title: 'State table',
	icon: 'table-list',
	category: 'Security',
	description: 'State table usage, insert and removal rates and the protocol mix.',
	sizes: ['sm', 'md', 'lg', 'xl'],
	size: 'md',
	every: 5,
	lines: 4,
	mount(ctx) {
		const s = ctx.state;
		s.meter = ctx.child(ctx.$body, 'meter', { label: t('Used'), format: 'compact', max: 1, warn: 70, crit: 90 });
		const $tiles = $('<div class="fs-wtiles">').appendTo(ctx.$body);
		s.ins = ctx.child($tiles, 'stat-tile', { label: t('Inserts/s'), icon: 'plus', plain: true, size: 'compact', format: 'compact' });
		s.rem = ctx.child($tiles, 'stat-tile', { label: t('Removals/s'), icon: 'minus', plain: true, size: 'compact', format: 'compact' });
		s.$mix = $('<div class="fs-wmix">').appendTo(ctx.$body);
		s.$mixBar = $('<div class="fs-wmix-bar" aria-hidden="true">').appendTo(s.$mix);
		s.$mixLegend = $('<ul class="fs-wmix-legend" role="list">').attr('aria-label', t('Protocol mix')).appendTo(s.$mix);
		ctx.setFooter(footLink(ctx, 'states', t('Browse states')));
	},
	load(ctx) {
		return ctx.get('/v1/status/states').then((d) => {
			const s = ctx.state;
			s.meter.set(d.current, d.max);
			s.ins.set(d.rate_insert);
			s.rem.set(d.rate_remove);
			const total = PROTOS.reduce((n, [k]) => n + (d.by_proto[k] || 0), 0) || 1;
			ctx.setSubtitle(t('{n} searches/s', { n: ctx.fmt.compact(d.searches) }));
			keyed(s.$mixBar, PROTOS, ([k]) => k, ([, , col]) => $('<span class="fs-wmix-seg">').css('background', col === 'other' ? 'var(--fs-series-other)' : `var(--fs-series-${col})`), ($seg, [k]) => {
				$seg.css('flex-grow', d.by_proto[k] || 0);
			});
			keyed(s.$mixLegend, PROTOS, ([k]) => k, ([, label, col]) => $('<li>').append(
				$('<span class="fs-wmix-swatch" aria-hidden="true">').css('background', col === 'other' ? 'var(--fs-series-other)' : `var(--fs-series-${col})`),
				$('<span class="fs-wmix-name">').text(label), $('<span class="fs-wmix-val fs-num">')), ($li, [k]) => {
				$li.find('.fs-wmix-val').text(`${Math.round(((d.by_proto[k] || 0) / total) * 100)}%`);
			});
		});
	}
});


