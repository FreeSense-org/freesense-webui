/*
 * security.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Core widgets, security and services group: Services (start, restart,
 * stop), Firewall log (mini live tail) and VPN tunnels.
 */
import $ from 'jquery';
import { widgets } from '../registry.js';
import { statusNode } from '../../status/status.js';
import { statusOf } from '../../sparkline/viz.js';
import { toast } from '../../toast/toast.js';
import { confirm } from '../../confirm/confirm.js';
import { t, icon, keyed, footLink } from './util.js';
import { hostPort } from '../../log-viewer/log-viewer.js';

/* ---------------------------------------------------------------- Services */

/*
 * API: GET /v1/status/services [{name, description, running, mode?, vpnid?,
 * zone?}]; POST /v1/services/{name}/start|stop|restart {confirm: true, mode,
 * vpnid, zone} (OpenVPN instances and captive portal zones need those).
 */
function serviceAction(ctx, s, action, $btn) {
	const run = () => {
		$btn.prop('disabled', true).attr('aria-busy', 'true');
		const body = { confirm: true };
		for (const k of ['mode', 'vpnid', 'zone']) if (s[k] !== undefined) body[k] = s[k];
		return ctx.api.post(`/v1/services/${encodeURIComponent(s.name)}/${action}`, body).then((r) => {
			toast((r.meta && r.meta.message) || t('Done'), { level: 'ok' });
		}, (e) => toast.error(e)).finally(() => { $btn.prop('disabled', false).removeAttr('aria-busy'); ctx.refresh(); });
	};
	if (action !== 'stop') return run();
	return confirm({
		title: t('Stop {name}?', { name: s.description || s.name }),
		text: t('The service stays stopped until you start it again or the firewall restarts. Features that depend on it stop working.'),
		confirmLabel: t('Stop service'),
		danger: true
	}).then((ok) => (ok ? run() : $btn.trigger('focus')));
}

function actionBtn(ic, label) {
	return $('<button type="button" class="btn btn-ghost btn-sm fs-action-icon fs-wsvc-btn">').attr({ 'aria-label': label, title: label }).append(icon(ic));
}

widgets.define('services', {
	title: 'Services',
	icon: 'gears',
	category: 'Services',
	description: 'Service status with start, restart and stop.',
	sizes: ['md', 'lg', 'xl', 'full'],
	size: 'md',
	every: 10,
	lines: 5,
	empty: { icon: 'circle-check', title: 'No services to show', text: 'Every service is running.' },
	settings: [
		{ name: 'filter', type: 'select', label: 'Show', value: 'all', options: [{ value: 'all', label: 'All services' }, { value: 'stopped', label: 'Stopped services only' }] },
		{ name: 'limit', type: 'number', label: 'Rows to show', value: 7, min: 1, max: 30 }
	],
	mount(ctx) {
		ctx.state.$list = $('<ul class="fs-wlist fs-wsvc" role="list">').appendTo(ctx.$body);
		ctx.state.$more = $('<p class="fs-wnote" hidden>').appendTo(ctx.$body);
		ctx.setFooter(footLink(ctx, 'services', t('All services')));
	},
	load(ctx) {
		return ctx.get('/v1/status/services').then((list) => {
			list = list.map((s) => ({ ...s, descr: s.description || s.name, key: [s.name, s.mode, s.vpnid, s.zone].filter((x) => x !== undefined).join(':') }));
			const stopped = list.filter((s) => !s.running).length;
			ctx.setSubtitle(stopped ? t('{n} stopped', { n: stopped }) : t('All {n} running', { n: list.length }));
			const rows = list.filter((s) => ctx.settings.filter !== 'stopped' || !s.running);
			if (!rows.length) { ctx.state.$list.empty(); return false; }
			/* Stopped services first, so problems are visible in a small widget. */
			rows.sort((a, b) => Number(a.running) - Number(b.running));
			const shown = rows.slice(0, Math.max(1, +ctx.settings.limit || 7));
			ctx.state.$more.prop('hidden', shown.length === rows.length).text(t('{n} more services', { n: rows.length - shown.length }));
			keyed(ctx.state.$list, shown, (s) => s.key, (s) => {
				const $start = actionBtn('play', t('Start {name}', { name: s.descr }));
				const $restart = actionBtn('rotate-right', t('Restart {name}', { name: s.descr }));
				const $stop = actionBtn('stop', t('Stop {name}', { name: s.descr }));
				$start.on('click', () => serviceAction(ctx, s, 'start', $start));
				$restart.on('click', () => serviceAction(ctx, s, 'restart', $restart));
				$stop.on('click', () => serviceAction(ctx, s, 'stop', $stop));
				return $('<li class="fs-wrow">').append(
					$('<span class="fs-wrow-main">').append($('<span class="fs-wrow-title">'), $('<span class="fs-wrow-sub fs-mono">').text(s.name)),
					$('<span class="fs-wsvc-actions">').append($start, $restart, $stop));
			}, ($r, s) => {
				$r.find('.fs-wrow-title').empty().append(statusNode(s.running ? 'ok' : 'crit', s.descr, { variant: 'dot' }), s.running ? null : $('<span class="fs-wrow-meta fs-wsvc-stopped">').text(t('Stopped')));
				const [$start, $restart, $stop] = $r.find('.fs-wsvc-btn').toArray().map((n) => $(n));
				$start.prop('hidden', s.running);
				$restart.prop('hidden', !s.running);
				$stop.prop('hidden', !s.running);
			});
			return true;
		});
	}
});

