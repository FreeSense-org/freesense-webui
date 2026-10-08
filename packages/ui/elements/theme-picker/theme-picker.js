/*
 * theme-picker.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * theme-picker — Profile › Appearance. A card per installed theme with a
 * live mini-preview in light and dark, then mode, accent and density.
 * Every choice applies at once (FS.theme.set) and is saved to the user's
 * preferences (PUT /v1/me/preferences). See spec.md.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { states } from '../../js/states.js';
import { theme } from '../../js/theme.js';
import { t, icon, prefs, themes, schemeOk, radioKeys, radioCheck } from '../avatar/identity.js';

const MODES = [['light', 'sun', 'Light', 'Always light'], ['dark', 'moon', 'Dark', 'Always dark'], ['auto', 'circle-half-stroke', 'Auto', 'Follows your device']];
const DENSITIES = [['comfortable', 'Comfortable', 'More space around rows and controls'], ['compact', 'Compact', 'More rows on screen']];

el.define('theme-picker', {
	init(node, config, ctx) {
		const c = { manifest: '/ui/manifest.json', title: 'Appearance', description: 'Changes apply right away and follow you to every device you sign in from.', ...config };
		const $node = $(node).addClass('fs-theme-picker').empty();
		const $saved = $('<span class="fs-theme-picker-saved" role="status" aria-live="polite">');
		const $head = $('<div class="fs-theme-picker-head">').append(
			$('<div>').append($('<h2 class="fs-theme-picker-title">').text(t(c.title)),
				c.description ? $('<p class="fs-theme-picker-desc">').text(t(c.description)) : null),
			$saved);
		const $body = $('<div class="fs-theme-picker-body">');
		$node.append($head, $body);

		let metas = [];
		let savedTimer = null;

		function save(changes) {
			$saved.removeClass('is-shown').text('');
			return prefs.save(changes).then(() => {
				clearTimeout(savedTimer);
				$saved.empty().append(icon('check'), $('<span>').text(t('Saved'))).addClass('is-shown');
				savedTimer = setTimeout(() => $saved.removeClass('is-shown'), 2400);
			}, () => {});
		}

		function section(title, id, $content, note) {
			const hid = `${id}-h`;
			const $s = $('<section class="fs-theme-picker-section">').attr('aria-labelledby', hid).append(
				$('<h3 class="fs-theme-picker-label">').attr('id', hid).text(t(title)));
			if (note) $s.append($('<p class="fs-theme-picker-note">').text(note));
			return $s.append($content);
		}

		function preview(meta, mode) {
			const cur = theme.get();
			const accents = meta.accents || {};
			const acc = accents[cur.accent] || accents[meta.defaultAccent] || Object.values(accents)[0] || {};
			const $half = $('<span class="fs-theme-picker-half" aria-hidden="true">').attr('data-mode', mode);
			if (meta.preview && meta.preview[mode]) $half[0].style.setProperty('--fs-tp-bg', meta.preview[mode]);
			if (acc[mode]) $half[0].style.setProperty('--fs-tp-ac', acc[mode]);
			$half.append(
				$('<span class="fs-theme-picker-bar">').append($('<span class="fs-theme-picker-dot">'), $('<span class="fs-theme-picker-line is-short">')),
				$('<span class="fs-theme-picker-card">').append(
					$('<span class="fs-theme-picker-line">'), $('<span class="fs-theme-picker-line is-mid">'),
					$('<span class="fs-theme-picker-pill">')));
			return $half;
		}

		function themeCard(meta) {
			const ok = !meta.error && schemeOk(meta.scheme);
			const $card = $('<button type="button" role="radio" class="fs-theme-picker-theme">').attr('data-value', meta.name);
			const $info = $('<span class="fs-theme-picker-info">').append(
				$('<span class="fs-theme-picker-name">').append($('<span>').text(meta.title || meta.name), $('<span class="fs-theme-picker-check">').append(icon('circle-check'), $('<span class="visually-hidden">').text(t('In use')))));
			if (meta.error) {
				$info.append($('<span class="fs-theme-picker-about">').text(meta.error));
			} else {
				if (meta.description) $info.append($('<span class="fs-theme-picker-about">').text(meta.description));
				const bits = [t('Scheme {s}', { s: meta.scheme }), `v${meta.version}`];
				if (meta.author) bits.push(meta.author);
				$info.append($('<span class="fs-theme-picker-meta">').text(bits.join(' · ')));
				if (!ok) $info.append($('<span class="fs-theme-picker-warn">').append(icon('triangle-exclamation'), $('<span>').text(t('Needs theme scheme {s}; this system supports {cur}', { s: meta.scheme, cur: (window.FS && window.FS.themeScheme) || '2.0' }))));
			}
			$card.append($('<span class="fs-theme-picker-preview">').append(meta.error ? null : preview(meta, 'light'), meta.error ? null : preview(meta, 'dark')), $info);
			if (!ok) $card.attr({ disabled: '', 'aria-disabled': 'true' });
			$card.attr('aria-label', `${meta.title || meta.name}${ok ? '' : ` (${t('unavailable')})`}`);
			return $card;
		}

		let $themes, $modes, $accents, $density;

		function renderAccents() {
			const cur = theme.get();
			const meta = metas.find((m) => m.name === cur.theme) || {};
			const resolved = theme.resolved();
			$accents.empty();
			for (const [id, a] of Object.entries(meta.accents || {})) {
				const $sw = $('<span class="fs-id-swatch" aria-hidden="true">').append(icon('check'));
				$sw[0].style.setProperty('--fs-sw', resolved === 'dark' ? a.dark : a.light);
				$accents.append($('<button type="button" role="radio" class="fs-theme-picker-accent">').attr('data-value', id)
					.append($sw, $('<span>').text(t(a.title || id))));
			}
			radioCheck($accents, cur.accent);
		}

		function sync() {
			if (!$themes) return;
			const cur = theme.get();
			radioCheck($themes, cur.theme);
			$themes.find('.fs-theme-picker-theme').each(function () {
				const meta = metas.find((m) => m.name === this.getAttribute('data-value'));
				if (!meta || meta.error) return;
				const accents = meta.accents || {};
				const acc = accents[cur.accent] || accents[meta.defaultAccent] || {};
				$(this).find('.fs-theme-picker-half').each(function () {
					const m = this.getAttribute('data-mode');
					if (acc[m]) this.style.setProperty('--fs-tp-ac', acc[m]);
				});
			});
			radioCheck($modes, cur.mode);
			radioCheck($density, cur.density);
			renderAccents();
		}

		function render(list) {
			metas = list;
			$themes = $('<div class="fs-theme-picker-themes" role="radiogroup">').attr('aria-label', t('Theme'));
			list.forEach((m) => $themes.append(themeCard(m)));
			$modes = $('<div class="fs-theme-picker-options" role="radiogroup">').attr('aria-label', t('Mode'));
			for (const [v, ic, label, hint] of MODES) {
				$modes.append($('<button type="button" role="radio" class="fs-theme-picker-option">').attr('data-value', v).append(
					$('<span class="fs-theme-picker-option-icon">').append(icon(ic)),
					$('<span class="fs-theme-picker-option-text">').append($('<strong>').text(t(label)), $('<span>').text(t(hint)))));
			}
			$accents = $('<div class="fs-theme-picker-accents" role="radiogroup">').attr('aria-label', t('Accent'));
			$density = $('<div class="fs-theme-picker-options" role="radiogroup">').attr('aria-label', t('Density'));
			for (const [v, label, hint] of DENSITIES) {
				$density.append($('<button type="button" role="radio" class="fs-theme-picker-option">').attr('data-value', v).append(
					$('<span class="fs-theme-picker-option-icon">').append(icon(v === 'compact' ? 'bars' : 'grip-lines')),
					$('<span class="fs-theme-picker-option-text">').append($('<strong>').text(t(label)), $('<span>').text(t(hint)))));
			}
			$body.empty().append(
				section('Theme', `${node.id || 'fs-tp'}-theme`, $themes, list.length < 2 ? t('More themes appear here when they are installed.') : null),
				section('Mode', `${node.id || 'fs-tp'}-mode`, $modes),
				section('Accent', `${node.id || 'fs-tp'}-accent`, $accents),
				section('Density', `${node.id || 'fs-tp'}-density`, $density));

			const pickTheme = ($b) => {
				const name = $b.attr('data-value');
				const meta = metas.find((m) => m.name === name);
				if (!meta || meta.error || name === theme.get().theme) return;
				const accent = meta.accents && meta.accents[theme.get().accent] ? theme.get().accent : meta.defaultAccent;
				save({ theme: name, accent });
			};
			$themes.on('click', '[role="radio"]', function () { pickTheme($(this)); });
			radioKeys($themes, pickTheme);
			$modes.on('click', '[role="radio"]', function () { save({ mode: this.getAttribute('data-value') }); });
			radioKeys($modes, ($b) => save({ mode: $b.attr('data-value') }));
			$accents.on('click', '[role="radio"]', function () { save({ accent: this.getAttribute('data-value') }); });
			radioKeys($accents, ($b) => save({ accent: $b.attr('data-value') }));
			$density.on('click', '[role="radio"]', function () { save({ density: this.getAttribute('data-value') }); });
			radioKeys($density, ($b) => save({ density: $b.attr('data-value') }));
			sync();
			return list.length > 0;
		}

		/* uniqueness for the section ids */
		if (!node.id) node.id = `fs-tp-${Math.random().toString(36).slice(2, 8)}`;

		const fetchAll = () => themes.list(c.manifest).then((names) => Promise.all(names.map((n) =>
			themes.meta(n).then((m) => ({ ...m, name: m.name || n }), (e) => ({ name: n, title: n, error: e.message })))));
		states.load(ctx, $body, fetchAll, render, { every: 0, lines: 6, $root: $node, empty: { icon: 'palette', title: t('No themes installed') } });

		const ns = `.fstp${node.id}`;
		$(document).on(`fs:theme${ns}`, () => sync());
		return {
			destroy() { $(document).off(ns); clearTimeout(savedTimer); }
		};
	}
});
