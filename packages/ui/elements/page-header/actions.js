/*
 * actions.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Shared action helpers for the page & layout elements (page-header, card,
 * section, toolbar). One action config everywhere:
 *
 *   { id, label, icon, href, external, variant, danger, iconOnly, disabled, title }
 *
 * - With `href` the action is a link (partial navigation via data-fs-nav,
 *   or a new tab when `external`).
 * - Without `href` it is a button; the owning element emits
 *   `fs:action` with `{ id, el }` on its own node (jQuery event, bubbles).
 *
 * Overflow and header menus use Bootstrap's dropdown (keyboard arrows,
 * Escape, focus return), with the same item config plus `divider: true`.
 */
import $ from 'jquery';
import { Dropdown } from 'bootstrap';

/* Translation hook: every visible string of these elements goes through t(),
 * so they move to FS.i18n in one place when the runtime gets it (RULES R12). */
export const t = (s) => s;

export function icon(name) {
	return $('<i aria-hidden="true">').addClass(`fa-solid fa-${name}`);
}

/** Emit an element event on its node: handlers get (event, detail). */
export function emit(node, type, detail) {
	$(node).trigger(type, [detail]);
}

/** A button or link for one action. onAction(action) runs for buttons. */
export function actionNode(a, { onAction = null, size = '', variant = 'secondary' } = {}) {
	const v = a.variant || variant;
	const label = a.label || a.id || '';
	const $b = a.href ? $('<a>').attr('href', a.href) : $('<button type="button">');
	if (a.href) {
		if (a.external) $b.attr({ target: '_blank', rel: 'noopener' });
		else $b.attr('data-fs-nav', '');
	}
	$b.addClass(`btn btn-${v} fs-action`).attr('data-fs-action', a.id || '');
	if (size) $b.addClass(`btn-${size}`);
	if (a.danger) $b.addClass('is-danger');
	if (a.icon) $b.append(icon(a.icon));
	if (a.iconOnly) $b.addClass('fs-action-icon').attr({ 'aria-label': label, title: a.title || label });
	else {
		$b.append($('<span class="fs-action-label">').text(label));
		if (a.title) $b.attr('title', a.title);
	}
	if (a.disabled) {
		if (a.href) $b.addClass('disabled').attr({ 'aria-disabled': 'true', tabindex: '-1' });
		else $b.prop('disabled', true);
	}
	if (!a.href && onAction) $b.on('click', () => onAction(a));
	return $b;
}

/** Items of a dropdown menu (shared by menuNode and overflow menus). */
export function menuItems(items, onAction) {
	return items.map((a) => {
		if (a.divider) return $('<li>').append($('<hr class="dropdown-divider">'));
		const $i = actionNode(a, { onAction }).removeClass('btn btn-secondary btn-primary btn-ghost btn-danger btn-link fs-action-icon')
			.addClass('dropdown-item fs-menu-item').removeAttr('aria-label');
		if (a.iconOnly) $i.append($('<span class="fs-action-label">').text(a.label || a.id || ''));
		return $('<li>').append($i);
	});
}

/** A "more" menu: an icon-only toggle plus a dropdown of actions. */
export function menuNode(items, { label = t('More actions'), iconName = 'ellipsis', onAction = null, size = '', text = null, className = '' } = {}) {
	const $btn = $('<button type="button" class="btn btn-ghost fs-menu-toggle" data-bs-toggle="dropdown" aria-expanded="false">')
		.append(icon(iconName));
	if (size) $btn.addClass(`btn-${size}`);
	if (text) $btn.append($('<span class="fs-action-label">').text(text)).attr('aria-label', null);
	else $btn.addClass('fs-action-icon').attr({ 'aria-label': label, title: label });
	const $menu = $('<ul class="dropdown-menu dropdown-menu-end fs-menu-list">').append(menuItems(items, onAction));
	return $('<div class="dropdown fs-menu">').addClass(className).append($btn, $menu);
}

/** Dispose Bootstrap dropdowns created inside a node (call from destroy()). */
export function disposeMenus(node) {
	node.querySelectorAll('[data-bs-toggle="dropdown"]').forEach((b) => { const d = Dropdown.getInstance(b); if (d) d.dispose(); });
}
