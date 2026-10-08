/*
 * drawer.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * drawer — side panel on the right for details and quick edits: title, a body
 * of nested element configs, footer actions. Escape or the scrim closes it;
 * focus is trapped inside and returns to the opener. Full screen on phones.
 *
 *   import { drawer } from '../drawer/drawer.js';
 *   drawer.open({ title: 'web01', body: [{ el: 'status', config: {…} }], footer: [...] });
 *   drawer.close();
 *
 * One drawer at a time: opening another replaces it. The root class is
 * .fs-side-drawer because the shell already owns .fs-drawer (its nav drawer).
 * Temporary bridge: window.FS.drawer.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { t, bridge, icon, reducedMotion } from '../toast/toast.js';
import { runAction, busy, isBusy, triggerButton } from '../confirm/confirm.js';

const ns = '.fs-side-drawer';
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
let current = null;
let seq = 0;

function bodyItem(item) {
	if (item == null) return null;
	if (item.jquery || item.nodeType) return item;
	if (item.el) return $('<div class="fs-side-drawer-item">').attr({ 'data-fs-el': item.el, 'data-fs-config': JSON.stringify(item.config || {}) });
	if (item.heading) return $('<h3 class="fs-side-drawer-heading">').text(item.heading);
	if (item.text) return $('<p class="fs-side-drawer-text">').text(item.text);
	return null;
}

function footerButton(a, api) {
	const $b = $(a.href ? '<a class="btn">' : '<button type="button" class="btn">').addClass(`btn-${a.variant || 'secondary'}`);
	if (a.href) $b.attr('href', a.href).attr('data-fs-nav', a.nav === false ? null : '');
	if (a.icon) $b.append(icon(a.icon), document.createTextNode(' '));
	$b.append($('<span>').text(a.label));
	if (a.href) return $b.on('click', () => api.close({ restoreFocus: false }));
	$b.on('click', async () => {
		if (isBusy($b)) return;
		if (a.onClick) {
			const r = await a.onClick(api);
			if (r !== false && a.close) api.close();
			return;
		}
		if (a.action) {
			busy($b, true);
			try {
				await runAction(a.action, { success: a.success });
				api.close();
			} catch { /* reported by toast */ } finally { busy($b, false); }
			return;
		}
		api.close();
	});
	return $b;
}

function focusables($panel) {
	return $panel.find(FOCUSABLE).filter(':visible');
}

/** Close the open drawer (if any). */
function close(opts) { if (current) current.close(opts); }

/**
 * Open a drawer. Returns { close(), element, $body }.
 *   title, subtitle, icon, size ('md' | 'lg'), body: [{el, config} | {heading} | {text} | Node],
 *   footer: [{label, variant, icon, href, action: {method, path, body}, success, onClick(api), close}],
 *   onClose()
 */
function open(config = {}) {
	if (current) current.close({ instant: true, restoreFocus: false });
	const id = `fs-side-drawer-${++seq}`;
	const returnTo = current ? current.returnTo : document.activeElement;
	const $scrim = $('<div class="fs-side-drawer-scrim" aria-hidden="true">');
	const $panel = $('<aside class="fs-side-drawer" role="dialog" aria-modal="true" tabindex="-1">')
		.attr({ id, 'aria-labelledby': `${id}-title`, 'data-size': config.size || 'md' });

	const $titles = $('<div class="fs-side-drawer-titles">').append($('<h2 class="fs-side-drawer-title">').attr('id', `${id}-title`).text(config.title || ''));
	if (config.subtitle) $titles.append($('<p class="fs-side-drawer-subtitle">').text(config.subtitle));
	const $head = $('<header class="fs-side-drawer-head">');
	if (config.icon) $head.append($('<span class="fs-side-drawer-icon">').append(icon(config.icon)));
	const $x = $('<button type="button" class="btn btn-ghost fs-side-drawer-x">').attr({ 'aria-label': t('Close'), title: t('Close') }).append(icon('xmark'));
	$head.append($titles, $x);

	const $body = $('<div class="fs-side-drawer-body">');
	for (const item of config.body || []) $body.append(bodyItem(item));

	let closed = false;
	const api = {
		element: $panel[0],
		$body,
		returnTo,
		close({ instant = false, restoreFocus = true } = {}) {
			if (closed) return;
			closed = true;
			if (current === api) current = null;
			$(document).off(ns);
			$panel.removeClass('is-open');
			$scrim.removeClass('is-open');
			const done = () => { $panel.remove(); $scrim.remove(); };
			if (instant || reducedMotion()) done(); else setTimeout(done, 240);
			if (!current) $('html').removeClass('fs-side-drawer-lock');
			if (restoreFocus && returnTo && document.body.contains(returnTo) && typeof returnTo.focus === 'function') returnTo.focus();
			if (config.onClose) config.onClose();
			$(document).trigger('fs:drawer-closed', [{ id }]);
		}
	};

	const footer = config.footer ?? [{ label: t('Close') }];
	if (footer.length) {
		$panel.append($head, $body, $('<footer class="fs-side-drawer-foot">').append(footer.map((a) => footerButton(a, api))));
	} else $panel.append($head, $body);

	$x.on('click', () => api.close());
	$scrim.on('click', () => api.close());

	/* Escape and focus trap. A Bootstrap modal opened from the drawer handles its own keys. */
	const inOverlay = (n) => n && n.closest && n.closest('.modal, .fs-toasts');
	$(document).on(`keydown${ns}`, (e) => {
		if (e.isDefaultPrevented() || inOverlay(e.target) || document.querySelector('.modal.show')) return;
		if (e.key === 'Escape') { e.preventDefault(); api.close(); return; }
		if (e.key !== 'Tab') return;
		const f = focusables($panel);
		if (!f.length) { e.preventDefault(); $panel.trigger('focus'); return; }
		const first = f[0], last = f[f.length - 1];
		if (!$panel[0].contains(document.activeElement)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
		else if (e.shiftKey && (document.activeElement === first || document.activeElement === $panel[0])) { e.preventDefault(); last.focus(); }
		else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
	}).on(`focusin${ns}`, (e) => {
		if ($panel[0].contains(e.target) || inOverlay(e.target)) return;
		(focusables($panel)[0] || $panel[0]).focus();
	});

	$('html').addClass('fs-side-drawer-lock');
	$('body').append($scrim, $panel);
	current = api;
	requestAnimationFrame(() => requestAnimationFrame(() => {
		$panel.addClass('is-open');
		$scrim.addClass('is-open');
	}));
	/* Focus the first control in the body, else the close button. */
	const target = $body.find(FOCUSABLE).filter(':visible')[0] || $x[0];
	target.focus({ preventScroll: true });
	$(document).trigger('fs:drawer-opened', [{ id }]);
	return api;
}

export const drawer = { open, close, get current() { return current; } };

el.define('drawer', {
	init(node, config) {
		const $node = $(node).addClass('fs-confirm');
		const $btn = triggerButton(config, config.drawer && config.drawer.title ? config.drawer.title : t('Details')).appendTo($node);
		$btn.attr('aria-haspopup', 'dialog');
		const show = (extra) => open({ ...(config.drawer || {}), ...extra });
		$btn.on('click', () => show());
		return { open: show, close, destroy() { $btn.off(); } };
	}
});

bridge('drawer', drawer);
