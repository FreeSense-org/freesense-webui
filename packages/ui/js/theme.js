/*
 * theme.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * FS.theme — apply the user's appearance live, without a reload.
 *
 * <html> carries data-fs-theme, data-fs-mode (light|dark|auto), data-bs-theme
 * (the resolved mode), data-fs-accent and data-fs-density. The server renders
 * them from the user's preferences, so the first paint is already correct.
 * In 'auto' the mode follows prefers-color-scheme and changes live.
 * set() loads the theme stylesheet on demand when the theme changes.
 */
import $ from 'jquery';

const root = document.documentElement;
const media = window.matchMedia('(prefers-color-scheme: dark)');

function resolve(mode) { return mode === 'auto' ? (media.matches ? 'dark' : 'light') : mode; }

function ensureStylesheet(name) {
	const id = `fs-theme-${name}`;
	if (document.getElementById(id)) return Promise.resolve();
	const base = document.querySelector('meta[name="fs-themes"]')?.getAttribute('content') || '/themes';
	return new Promise((resolve, reject) => {
		const link = Object.assign(document.createElement('link'), { id, rel: 'stylesheet', href: `${base}/${encodeURIComponent(name)}/theme.css` });
		link.onload = resolve;
		link.onerror = () => reject(new Error(`Theme "${name}" could not be loaded`));
		document.head.appendChild(link);
	});
}

/* Skin choices come from the theme's theme.json (fixed enums, no CSS). */
const skins = {};
function loadSkin(name) {
	if (skins[name]) return Promise.resolve(skins[name]);
	const base = document.querySelector('meta[name="fs-themes"]')?.getAttribute('content') || '/themes';
	return $.getJSON(`${base}/${encodeURIComponent(name)}/theme.json`).then((meta) => (skins[name] = meta.skin || {}), () => ({}));
}
function applySkin(skin) {
	root.setAttribute('data-fs-skin-topbar', skin.topbar || 'surface');
	root.setAttribute('data-fs-skin-section', skin.sectionMenu || 'surface');
	root.setAttribute('data-fs-skin-cards', skin.cards || 'outlined');
	root.setAttribute('data-fs-skin-tables', skin.tables || 'lines');
	root.setAttribute('data-fs-skin-buttons', skin.buttons || 'rounded');
}

function apply(p) {
	root.setAttribute('data-fs-theme', p.theme);
	root.setAttribute('data-fs-mode', p.mode);
	root.setAttribute('data-bs-theme', resolve(p.mode));
	root.setAttribute('data-fs-accent', p.accent);
	root.setAttribute('data-fs-density', p.density);
	$(document).trigger('fs:theme', [{ ...p, resolved: resolve(p.mode) }]);
}

export const theme = {
	get() {
		return {
			theme: root.getAttribute('data-fs-theme') || 'freesense',
			mode: root.getAttribute('data-fs-mode') || 'auto',
			accent: root.getAttribute('data-fs-accent') || 'coral',
			density: root.getAttribute('data-fs-density') || 'comfortable'
		};
	},
	/** Change any of theme/mode/accent/density. Returns a promise once applied. */
	async set(changes) {
		const next = { ...theme.get(), ...changes };
		if (next.theme !== theme.get().theme) {
			await ensureStylesheet(next.theme);
			applySkin(await loadSkin(next.theme));
		}
		apply(next);
		return next;
	},
	resolved() { return resolve(theme.get().mode); }
};

media.addEventListener('change', () => { if (theme.get().mode === 'auto') apply(theme.get()); });
