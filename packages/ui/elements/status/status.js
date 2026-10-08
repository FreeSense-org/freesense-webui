/*
 * status.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * status — icon + text for a state. Reference element: shows the contract
 * every element follows (see docs/ELEMENT-GUIDE.md).
 */
import $ from 'jquery';
import { el } from '../../js/el.js';

/* state → [icon, default label]. Colour is never the only signal (RULES R6). */
export const STATUS = {
	ok: ['circle-check', 'OK'],
	warn: ['triangle-exclamation', 'Warning'],
	crit: ['circle-xmark', 'Critical'],
	info: ['circle-info', 'Info'],
	neutral: ['circle', 'Unknown'],
	pending: ['circle-notch', 'Pending'],
	pass: ['circle-check', 'Pass'],
	block: ['ban', 'Block'],
	reject: ['circle-minus', 'Reject'],
	match: ['circle-half-stroke', 'Match']
};

/** Build a status node; also used by other elements (tables, lists, widgets). */
export function statusNode(state, label, { detail = null, variant = 'plain' } = {}) {
	const [ic, def] = STATUS[state] || STATUS.neutral;
	const $s = $('<span class="fs-status">').attr({ 'data-state': STATUS[state] ? state : 'neutral', 'data-variant': variant });
	$s.append($('<i aria-hidden="true">').addClass(`fa-solid fa-${ic}`), $('<span class="fs-status-label">').text(label || def));
	if (detail) $s.append($('<span class="fs-status-detail">').text(detail));
	return $s;
}

el.define('status', {
	init(node, config) {
		const $node = $(node);
		function render(c) {
			$node.empty().append(statusNode(c.state, c.label, { detail: c.detail, variant: c.variant }));
		}
		render(config);
		return {
			/** Change the state later: el.get(node).set({state, label}) */
			set(next) { Object.assign(config, next); render(config); }
		};
	}
});
