/*
 * profile-menu.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * profile-menu — the top-bar avatar button and its dropdown: who is signed
 * in, a quick Light/Dark/Auto switch, the current theme's accents, links to
 * Profile / Appearance / Sessions and Sign out. Appearance changes apply live
 * (FS.theme.set) and persist (PUT /v1/me/preferences). See spec.md.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { api } from '../../js/api.js';
import { theme } from '../../js/theme.js';
import { avatarNode } from '../avatar/avatar.js';
import { t, icon, me, prefs, themes, popover, radioKeys, radioCheck, notify, followHash, apiPath } from '../avatar/identity.js';

const MODES = [['light', 'sun', 'Light'], ['dark', 'moon', 'Dark'], ['auto', 'circle-half-stroke', 'Auto']];

/** Sign out: POST to the sign-out path, then go to the sign-in page. In the gallery (signOut.demo) it only reports. */
export function signOut(cfg = {}) {
	if (cfg.demo !== false && !cfg.path) {
		console.info('profile-menu: sign out requested (gallery: nothing happens)');
		notify('info', t('Signed out (gallery demo: nothing happened).'));
		return Promise.resolve();
	}
	return api.post(apiPath(cfg.path)).then(() => { location.href = cfg.redirect || '/'; },
		(e) => notify('error', t('Could not sign out: {msg}', { msg: e.message })));
}

