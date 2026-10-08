/*
 * field-select.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * field-select — one value from a list. Up to 10 options render as a native
 * <select>; longer lists (or `searchable: true`) render as a searchable
 * combobox with groups and details. Options are static or loaded from an API
 * source ({source: {path, query}, value, label, group, detail}).
 * `multiple: true` hands over to the checklist type.
 * Registered as schema type `select`.
 */
import $ from 'jquery';
import { defineField, fieldType, loadOptions, staticOptions, optionLabel, icon, uid, t } from '../form/fields.js';
import { listbox } from './listbox.js';

const SEARCH_AT = 10;

/** Searchable combobox: a button that opens a popup with a search box and a listbox. */
function combobox(f, c, opts, getValue, setValue) {
	const $btn = $('<button type="button" class="form-select fs-select-btn">').attr({ id: c.id, 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': c.ariaLabel || null });
	const $val = $('<span class="fs-select-value">');
	$btn.append($val);
	const $search = $('<input type="text" class="form-control fs-select-search" autocomplete="off" spellcheck="false">')
		.attr({ placeholder: t('Search'), 'aria-label': t('Search {label}', { label: f.label || f.name }) });
	const lb = listbox({ labelledBy: c.compact ? null : c.labelId, label: c.ariaLabel, onPick: (it) => { setValue(it.value); close(true); c.change(); } });
	lb.bind($search);
	const $empty = lb.noMatches().prop('hidden', true);
	const $pop = $('<div class="fs-pop fs-select-pop">').prop('hidden', true)
		.append($('<div class="fs-select-searchbox">').append(icon('magnifying-glass'), $search), lb.$ul, $empty);
	const $box = $('<div class="fs-select fs-pop-anchor">').append($btn, $pop);
	const ns = `.${uid('sel')}`;

	function label() {
		const v = getValue();
		const o = opts.find((x) => String(x.value) === String(v));
		$val.text(o ? o.label : (v == null || v === '' ? (f.placeholder || t('Choose…')) : String(v))).toggleClass('is-placeholder', !o && (v == null || v === ''));
	}
	function filter() {
		const q = $search.val().trim().toLowerCase();
		const list = q ? opts.filter((o) => `${o.label} ${o.value} ${o.detail || ''} ${o.group || ''}`.toLowerCase().includes(q)) : opts;
		lb.render(list, { selected: getValue(), activeValue: q ? undefined : getValue() });
		$empty.prop('hidden', list.length > 0);
	}
	function open() {
		if ($btn.prop('disabled')) return;
		$pop.prop('hidden', false);
		$btn.attr('aria-expanded', 'true');
		$search.val('').attr('aria-expanded', 'true');
		filter();
		$search.trigger('focus');
		$(document).on(`mousedown${ns}`, (e) => { if (!$box[0].contains(e.target)) close(false); });
	}
	function close(focus) {
		if ($pop.prop('hidden')) return;
		$pop.prop('hidden', true);
		$btn.attr('aria-expanded', 'false');
		$search.attr({ 'aria-expanded': 'false', 'aria-activedescendant': null });
		$(document).off(ns);
		if (focus) $btn.trigger('focus');
	}
	$btn.on('click', () => ($pop.prop('hidden') ? open() : close(true)));
	$btn.on('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } });
	$search.on('input', filter);
	$search.on('keydown', (e) => {
		if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
		if (e.key === 'Tab') { close(false); return; }
		if (lb.key(e) || e.key === 'Enter') e.preventDefault();
	});
	return { $el: $box, $focus: $btn, label, destroy() { $(document).off(ns); } };
}

defineField('select', {
	build(f, c) {
		if (f.multiple) return fieldType('checklist').build(f, c);
		let opts = staticOptions(f);
		let value = null;
		const $box = $('<div class="fs-select-wrap">');
		let ui = null;

		function nativeSelect() {
			const $sel = $('<select class="form-select">').attr({ id: c.id, name: f.name, 'aria-label': c.ariaLabel || null });
			if (f.required) $sel.attr('aria-required', 'true');
			if (!f.required || value == null || value === '') $sel.append($('<option value="">').text(f.placeholder || (f.required ? t('Choose…') : t('None'))));
			let $grp = null;
			let grp;
			opts.forEach((o, i) => {
				const $o = $('<option>').val(String(i)).text(o.label).prop('disabled', !!o.disabled);
				if (o.group) {
					if (o.group !== grp) { grp = o.group; $grp = $('<optgroup>').attr('label', grp); $sel.append($grp); }
					$grp.append($o);
				} else $sel.append($o);
			});
			const sync = () => {
				const i = opts.findIndex((o) => String(o.value) === String(value));
				if (i < 0 && value != null && value !== '') $sel.append($('<option>').val('?').text(String(value)));
				$sel.val(i >= 0 ? String(i) : (value == null || value === '' ? '' : '?'));
			};
			$sel.on('change', () => {
				const v = $sel.val();
				value = v === '' ? null : v === '?' ? value : opts[+v].value;
				c.change();
			});
			return { $el: $sel, $focus: $sel, label: sync };
		}

		function render() {
			if (ui && ui.destroy) ui.destroy();
			const disabled = ui ? ui.$focus.prop('disabled') : false;
			const searchable = f.searchable === true || (f.searchable !== false && opts.length > SEARCH_AT);
			ui = searchable ? combobox(f, c, opts, () => value, (v) => { value = v; ui.label(); }) : nativeSelect();
			$box.empty().append(ui.$el);
			ui.label();
			ui.$focus.prop('disabled', disabled);
			c.rebind();
		}
		render();

		let ready = Promise.resolve();
		if (f.options && !Array.isArray(f.options) && f.options.source) {
			ui.$focus.prop('disabled', true);
			$box.addClass('is-loading');
			ready = loadOptions(f).then((list) => { opts = list; }, () => { $box.addClass('is-failed'); })
				.then(() => { $box.removeClass('is-loading'); const d = $box.data('fsDisabled'); render(); ui.$focus.prop('disabled', !!d); });
		}

		return {
			$el: $box,
			get $focus() { return ui.$focus; },
			$describe: () => ui.$focus,
			ready,
			get: () => (value === undefined ? null : value),
			set(v) { value = v ?? null; ui.label(); },
			setDisabled(b) { $box.data('fsDisabled', b); if (!$box.hasClass('is-loading')) ui.$focus.prop('disabled', b); },
			setInvalid: (b) => ui.$focus.toggleClass('is-invalid', b),
			focus: () => ui.$focus.trigger('focus'),
			validate: (v) => (f.strict !== false && opts.length && !opts.some((o) => String(o.value) === String(v)) ? t('Choose one of the listed options.') : null),
			display: (v) => optionLabel(opts, v),
			destroy() { if (ui && ui.destroy) ui.destroy(); }
		};
	}
});
