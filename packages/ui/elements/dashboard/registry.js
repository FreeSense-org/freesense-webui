/*
 * registry.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * FS.widgets — the widget registry shared by the dashboard, the widget
 * catalogue and package plugins (contract: widgets.md in this folder).
 *
 *   FS.widgets.define('gateways', { title, icon, category, description, sizes, size,
 *     every, settings: [...], mount(ctx), load(ctx) -> Promise, destroy(ctx) });
 *   FS.widgets.get(type)    FS.widgets.list()    FS.widgets.categories()
 *
 * Temporary bridge: attached as window.FS.widgets (like FS.toast) until the
 * runtime exposes it itself. Defining a type later (a package plugin loading
 * after the dashboard) triggers `fs:widget-defined` on the document, and a
 * dashboard that already holds such a widget mounts it then.
 */
import $ from 'jquery';
import { t } from '../../js/i18n.js';
import { bridge } from '../toast/toast.js';

/* Size keyword → columns of the 12-column grid. */
export const SIZES = { sm: 3, md: 4, lg: 6, xl: 8, full: 12 };
export const SIZE_ORDER = ['sm', 'md', 'lg', 'xl', 'full'];
export const SIZE_LABELS = { sm: 'Small', md: 'Medium', lg: 'Large', xl: 'Wide', full: 'Full width' };
export const SIZE_SHORT = { sm: 'S', md: 'M', lg: 'L', xl: 'XL', full: 'Full' };
/* Refresh choices in seconds (0 = off: load once, refresh by hand). */
export const INTERVALS = [0, 2, 5, 10, 30, 60];
/* Catalogue order of the core categories; package categories follow alphabetically. */
export const CATEGORY_ORDER = ['System', 'Network', 'Security', 'VPN', 'Services', 'Shortcuts', 'Custom'];

const TYPE_RE = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const defs = new Map();

function normalise(type, d) {
	const sizes = (Array.isArray(d.sizes) && d.sizes.length ? d.sizes : ['md']).filter((s) => SIZES[s]);
	const size = SIZES[d.size] && sizes.includes(d.size) ? d.size : sizes[0] || 'md';
	return {
		icon: 'square',
		category: 'Custom',
		description: '',
		every: 5,
		settings: [],
		multiple: true,
		isNew: false,
		hidden: false,
		lines: 3,
		restartOnEvery: false,
		...d,
		type,
		title: d.title || type,
		sizes: sizes.length ? sizes : ['md'],
		size
	};
}

export const widgets = {
	/** Register a widget type. Returns the normalised definition, or null when invalid. */
	define(type, def) {
		if (!TYPE_RE.test(String(type || ''))) { console.error(`fs-widgets: invalid widget type "${type}"`); return null; }
		if (defs.has(type)) { console.error(`fs-widgets: widget type "${type}" is already defined`); return null; }
		if (!def || (typeof def.load !== 'function' && typeof def.mount !== 'function')) {
			console.error(`fs-widgets: widget type "${type}" needs mount() and/or load()`);
			return null;
		}
		const d = normalise(type, def);
		defs.set(type, d);
		$(document).trigger('fs:widget-defined', [type]);
		return d;
	},
	get: (type) => defs.get(type) || null,
	has: (type) => defs.has(type),
	/** Every registered type (hidden ones included with {all: true}), in catalogue order. */
	list({ all = false } = {}) {
		const order = (c) => { const i = CATEGORY_ORDER.indexOf(c); return i < 0 ? CATEGORY_ORDER.length : i; };
		return [...defs.values()].filter((d) => all || !d.hidden)
			.sort((a, b) => order(a.category) - order(b.category) || a.category.localeCompare(b.category) || t(a.title).localeCompare(t(b.title)));
	},
	/** Category names in catalogue order. */
	categories() { return [...new Set(widgets.list().map((d) => d.category))]; },
	sizes: SIZES,
	intervals: INTERVALS
};

bridge('widgets', widgets);