el.define('profile-menu', {
	init(node, config) {
		const c = {
			links: {
				profile: '/me',
				appearance: '/me#appearance',
				sessions: '/me#sessions'
			},
			signOut: {},
			modeToggle: false,
			...config
		};
		c.links = { profile: '/me', appearance: '/me#appearance', sessions: '/me#sessions', ...(config.links || {}) };
		const $node = $(node).addClass('fs-profile-menu').empty();
		let user = me.current() || c.user || null;

		/* ------------------------------------------------- quick mode toggle */
		let $toggle = null;
		if (c.modeToggle) {
			$toggle = $('<button type="button" class="fs-idbtn fs-profile-menu-toggle">')
				.attr({ 'aria-label': t('Toggle light and dark'), title: t('Toggle light and dark') })
				.append(icon('circle-half-stroke'))
				.on('click', () => prefs.save({ mode: theme.resolved() === 'dark' ? 'light' : 'dark' }).catch(() => {}));
			$node.append($toggle);
		}

		/* ----------------------------------------------------------- trigger */
		const $btn = $('<button type="button" class="fs-profile-menu-btn" aria-haspopup="dialog">');
		const $panel = $('<div class="fs-profile-menu-panel fs-id-panel" role="dialog">').attr('aria-label', t('Account'));
		$node.append($btn, $panel);

		/* ------------------------------------------------------------- panel */
		const $head = $('<div class="fs-profile-menu-head">');
		const $modes = $('<div class="fs-id-seg" role="radiogroup">').attr('aria-label', t('Colour mode'));
		for (const [v, ic, label] of MODES) {
			$modes.append($('<button type="button" role="radio" class="fs-id-seg-btn">').attr('data-value', v).append(icon(ic), $('<span>').text(t(label))));
		}
		const $accents = $('<div class="fs-id-swatches" role="radiogroup">').attr('aria-label', t('Accent colour'));
		const $appearance = $('<div class="fs-profile-menu-section">').append(
			$('<div class="fs-profile-menu-label" aria-hidden="true">').text(t('Appearance')), $modes,
			$('<div class="fs-profile-menu-label" aria-hidden="true">').text(t('Accent')), $accents);

		const link = (href, ic, label) => {
			const $a = $('<a class="fs-profile-menu-link">').attr('href', href).append(icon(ic), $('<span>').text(t(label)));
			if (href.charAt(0) === '/') $a.attr('data-fs-nav', '');
			if (href.includes('#')) $a.on('click', () => followHash());
			return $a;
		};
		const $links = $('<nav class="fs-profile-menu-links">').attr('aria-label', t('Account')).append(
			link(c.links.profile, 'circle-user', 'Profile'),
			link(c.links.appearance, 'palette', 'Appearance'),
			link(c.links.sessions, 'laptop', 'Sessions'));
		const $out = $('<button type="button" class="fs-profile-menu-link fs-profile-menu-signout">').append(icon('right-from-bracket'), $('<span>').text(t('Sign out')))
			.on('click', () => { pop.close(); signOut(c.signOut); });
		$panel.append($head, $appearance, $links, $('<div class="fs-profile-menu-foot">').append($out));

		/* ------------------------------------------------------------ render */
		function renderUser() {
			const u = user || {};
			const name = u.name || u.username || t('Signed in');
			$btn.empty().append(avatarNode({ name: u.name, username: u.username, initials: u.initials, src: u.avatar, size: 'sm', label: false }))
				.attr({ 'aria-label': t('Account menu: {name}', { name }), title: name });
			const $who = $('<div class="fs-profile-menu-who">').append($('<strong class="fs-profile-menu-name">').text(name));
			if (u.email) $who.append($('<span class="fs-profile-menu-email">').text(u.email));
			if (u.role || u.username) {
				const $meta = $('<span class="fs-profile-menu-meta">');
				if (u.role) $meta.append($('<span class="fs-profile-menu-role">').text(u.role));
				if (u.username) $meta.append($('<span>').text(`@${u.username}`));
				$who.append($meta);
			}
			$head.empty().append(avatarNode({ name: u.name, username: u.username, initials: u.initials, src: u.avatar, size: 'md', label: false }), $who);
		}

		let accentTheme = null;
		function renderAccents(force = false) {
			const cur = theme.get();
			const resolved = theme.resolved();
			if (!force && accentTheme === cur.theme) {
				$accents.find('.fs-id-swatch').each(function () { this.style.setProperty('--fs-sw', this.getAttribute(`data-${resolved}`)); });
				radioCheck($accents, cur.accent);
				return;
			}
			accentTheme = cur.theme;
			themes.meta(cur.theme).then((meta) => {
				$accents.empty();
				for (const [id, a] of Object.entries(meta.accents || {})) {
					const $s = $('<button type="button" role="radio" class="fs-id-swatch">')
						.attr({ 'data-value': id, 'data-light': a.light, 'data-dark': a.dark, 'aria-label': t(a.title || id), title: t(a.title || id) })
						.append(icon('check'));
					$s[0].style.setProperty('--fs-sw', resolved === 'dark' ? a.dark : a.light);
					$accents.append($s);
				}
				radioCheck($accents, theme.get().accent);
			}, () => { accentTheme = null; $accents.empty().append($('<span class="fs-profile-menu-note">').text(t('Accents unavailable'))); });
		}

		function syncAppearance() {
			radioCheck($modes, theme.get().mode);
			renderAccents();
		}

		$modes.on('click', '[role="radio"]', function () { prefs.save({ mode: this.getAttribute('data-value') }).catch(() => {}); });
		radioKeys($modes, ($b) => prefs.save({ mode: $b.attr('data-value') }).catch(() => {}));
		$accents.on('click', '[role="radio"]', function () { prefs.save({ accent: this.getAttribute('data-value') }).catch(() => {}); });
		radioKeys($accents, ($b) => prefs.save({ accent: $b.attr('data-value') }).catch(() => {}));

		const pop = popover($node, $btn, $panel, {
			onOpen: () => { syncAppearance(); if (!user) load(); },
			focus: () => $modes.find('[aria-checked="true"]')
		});
		$links.on('click', 'a', () => pop.close());

		function load() {
			return me.get().then((u) => { user = u; renderUser(); }, () => { /* keep the placeholder; the API reports 401 itself */ });
		}

		const ns = `.fsprofilemenu${Math.random().toString(36).slice(2, 7)}`;
		$(document).on(`fs:theme${ns}`, () => syncAppearance());
		$(document).on(`fs:me${ns}`, (e, u) => { user = u; renderUser(); });

		renderUser();
		syncAppearance();
		if (!c.user) load();

		return {
			open: () => pop.open(),
			close: () => pop.close(),
			destroy() { pop.destroy(); $(document).off(ns); }
		};
	}
});
