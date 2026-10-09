/*
 * identity.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Helpers shared by the identity and shell-tool elements (avatar,
 * profile-menu, notifications, command-palette, theme-picker, profile-card,
 * session-list). Not an element itself.
 *
 *   t(text, vars)           translate through FS.i18n when present ({name} placeholders)
 *   icon(name)              Font Awesome Solid <i>, aria-hidden
 *   notify(level, message)  'fs:toast' event; a small fallback bubble while no toast element exists
 *   me.get() / me.set(d)    the signed-in user (GET /v1/me/profile + /v1/me/preferences, shared by every element; 'fs:me' on change)
 *   prefs.save(changes)     apply live through FS.theme.set and PUT /v1/me/preferences, with rollback
 *   themes.list() / meta()  installed themes (/ui/manifest.json) and their theme.json
 *   popover(...)            dropdown panel behaviour: outside click, Escape, focus return
 */
import $ from 'jquery';
import { api } from '../../js/api.js';
import { batch } from '../../js/batch.js';
import { el } from '../../js/el.js';
import { theme } from '../../js/theme.js';

/* ------------------------------------------------------------------ text */

export function t(text, vars) {
	const i18n = window.FS && window.FS.i18n;
	let s = i18n && typeof i18n.t === 'function' ? i18n.t(text) : text;
	if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
	return s;
}

/**
 * Config paths are written as '/v1/…' (docs/ELEMENT-GUIDE.md), but FS.api
 * prefixes its base '/api/v1' to every path that does not start with '/api/'.
 * Until the runtime handles '/v1/…' itself, map it to '/api/v1/…' here.
 */
export function apiPath(p) {
	p = String(p || '');
	return p.startsWith('/v1/') ? `/api${p}` : p;
}

export function icon(name, cls = '') {
	return $('<i aria-hidden="true">').addClass(`fa-solid fa-${name}${cls ? ` ${cls}` : ''}`);
}

export const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* --------------------------------------------------------------- notify */

let $bubbles = null;
/** Transient message. A future toast element listens to 'fs:toast'; until then a minimal bubble shows. */
export function notify(level, message) {
	$(document).trigger('fs:toast', [{ level, message }]);
	if (el.has('toast')) return;
	if (!$bubbles) $bubbles = $('<div class="fs-id-bubbles" role="status" aria-live="polite">').appendTo(document.body);
	const ic = { ok: 'circle-check', error: 'circle-xmark', warn: 'triangle-exclamation' }[level] || 'circle-info';
	const $b = $('<div class="fs-id-bubble">').attr('data-level', level).append(icon(ic), $('<span>').text(message));
	$bubbles.append($b);
	setTimeout(() => $b.addClass('is-leaving'), 3600);
	setTimeout(() => $b.remove(), reduced() ? 3700 : 3900);
}

/* ------------------------------------------------------------------- me */

let mePromise = null;
let meData = null;
export const me = {
	/**
	 * The signed-in user, loaded once and shared: the profile
	 * ({username, name, email, initials, local, groups, admin, signed_in})
	 * with the start page and appearance from the preferences, and a role.
	 */
	get(force = false) {
		if (!mePromise || force) {
			mePromise = Promise.all([
				batch.get(apiPath('/v1/me/profile')),
				batch.get(apiPath('/v1/me/preferences')).catch(() => ({ data: {} }))
			]).then(([p, pr]) => (meData = meOf(p.data || {}, pr.data || {})), (e) => { mePromise = null; throw e; });
		}
		return mePromise;
	},
	current: () => meData,
	/** After a profile save: update every element showing the user. */
	set(data) {
		meData = { ...(meData || {}), ...data };
		mePromise = Promise.resolve(meData);
		$(document).trigger('fs:me', [meData]);
	}
};

export function meOf(profile, preferences) {
	return { ...profile, start_page: preferences.start_page || '/', preferences, role: profile.admin ? t('Administrator') : (profile.role || '') };
}

export function initials(name, fallback = '?') {
	const words = String(name || '').trim().split(/\s+/).filter(Boolean);
	if (!words.length) return fallback;
	const s = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0];
	return s.toUpperCase();
}

/* ---------------------------------------------------------- preferences */

let saveSeq = 0;
export const prefs = {
	/**
	 * Apply appearance changes live, then persist. On a failed save the
	 * previous appearance comes back and a message explains why.
	 */
	async save(changes) {
		const before = theme.get();
		const next = await theme.set(changes);
		const seq = ++saveSeq;
		try {
			await api.put(apiPath('/v1/me/preferences'), next);
			return next;
		} catch (e) {
			if (seq === saveSeq) await theme.set(before);
			notify('error', t('Your appearance could not be saved: {msg}', { msg: e.message }));
			throw e;
		}
	}
};

/* --------------------------------------------------------------- themes */

const metaCache = {};
const themesBase = () => document.querySelector('meta[name="fs-themes"]')?.getAttribute('content') || '/themes';

