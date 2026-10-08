/*
 * badge.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * badge — a small static label: a tag, a count, a type ("urltable"), a
 * version. The text always carries the meaning; the tone only supports it.
 * For a state with an icon use the status element.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { icon } from '../toast/toast.js';

export const TONES = ['neutral', 'accent', 'ok', 'warn', 'crit', 'info'];

/** Build a badge; also used by other elements (tables, chips, headers). */
export function badgeNode(c) {
	const tone = TONES.includes(c.tone) ? c.tone : 'neutral';
	const $b = $('<span class="fs-badge">').attr({ 'data-tone': tone, 'data-variant': c.variant || 'soft' });
	if (c.icon) $b.append(icon(c.icon));
	if (c.label != null && c.label !== '') $b.append($('<span class="fs-badge-label">').text(c.label));
	if (c.count != null) $b.append($('<span class="fs-badge-count fs-num">').text(typeof c.count === 'number' ? c.count.toLocaleString() : c.count));
	if (c.mono) $b.addClass('fs-mono');
	if (c.title) $b.attr('title', c.title);
	return $b;
}

el.define('badge', {
	init(node, config) {
		const $node = $(node).addClass('fs-badge-host');
		const render = () => $node.empty().append((config.items || [config]).map(badgeNode));
		render();
		return { set(next) { Object.assign(config, next); render(); } };
	}
});
