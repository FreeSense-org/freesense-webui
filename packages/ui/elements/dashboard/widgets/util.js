/*
 * util.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Small helpers shared by the core widgets: keyed lists that update in place
 * (focus survives a refresh), bounded value histories for sparklines, and
 * links to the pages behind a widget.
 */
import $ from 'jquery';
import { t } from '../../../js/i18n.js';
import { icon } from '../../toast/toast.js';

/* Pages behind the widgets ("View all" links). The dashboard's `linkBase` prefixes them. */
export const LINKS = {
	update: '/system/update',
	interfaces: '/network/interfaces',
	gateways: '/insights/gateways',
	services: '/insights/services',
	leases: '/insights/leases',
	vpn: '/vpn/wireguard-status',
	firewallLog: '/insights/logs',
	states: '/insights/states',
	traffic: '/insights/traffic',
	rules: '/security/rules',
	backup: '/tools/backup',
	general: '/system/general'
};

/** URL of a page for a widget link, honouring the dashboard's linkBase/links. */
export function link(ctx, key) {
	const o = ctx.links || {};
	if (o[key]) return o[key];
	return (ctx.linkBase || '') + (LINKS[key] || '/');
}

/**
 * Render items into $list keyed by key(item): rows are created once, updated
 * in place and re-ordered, so focus and hover survive refreshes.
 *   create(item) -> $row        update($row, item)
 */
export function keyed($list, items, key, create, update) {
	const old = new Map();
	$list.children('[data-key]').each((_, n) => old.set(n.getAttribute('data-key'), $(n)));
	let prev = null;
	for (const it of items) {
		const k = String(key(it));
		let $row = old.get(k);
		if ($row) old.delete(k);
		else $row = create(it).attr('data-key', k);
		update($row, it);
		if (prev) { if ($row.prev()[0] !== prev[0]) $row.insertAfter(prev); } else if ($list.children().first()[0] !== $row[0]) $list.prepend($row);
		prev = $row;
	}
	old.forEach(($r) => $r.remove());
}

/** Append a value to a bounded history kept in ctx.state.hist[key]. Returns the array. */
export function track(ctx, key, value, points = 30) {
	const h = (ctx.state.hist = ctx.state.hist || {});
	const a = (h[key] = h[key] || []);
	a.push(value === undefined ? null : value);
	while (a.length > points) a.shift();
	return a;
}

/** A "View all" style footer link (partial navigation). */
export function footLink(ctx, key, label) {
	return $('<a class="fs-wfoot-link" data-fs-nav>').attr('href', link(ctx, key)).append($('<span>').text(label), icon('arrow-right'));
}

/** A one-line muted note inside a widget. */
export function note(text) {
	return $('<p class="fs-wnote">').text(text);
}

/** A horizontal proportion bar (decorative; the value is always written next to it). */
export function bar(pct, color = 1) {
	return $('<span class="fs-wbar" aria-hidden="true">').append($('<span class="fs-wbar-fill">').css({ transform: `scaleX(${Math.max(0, Math.min(1, pct))})`, color: `var(--fs-series-${color})` }));
}
export function setBar($bar, pct) {
	$bar.children('.fs-wbar-fill').css('transform', `scaleX(${Math.max(0, Math.min(1, pct))})`);
}

export { t, icon };