export const themes = {
	/** Names of the installed themes, from the engine manifest. */
	list(manifest = '/ui/manifest.json') {
		return Promise.resolve($.getJSON(manifest)).then((m) => (m.themes && m.themes.length ? m.themes : [theme.get().theme]), () => [theme.get().theme]);
	},
	/** A theme's public theme.json (accents, skin, preview colours). */
	meta(name) {
		if (!metaCache[name]) {
			metaCache[name] = Promise.resolve($.getJSON(`${themesBase()}/${encodeURIComponent(name)}/theme.json`))
				.catch((e) => { delete metaCache[name]; throw new Error(t('Theme "{name}" has no readable theme.json', { name })); });
		}
		return metaCache[name];
	}
};

/** Is a theme written for a scheme this engine accepts? Same major, minor not newer. */
export function schemeOk(scheme) {
	const [ma, mi] = String((window.FS && window.FS.themeScheme) || '2.0').split('.').map(Number);
	const [ta, ti] = String(scheme || '').split('.').map(Number);
	return ta === ma && ti <= mi;
}

/* -------------------------------------------------------------- popover */

let popSeq = 0;
/**
 * Dropdown behaviour for a trigger button and a panel inside $wrap.
 * Returns {open, close, toggle, isOpen, destroy}.
 */
export function popover($wrap, $btn, $panel, { onOpen, onClose, focus } = {}) {
	const ns = `.fspop${++popSeq}`;
	const id = `fs-pop-${popSeq}`;
	let isOpen = false;
	let timer = null;
	$panel.attr({ id, hidden: '' });
	$btn.attr({ 'aria-expanded': 'false', 'aria-controls': id });

	function open() {
		if (isOpen) return;
		isOpen = true;
		clearTimeout(timer);
		$(document).trigger('fs:popover', [id]);
		$panel.prop('hidden', false);
		$btn.attr('aria-expanded', 'true');
		$wrap.addClass('is-open');
		requestAnimationFrame(() => $panel.addClass('is-open'));
		if (onOpen) onOpen();
		const target = focus ? focus() : $panel.find('button, a[href], input').filter(':visible').first();
		if (target && target.length) target.trigger('focus');
	}
	function close({ restore = false } = {}) {
		if (!isOpen) return;
		isOpen = false;
		$btn.attr('aria-expanded', 'false');
		$wrap.removeClass('is-open');
		$panel.removeClass('is-open');
		timer = setTimeout(() => { if (!isOpen) $panel.prop('hidden', true); }, reduced() ? 0 : 160);
		if (restore) $btn.trigger('focus');
		if (onClose) onClose();
	}
	$btn.on(`click${ns}`, () => (isOpen ? close() : open()));
	$panel.on(`keydown${ns}`, (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close({ restore: true }); } });
	$btn.on(`keydown${ns}`, (e) => {
		if (e.key === 'Escape' && isOpen) { e.preventDefault(); close(); }
		if (e.key === 'ArrowDown' && !isOpen) { e.preventDefault(); open(); }
	});
	$(document).on(`pointerdown${ns} focusin${ns}`, (e) => { if (isOpen && !$wrap[0].contains(e.target)) close(); });
	$(document).on(`fs:popover${ns}`, (e, other) => { if (other !== id) close(); });
	$(document).on(`fs:navigated${ns}`, () => close());
	return {
		open, close,
		toggle() { if (isOpen) close(); else open(); },
		isOpen: () => isOpen,
		destroy() { $btn.off(ns); $panel.off(ns); $(document).off(ns); clearTimeout(timer); }
	};
}

/** Keyboard roving for a radio group of buttons (arrows move and select). */
export function radioKeys($group, select) {
	$group.on('keydown', '[role="radio"]', function (e) {
		const $items = $group.find('[role="radio"]:not([disabled])');
		const i = $items.index(this);
		let n = -1;
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % $items.length;
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + $items.length) % $items.length;
		else if (e.key === 'Home') n = 0;
		else if (e.key === 'End') n = $items.length - 1;
		if (n < 0) return;
		e.preventDefault();
		$items.eq(n).trigger('focus');
		select($items.eq(n));
	});
}

/** Mark the checked radio in a group and keep only it in the tab order. */
export function radioCheck($group, value, attr = 'data-value') {
	let any = false;
	$group.find('[role="radio"]').each(function () {
		const on = this.getAttribute(attr) === String(value);
		any = any || on;
		$(this).attr({ 'aria-checked': String(on), tabindex: on ? '0' : '-1' });
	});
	if (!any) $group.find('[role="radio"]').first().attr('tabindex', '0');
}

/* ------------------------------------------------------- page sections */

/** After partial navigation to a URL with a #hash, bring that section into view. */
export function followHash() {
	$(document).one('fs:navigated', () => {
		if (!location.hash) return;
		const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
		if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }));
	});
}