/* ------------------------------------------------------------ Firewall log */

const ACTION_LABEL = { pass: 'Pass', block: 'Block', reject: 'Reject', match: 'Match' };

widgets.define('firewall-log', {
	title: 'Firewall log',
	icon: 'list',
	category: 'Security',
	description: 'The newest firewall log entries as they arrive.',
	sizes: ['md', 'lg', 'xl', 'full'],
	size: 'lg',
	every: 2,
	lines: 6,
	empty: { icon: 'list', title: 'No log entries', text: 'Nothing matched the filter yet.' },
	settings: [
		{ name: 'action', type: 'select', label: 'Show', value: '', required: false, placeholder: 'All actions', options: [{ value: 'block', label: 'Blocked' }, { value: 'pass', label: 'Passed' }, { value: 'block,reject', label: 'Blocked and rejected' }] },
		{ name: 'limit', type: 'number', label: 'Entries to show', value: 8, min: 3, max: 30 }
	],
	mount(ctx) {
		ctx.state.rows = [];
		ctx.state.last = null;
		ctx.state.$list = $('<ol class="fs-wlog" aria-live="off">').appendTo(ctx.$body);
		ctx.setFooter(footLink(ctx, 'firewallLog', t('Open the firewall log')));
	},
	load(ctx) {
		const s = ctx.state;
		const limit = Math.max(1, +ctx.settings.limit || 8);
		const q = { limit, format: 'webui' };
		if (ctx.settings.action) q.action = ctx.settings.action;
		if (s.last) q.after = s.last;
		return ctx.fetch('/v1/logs/firewall', q).then((res) => {
			const got = res.data || [];
			/* First page is newest first; tail pages (?after) are oldest first. */
			const fresh = s.last ? got.slice().reverse() : got;
			s.rows = fresh.concat(s.rows).slice(0, limit);
			/* last_id is an opaque cursor; a reset (log rotated) starts over. */
			if (res.meta && res.meta.reset) s.rows = (s.last ? got.slice().reverse() : got).slice(0, limit);
			if (res.meta && res.meta.last_id) s.last = res.meta.last_id;
			ctx.setSubtitle(s.rows.length ? t('Newest at {time}', { time: ctx.fmt.time(s.rows[0].time) }) : '');
			if (!s.rows.length) return false;
			keyed(s.$list, s.rows, (e) => e.id, (e) => $('<li class="fs-wlog-row">').toggleClass('is-new', !!s.seeded).append(
				$('<span class="fs-wlog-time fs-num">').text(ctx.fmt.time(e.time)).attr('title', ctx.fmt.datetime(e.time)),
				$('<span class="fs-wlog-act">').append(statusNode(e.action, t(ACTION_LABEL[e.action] || e.action), { variant: 'pill' })),
				$('<span class="fs-wlog-if">').text(e.iface_descr),
				$('<span class="fs-wlog-flow fs-mono">').append(
					$('<span>').text(hostPort(e.src, e.srcport)),
					icon('arrow-right').addClass('fs-wlog-arrow'),
					$('<span>').text(hostPort(e.dst, e.dstport))),
				$('<span class="fs-wlog-proto fs-mono">').text(e.proto)).attr('title', e.rule || ''), () => {});
			s.seeded = true;
			return true;
		});
	}
});

