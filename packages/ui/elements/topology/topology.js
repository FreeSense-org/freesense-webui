/*
 * topology.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * topology — live diagram: WAN gateways → firewall → LAN/OPT networks, from
 * /v1/status/interfaces + /v1/status/gateways (+ /v1/status/system for the
 * hostname). Nodes are HTML cards with status icons; SVG connectors are drawn
 * between them and redrawn on resize. Narrow screens stack the columns.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { live } from '../../js/live.js';
import { states } from '../../js/states.js';
import { statusNode } from '../status/status.js';
import { T, get, format, statusOf, svg, nextId } from '../sparkline/viz.js';

const L = {
	firewall: 'Firewall',
	gateways: 'Gateways',
	networks: 'Networks',
	online: 'Online',
	degraded: 'Degraded',
	down: 'Down',
	up: 'Up',
	noGateway: 'No gateway',
	diagram: 'Network topology',
	in: 'In',
	out: 'Out'
};

function card(cls, title, sub, $status, extra) {
	const $c = $('<li class="fs-topology-node">').addClass(cls);
	$c.append($('<span class="fs-topology-name">').text(title));
	if (sub) $c.append($('<span class="fs-topology-sub fs-mono">').text(sub));
	if ($status) $c.append($status);
	if (extra) $c.append(extra);
	return $c;
}

el.define('topology', {
	init(node, config, ctx) {
		const c = {
			every: 5,
			interfaces: { path: '/v1/status/interfaces' },
			gateways: { path: '/v1/status/gateways' },
			system: { path: '/v1/status/system' },
			...config
		};
		const ns = `.${nextId('fstopo')}`;
		const $node = $(node).addClass('fs-topology');
		const $box = $('<div class="fs-topology-box">');
		const $diagram = $('<div class="fs-topology-diagram" role="group">').attr('aria-label', c.label || L.diagram);
		const wires = svg('svg', { class: 'fs-topology-wires', 'aria-hidden': 'true', focusable: 'false' });
		const $left = $('<ul class="fs-topology-col fs-topology-gws">').attr('aria-label', L.gateways);
		const $mid = $('<div class="fs-topology-col fs-topology-core">');
		const $right = $('<ul class="fs-topology-col fs-topology-nets">').attr('aria-label', L.networks);
		$diagram.append(wires, $left, $mid, $right);
		$node.empty().append($box);
		let links = [];

		function draw() {
			while (wires.firstChild) wires.removeChild(wires.firstChild);
			/* Stacked (narrow) layout: columns read top to bottom, no wires. */
			const stacked = $node.width() < 560;
			$node.attr('data-layout', stacked ? 'stacked' : 'wide');
			if (stacked) return;
			const host = $diagram[0].getBoundingClientRect();
			if (!host.width) return;
			wires.setAttribute('viewBox', `0 0 ${host.width} ${host.height}`);
			const fw = $mid.find('.fs-topology-fw')[0];
			if (!fw) return;
			const f = fw.getBoundingClientRect();
			for (const { n, side, state } of links) {
				const r = n.getBoundingClientRect();
				const y1 = r.top + r.height / 2 - host.top, y2 = f.top + f.height / 2 - host.top;
				const x1 = side === 'left' ? r.right - host.left : r.left - host.left;
				const x2 = side === 'left' ? f.left - host.left : f.right - host.left;
				const mx = (x1 + x2) / 2;
				const d = `M${x1},${y1}C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
				wires.appendChild(svg('path', { d, class: 'fs-topology-wire', 'data-state': state }));
			}
		}

		function render([ifs, gws, sys]) {
			const ifaces = (Array.isArray(ifs.data) ? ifs.data : []).filter((i) => i && i.id && i.status);
			const gateways = (Array.isArray(gws.data) ? gws.data : []).filter((g) => g && g.name && g.status);
			if (!ifaces.length && !gateways.length) { $diagram.detach(); return false; }
			if ($diagram.parent()[0] !== $box[0]) $box.empty().append($diagram);
			$node.attr('data-layout', $node.width() < 560 ? 'stacked' : 'wide');
			links = [];
			$left.empty();
			$right.empty();
			$mid.empty();

			for (const g of gateways) {
				const st = statusOf(g.status);
				const label = st === 'ok' ? L.online : st === 'warn' ? L.degraded : st === 'crit' ? L.down : null;
				const detail = g.rtt !== null && g.rtt !== undefined ? format(g.rtt, 'ms') : g.loss ? `${g.loss}% loss` : null;
				const ifo = ifaces.find((i) => i.id === g.iface);
				const $c = card('is-gateway', g.name, `${ifo ? `${ifo.descr} · ` : ''}${g.address || ''}`, statusNode(st, label, { detail }));
				$c.attr('data-state', st);
				$left.append($c);
				links.push({ n: $c[0], side: 'left', state: st });
			}

			const hostname = sys && sys.data ? sys.data.hostname : '';
			$mid.append($('<div class="fs-topology-node fs-topology-fw">').append(
				$('<span class="fs-topology-fw-icon" aria-hidden="true">').append($('<i class="fa-solid fa-shield-halved">')),
				$('<span class="fs-topology-name">').text(c.title || hostname || L.firewall),
				hostname && c.title ? $('<span class="fs-topology-sub fs-mono">').text(hostname) : null));

			const gwIfaces = new Set(gateways.map((g) => g.iface));
			for (const i of ifaces) {
				if (gwIfaces.has(i.id) || i.gateway) continue;
				const st = i.status === 'up' ? 'ok' : 'crit';
				const rate = i.status === 'up'
					? $('<span class="fs-topology-rate fs-num">').append(
						$('<i class="fa-solid fa-arrow-down" aria-hidden="true">'), $('<span class="visually-hidden">').text(`${L.in} `), document.createTextNode(` ${format(i.in_bps, 'bps')}  `),
						$('<i class="fa-solid fa-arrow-up" aria-hidden="true">'), $('<span class="visually-hidden">').text(`${L.out} `), document.createTextNode(` ${format(i.out_bps, 'bps')}`))
					: null;
				const $c = card('is-network', i.descr, [i.if, i.ipv4].filter(Boolean).join(' · '), statusNode(st, st === 'ok' ? L.up : L.down), rate);
				$c.attr('data-state', st);
				$right.append($c);
				links.push({ n: $c[0], side: 'right', state: st });
			}
			requestAnimationFrame(draw);
			return true;
		}

		const task = states.load(ctx, $box, () => Promise.all([get(c.interfaces), get(c.gateways), get(c.system).catch(() => null)]), render,
			{ every: c.every, lines: 5, $root: $node, empty: { icon: 'diagram-project', title: T.noData } });

		let ro = null;
		if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => requestAnimationFrame(draw)); ro.observe(node); }
		$(document).on(`fs:theme${ns}`, () => requestAnimationFrame(draw));

		return {
			reload() { live.now(task.id); },
			destroy() { if (ro) ro.disconnect(); $(document).off(ns); }
		};
	}
});
