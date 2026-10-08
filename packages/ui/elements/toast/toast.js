/*
 * toast.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * toast — transient result messages, stacked bottom-right (bottom on phones).
 *
 *   import { toast } from '../toast/toast.js';
 *   toast('Alias WEB_SERVERS deleted', { level: 'ok', action: { label: 'Undo', onClick } });
 *   toast.error(e)                       // a normalised FS.api error
 *
 * The element (data-fs-el="toast") turns its node into the toast host. When no
 * host exists the API creates one on <body>. With `inline: true` the node is a
 * static preview (gallery, docs) and never receives API toasts.
 *
 * Temporary bridge: the API is attached as window.FS.toast until the runtime
 * exposes it itself (the lead moves it into packages/ui/js).
 */
import $ from 'jquery';
import { el } from '../../js/el.js';

/* --------------------------------------------------------------- shared */

/** Translate through FS.i18n when it exists; {name} placeholders are filled from vars. */
export function t(s, vars) {
	const i18n = window.FS && window.FS.i18n;
	let out = i18n && typeof i18n.t === 'function' ? i18n.t(s) : s;
	if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
	return out;
}

/** Attach an API to window.FS once the runtime has created it (temporary bridge). */
export function bridge(key, value) {
	const set = () => { if (window.FS && !(key in window.FS)) window.FS[key] = value; };
	set();
	queueMicrotask(set);
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', set, { once: true });
}

/*
 * Configs use '/v1/…' paths (ELEMENT-GUIDE §3), but FS.api prefixes '/api/v1'
 * itself, so '/v1/x' would become '/api/v1/v1/x'. Strip the version until
 * api.url() accepts both forms.
 */
export const apiPath = (p) => String(p || '').replace(/^\/v1(?=\/)/, '');

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function icon(name) { return $('<i aria-hidden="true">').addClass(`fa-solid fa-${name}`); }

/* ---------------------------------------------------------------- toast */

/* level → [icon, screen-reader prefix, default timeout in seconds] */
export const LEVELS = {
	ok: ['circle-check', 'Success', 5],
	info: ['circle-info', 'Information', 6],
	warn: ['triangle-exclamation', 'Warning', 8],
	crit: ['circle-xmark', 'Error', 0]
};
const ALIAS = { success: 'ok', error: 'crit', danger: 'crit', warning: 'warn' };
const MAX = 4;

let host = null;

function setupHost($h, { inline = false, label } = {}) {
	$h.addClass('fs-toasts').toggleClass('is-inline', inline).attr({
		role: 'region',
		'aria-label': label || t('Notifications'),
		'aria-live': inline ? 'off' : 'polite',
		'aria-relevant': 'additions'
	});
	return $h;
}

function ensureHost() {
	if (host && document.body.contains(host[0])) return host;
	host = setupHost($('<div>').appendTo(document.body));
	return host;
}

function build(message, o, inline) {
	const level = LEVELS[ALIAS[o.level] || o.level] ? ALIAS[o.level] || o.level : 'info';
	const [ic, prefix] = LEVELS[level];
	const $t = $('<div class="fs-toast">').attr('data-level', level);
	const $body = $('<div class="fs-toast-body">');
	if (o.title) $body.append($('<p class="fs-toast-title">').text(o.title));
	$body.append($('<p class="fs-toast-text">').append(
		$('<span class="visually-hidden">').text(`${t(prefix)}: `),
		$('<span class="fs-toast-message">').text(message),
		$('<span class="fs-toast-count fs-num" hidden>')));
	$t.append($('<span class="fs-toast-icon">').append(icon(o.icon || ic)), $body);
	const $actions = $('<div class="fs-toast-actions">');
	if (o.action && o.action.label) {
		$actions.append($('<button type="button" class="btn btn-sm btn-link fs-toast-action">').text(o.action.label));
	}
	$actions.append($('<button type="button" class="btn btn-sm btn-ghost fs-toast-close">')
		.attr({ 'aria-label': t('Dismiss'), title: t('Dismiss') }).append(icon('xmark')));
	$t.append($actions);
	if (inline) $t.addClass('is-shown');
	return { $t, level };
}

/**
 * Show a toast. Returns { close() }.
 *   level    'ok' | 'info' | 'warn' | 'crit'   (default 'info')
 *   title    optional bold first line
 *   action   { label, onClick }  e.g. Undo; the toast closes after the click
 *   timeout  seconds; 0 = stays until dismissed (default: ok 5, info 6, warn 8, crit 0; 10 with an action)
 */
