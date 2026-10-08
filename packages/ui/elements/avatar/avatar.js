/*
 * avatar.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * avatar — a user's picture, or initials on a colour picked deterministically
 * from the theme's series tokens (or the accent). Sizes xs–xl, optional
 * presence dot (with text for screen readers). See spec.md.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { batch } from '../../js/batch.js';
import { t, initials, apiPath } from './identity.js';

export const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'];
const PRESENCE = { online: 'Online', away: 'Away', busy: 'Busy', offline: 'Offline' };

/** Stable colour index 1–8 from a string (FNV-1a). */
export function colorIndex(key) {
	let h = 0x811c9dc5;
	for (const ch of String(key || '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193); }
	return ((h >>> 0) % 8) + 1;
}

/**
 * Build an avatar node; also used by profile-menu, profile-card and others.
 * o: {name, username, initials, src, alt, size, color, presence, label}
 *   color: 'auto' (from the name) | 'accent' | 1–8 (series slot)
 */
export function avatarNode(o = {}) {
	const size = SIZES.includes(o.size) ? o.size : 'md';
	const key = o.username || o.name || '';
	let color = o.color ?? 'auto';
	if (color !== 'accent') color = Number.isInteger(+color) && +color >= 1 && +color <= 8 ? +color : colorIndex(key);
	const $a = $('<span class="fs-avatar">').attr({ 'data-size': size, 'data-color': String(color) });
	const text = o.initials || initials(o.name || o.username);
	const $ini = $('<span class="fs-avatar-initials" aria-hidden="true">').text(text);
	$a.append($ini);
	if (o.src) {
		const $img = $('<img class="fs-avatar-img" alt="" decoding="async">').attr('src', o.src);
		$img.on('error', () => $img.remove());
		$a.append($img);
	}
	const label = o.label === false ? null : (o.label || o.alt || o.name || o.username || null);
	if (label) $a.attr({ role: 'img', 'aria-label': o.presence && PRESENCE[o.presence] ? `${label} (${t(PRESENCE[o.presence])})` : label });
	else $a.attr('aria-hidden', 'true');
	if (o.presence && PRESENCE[o.presence]) {
		$a.append($('<span class="fs-avatar-presence">').attr({ 'data-presence': o.presence, title: t(PRESENCE[o.presence]) }));
	}
	return $a;
}

el.define('avatar', {
	init(node, config, ctx) {
		const $node = $(node).addClass('fs-avatar-host');
		function render(c) { $node.empty().append(avatarNode(c)); }
		if (config.source && config.source.path) {
			render({ ...config, name: config.name || '', label: false });
			ctx.live({
				every: config.every || 0,
				run: () => batch.get(apiPath(config.source.path), config.source.query).then((r) => render({ ...config, ...(r.data || {}), src: (r.data || {}).avatar || config.src })),
				onState: (s) => ctx.state(s)
			});
		} else render(config);
		return {
			/** el.get(node).set({name, src, presence, …}) */
			set(next) { Object.assign(config, next); render(config); }
		};
	}
});
