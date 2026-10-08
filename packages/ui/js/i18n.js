/*
 * i18n.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * FS.i18n — translations for strings rendered in the browser (RULES R12).
 *
 *   FS.i18n.t('Apply changes')                         → translated or the English source
 *   FS.i18n.t('{n} rules selected', { n: 3 })          → placeholders
 *   FS.i18n.t('{n} rule', { n }, '{n} rules')          → plural (n === 1 picks the first)
 *
 * The page frame embeds the catalogue for the user's language as
 * <script type="application/json" id="fs-i18n">{"lang":"de","messages":{"Apply changes":"Änderungen anwenden"}}</script>
 * (generated from the gettext catalogues on the server). English needs none.
 */
let catalogue = null;

function load() {
	if (catalogue) return catalogue;
	catalogue = { lang: document.documentElement.lang || 'en', messages: {} };
	const node = document.getElementById('fs-i18n');
	if (node) {
		try { Object.assign(catalogue, JSON.parse(node.textContent)); } catch { /* keep English */ }
	}
	return catalogue;
}

export function t(source, vars = null, plural = null) {
	const c = load();
	const n = vars && typeof vars.n === 'number' ? vars.n : null;
	const key = plural && n !== null && n !== 1 ? plural : source;
	let s = c.messages[key] ?? key;
	if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
	return s;
}

export const i18n = {
	t,
	get lang() { return load().lang; },
	/** Add messages at runtime (package plugins). */
	add(messages) { Object.assign(load().messages, messages); }
};