export function toast(message, o = {}) {
	const $host = o.host ? $(o.host) : ensureHost();
	const inline = $host.hasClass('is-inline');
	const { $t, level } = build(String(message ?? ''), o, inline);
	const key = `${level}|${o.title || ''}|${message}`;

	/* The same message again: bump a counter and restart its timer instead of stacking. */
	const $dup = !o.action && !inline ? $host.children('.fs-toast').filter((i, n) => n.fsKey === key && !n.classList.contains('is-leaving')) : $();
	if ($dup.length) {
		const n = $dup[0];
		n.fsCount = (n.fsCount || 1) + 1;
		$dup.find('.fs-toast-count').prop('hidden', false).text(` ×${n.fsCount}`);
		n.fsRestart();
		return n.fsHandle;
	}

	const timeout = (o.timeout ?? (o.action ? 10 : LEVELS[level][2])) * 1000;
	let timer = null, left = timeout, started = 0, closed = false, hovering = false;

	function stop() { if (timer) { clearTimeout(timer); timer = null; left -= Date.now() - started; } }
	function start() {
		if (closed || !timeout || inline || hovering) return;
		clearTimeout(timer);
		started = Date.now();
		timer = setTimeout(close, Math.max(left, 1000));
	}
	function close() {
		if (closed) return;
		closed = true;
		clearTimeout(timer);
		const hadFocus = $t[0].contains(document.activeElement);
		$t.addClass('is-leaving').removeClass('is-shown');
		const done = () => {
			$t.remove();
			if (hadFocus && o.returnFocus && document.body.contains(o.returnFocus)) o.returnFocus.focus();
		};
		if (reducedMotion() || inline) done(); else setTimeout(done, 200);
		if (o.onClose) o.onClose();
	}
	const handle = { close, element: $t[0] };

	$t[0].fsKey = key;
	$t[0].fsHandle = handle;
	$t[0].fsRestart = () => { left = timeout; stop(); left = timeout; start(); };
	$t.on('mouseenter focusin', () => { hovering = true; stop(); })
		.on('mouseleave', () => { hovering = false; if (!$t[0].contains(document.activeElement)) start(); })
		.on('focusout', () => { setTimeout(() => { if (!$t[0].contains(document.activeElement) && !$t.is(':hover')) { hovering = false; start(); } }, 0); })
		.on('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
	$t.find('.fs-toast-close').on('click', close);
	$t.find('.fs-toast-action').on('click', () => { if (o.action.onClick) o.action.onClick(handle); close(); });

	/* Newest at the bottom; drop the oldest beyond MAX. */
	$host.append($t);
	const $all = $host.children('.fs-toast:not(.is-leaving)');
	if (!inline && $all.length > MAX) $all.slice(0, $all.length - MAX).each((i, n) => n.fsHandle.close());
	if (!inline) requestAnimationFrame(() => requestAnimationFrame(() => $t.addClass('is-shown')));
	start();
	return handle;
}

toast.ok = (m, o) => toast(m, { ...o, level: 'ok' });
toast.info = (m, o) => toast(m, { ...o, level: 'info' });
toast.warn = (m, o) => toast(m, { ...o, level: 'warn' });
toast.crit = (m, o) => toast(m, { ...o, level: 'crit' });
/** Show a normalised FS.api error ({status, message}) as a critical toast. */
toast.error = (e, o) => toast((e && e.message) || t('The request failed.'), { ...o, level: 'crit' });
/** Close every toast. */
toast.clear = () => { if (host) host.children('.fs-toast').each((i, n) => n.fsHandle && n.fsHandle.close()); };

/* Code without module access can trigger: $(document).trigger('fs:toast', [{ message, level, … }]) */
$(document).on('fs:toast.fs-toast', (e, o) => { if (o && o.message) toast(o.message, o); });

el.define('toast', {
	init(node, config) {
		const $node = $(node);
		const inline = !!config.inline;
		setupHost($node, { inline, label: config.label });
		if (!inline) {
			/* The page's own host replaces an automatically created one. */
			if (host && host[0] !== node && !host.children().length) host.remove();
			host = $node;
		}
		for (const m of config.toasts || []) toast(m.message, { ...m, host: node, timeout: inline ? 0 : m.timeout });

		if (config.demo) {
			const $demo = $('<div class="fs-toast-demo">');
			const samples = [
				['ok', t('Show success'), t('Firewall rules reloaded'), {}],
				['info', t('Show info'), t('Configuration backup created'), {}],
				['warn', t('Show warning'), t('Gateway WAN2_DHCP is down'), { title: t('Gateway alarm') }],
				['crit', t('Show error'), t('The firewall could not be reached.'), {}],
				['ok', t('With Undo'), t('Alias WEB_SERVERS deleted'), { action: { label: t('Undo'), onClick: () => toast.info(t('Alias WEB_SERVERS restored')) } }]
			];
			for (const [level, label, msg, extra] of samples) {
				$demo.append($('<button type="button" class="btn btn-sm btn-secondary">').text(label)
					.on('click', function () { toast(msg, { level, returnFocus: this, ...extra }); }));
			}
			$node.after($demo);
			return { toast, destroy() { $demo.remove(); } };
		}
		return {
			toast: (m, o) => toast(m, { ...o, host: node }),
			clear() { $node.children('.fs-toast').each((i, n) => n.fsHandle && n.fsHandle.close()); },
			destroy() { if (host && host[0] === node) host = null; }
		};
	}
});

bridge('toast', toast);