/* -------------------------------------------------------------- VPN tunnels */

/* API: GET /v1/status/vpn [{type, name, description, status: up | connecting | idle | down, peer, since, handshake, rx, tx}]. */
const VPN_TYPES = { wireguard: ['WireGuard', 'shield-halved'], openvpn: ['OpenVPN', 'lock'], ipsec: ['IPsec', 'key'] };
const VPN_STATUS = { idle: 'neutral' };

widgets.define('vpn', {
	title: 'VPN tunnels',
	icon: 'shield-halved',
	category: 'VPN',
	description: 'WireGuard, OpenVPN and IPsec tunnels with status and traffic.',
	sizes: ['md', 'lg', 'xl', 'full'],
	size: 'md',
	every: 10,
	lines: 5,
	empty: { icon: 'shield-halved', title: 'No tunnels', text: 'Set up WireGuard, OpenVPN or IPsec under VPN.' },
	settings: [
		{ name: 'type', type: 'select', label: 'Tunnels', value: 'all', options: [{ value: 'all', label: 'All types' }, { value: 'wireguard', label: 'WireGuard' }, { value: 'openvpn', label: 'OpenVPN' }, { value: 'ipsec', label: 'IPsec' }] }
	],
	mount(ctx) {
		ctx.state.$list = $('<div class="fs-wvpn">').appendTo(ctx.$body);
		ctx.setFooter(footLink(ctx, 'vpn', t('VPN status')));
	},
	load(ctx) {
		return ctx.get('/v1/status/vpn').then((list) => {
			const rows = list.filter((v) => ctx.settings.type === 'all' || !ctx.settings.type || v.type === ctx.settings.type);
			if (!rows.length) return false;
			const up = rows.filter((v) => v.status === 'up').length;
			ctx.setSubtitle(t('{up} of {n} connected', { up, n: rows.filter((v) => v.status !== 'idle').length || rows.length }));
			const groups = Object.keys(VPN_TYPES).filter((k) => rows.some((v) => v.type === k)).map((k) => ({ k, items: rows.filter((v) => v.type === k) }));
			keyed(ctx.state.$list, groups, (g) => g.k, (g) => $('<section class="fs-wvpn-group">').append(
				$('<h3 class="fs-wvpn-title">').append(icon(VPN_TYPES[g.k][1]), $('<span>').text(VPN_TYPES[g.k][0])),
				$('<ul class="fs-wlist" role="list">')), ($g, g) => {
				keyed($g.children('ul'), g.items, (v) => `${v.name}:${v.vpnid ?? ''}:${v.interface ?? ''}`, () => $('<li class="fs-wrow">').append(
					$('<span class="fs-wrow-main">').append($('<span class="fs-wrow-title">'), $('<span class="fs-wrow-sub">')),
					$('<span class="fs-wrow-value fs-wvpn-io fs-num">')), ($r, v) => {
					const st = statusOf(v.status, VPN_STATUS);
					$r.find('.fs-wrow-title').empty().append(statusNode(st, v.description || v.name, { variant: 'dot' }));
					const since = v.type === 'wireguard'
						? (v.handshake != null ? t('handshake {d} ago', { d: ctx.fmt.duration(v.handshake) }) : t('No handshake yet'))
						: v.status === 'up' ? (v.since ? t('up {d}', { d: ctx.fmt.duration(v.since) }) : t('Connected'))
							: t({ connecting: 'Connecting', idle: 'Waiting for clients' }[v.status] || 'Down');
					$r.find('.fs-wrow-sub').text([v.peer, since].filter(Boolean).join(' · '));
					$r.find('.fs-wvpn-io').empty().append(
						$('<span>').append(icon('arrow-down'), $('<span class="visually-hidden">').text(t('Received'))).append(document.createTextNode(` ${ctx.fmt.bytes(v.rx)}`)),
						$('<span>').append(icon('arrow-up'), $('<span class="visually-hidden">').text(t('Sent'))).append(document.createTextNode(` ${ctx.fmt.bytes(v.tx)}`)));
				});
			});
			return true;
		});
	}
});
