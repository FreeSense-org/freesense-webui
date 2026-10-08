/*
 * field-color.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * field-color — pick an accent from the active theme's list. Those accents
 * are contrast-checked in light and dark (RULES R5), so free colours are not
 * offered. Swatches follow the current mode. `allowDefault` adds "Theme
 * default" (value null). `theme` picks another theme's list.
 * Registered as schema type `color`.
 */
import $ from 'jquery';
import { theme as fsTheme } from '../../js/theme.js';
import { defineField, uid, icon, t } from '../form/fields.js';

const metas = {};
function themeMeta(name) {
	if (!metas[name]) {
		const base = document.querySelector('meta[name="fs-themes"]')?.getAttribute('content') || '/themes';
		metas[name] = $.getJSON(`${base}/${encodeURIComponent(name)}/theme.json`).then((m) => m, () => ({ accents: {} }));
	}
	return metas[name];
}

defineField('color', {
	group: true,
	build(f, c) {
		const name = uid('acc');
		const ns = `.${name}`;
		const $box = $('<div class="fs-color" role="radiogroup">').attr('aria-label', c.ariaLabel || null);
		let accents = {};
		let value = null;
		let disabled = false;

		function render() {
			const mode = fsTheme.resolved();
			$box.empty();
			const opts = [...(f.allowDefault ? [[null, { title: t('Theme default') }]] : []), ...Object.entries(accents)];
			opts.forEach(([id, a], i) => {
				const rid = i === 0 ? c.id : `${name}-${i}`;
				const $r = $('<input type="radio" class="fs-seg-input visually-hidden">').attr({ id: rid, name, value: id ?? '' }).prop({ checked: (id ?? null) === (value ?? null), disabled });
				const $sw = $('<span class="fs-color-swatch" aria-hidden="true">').append(icon('check'));
				if (id) $sw[0].style.setProperty('--fs-sw', a[mode] || a.light);
				else $sw.addClass('is-default');
				$box.append($r, $('<label class="fs-color-opt">').attr('for', rid).append($sw, $('<span class="fs-color-name">').text(t(a.title || id))));
			});
			if (!opts.length) $box.append($('<span class="fs-color-empty">').text(t('This theme offers no accents.')));
		}
		$box.on('change', 'input', function () { value = this.value || null; c.change(); });
		$(document).on(`fs:theme${ns}`, render);
		const ready = themeMeta(f.theme || fsTheme.get().theme).then((m) => { accents = m.accents || {}; render(); });
		render();
		return {
			$el: $box,
			$focus: $box,
			$describe: () => $box,
			ready,
			get: () => value,
			set(v) { value = v || null; $box.find('input').each((i, n) => { n.checked = (n.value || null) === value; }); },
			setDisabled(b) { disabled = b; $box.toggleClass('is-disabled', b).find('input').prop('disabled', b); },
			setInvalid: (b) => $box.toggleClass('is-invalid', b),
			focus() { ($box.find('input:checked')[0] || $box.find('input')[0] || $box[0]).focus(); },
			validate: (v) => (Object.keys(accents).length && !accents[v] ? t('Choose one of the theme accents.') : null),
			display: (v) => (v && accents[v] ? accents[v].title : t('Theme default')),
			destroy() { $(document).off(ns); }
		};
	}
});
