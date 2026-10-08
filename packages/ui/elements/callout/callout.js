/*
 * callout.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * callout — inline info / warning / danger / success message with icon,
 * title, text, an optional action link and an optional dismiss button.
 * A dismissed callout with an id stays hidden for this browser (localStorage).
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { t, icon } from '../toast/toast.js';

/* level → [icon, screen-reader prefix] */
export const CALLOUT = {
	info: ['circle-info', 'Note'],
	warn: ['triangle-exclamation', 'Warning'],
	danger: ['circle-exclamation', 'Important'],
	success: ['circle-check', 'Done']
};
const ALIAS = { ok: 'success', crit: 'danger', warning: 'warn', error: 'danger', tip: 'info' };
const KEY = 'fs-callout-dismissed:';

function dismissed(id) {
	if (!id) return false;
	try { return localStorage.getItem(KEY + id) === '1'; } catch { return false; }
}
function remember(id, on) {
	if (!id) return;
	try { if (on) localStorage.setItem(KEY + id, '1'); else localStorage.removeItem(KEY + id); } catch { /* storage unavailable */ }
}

/** Build callout markup; also used by other elements (forms, drawers, pages). */
export function calloutNode(c, { onDismiss = null } = {}) {
	const level = CALLOUT[ALIAS[c.level] || c.level] ? ALIAS[c.level] || c.level : 'info';
	const [ic, prefix] = CALLOUT[level];
	const $c = $('<div class="fs-callout">').attr('data-level', level);
	if (c.compact) $c.addClass('is-compact');
	if (c.announce) $c.attr('role', level === 'danger' || level === 'warn' ? 'alert' : 'status');
	const $body = $('<div class="fs-callout-body">');
	if (c.title) $body.append($('<p class="fs-callout-title">').append($('<span class="visually-hidden">').text(`${t(prefix)}: `), $('<span>').text(c.title)));
	if (c.text) $body.append($('<p class="fs-callout-text">').append(c.title ? null : $('<span class="visually-hidden">').text(`${t(prefix)}: `), $('<span>').text(c.text)));
	if (c.action && c.action.label) {
		const $a = c.action.href
			? $('<a class="fs-callout-action">').attr('href', c.action.href).attr('data-fs-nav', c.action.nav === false ? null : '')
			: $('<button type="button" class="btn btn-link fs-callout-action">');
		$a.append($('<span>').text(c.action.label), icon('arrow-right'));
		if (c.action.event) $a.on('click', () => $c.trigger(c.action.event, [c]));
		$body.append($a);
	}
	$c.append($('<span class="fs-callout-icon">').append(icon(c.icon || ic)), $body);
	if (c.dismissible) {
		$c.append($('<button type="button" class="btn btn-ghost fs-callout-x">')
			.attr({ 'aria-label': t('Dismiss'), title: t('Dismiss') }).append(icon('xmark'))
			.on('click', () => onDismiss && onDismiss()));
	}
	return $c;
}

el.define('callout', {
	init(node, config) {
		const $node = $(node);
		function render() {
			if (config.dismissible && dismissed(config.id)) { $node.empty().prop('hidden', true); return; }
			$node.prop('hidden', false).empty().append(calloutNode(config, { onDismiss: dismiss }));
		}
		function dismiss() {
			remember(config.id, true);
			const $c = $node.children('.fs-callout');
			/* Move focus somewhere sensible before the button disappears. */
			const sel = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea';
			const next = $node[0].contains(document.activeElement) ? $node.nextAll().find(sel).addBack(sel).filter(':visible')[0] : null;
			$c.addClass('is-leaving');
			setTimeout(() => { $node.empty().prop('hidden', true); }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160);
			if (next) next.focus({ preventScroll: true });
			$node.trigger('fs:dismissed', [config.id || null]);
		}
		render();
		return {
			dismiss,
			/** Forget the dismissal and show it again. */
			show() { remember(config.id, false); render(); },
			set(next) { Object.assign(config, next); render(); }
		};
	}
});
