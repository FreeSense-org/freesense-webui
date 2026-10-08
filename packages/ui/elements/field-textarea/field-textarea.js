/*
 * field-textarea.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * field-textarea — multi-line text. `code: true` switches to a monospace,
 * non-wrapping editor with a line count (certificates, keys, custom options).
 * `maxLength` adds a character counter. Registered as schema type `textarea`.
 */
import $ from 'jquery';
import { defineField, t } from '../form/fields.js';

defineField('textarea', {
	build(f, c) {
		const code = !!f.code;
		const $ta = $('<textarea class="form-control">').attr({
			id: c.id, name: f.name, rows: f.rows || (code ? 6 : 3), placeholder: f.placeholder ?? null,
			maxlength: f.maxLength ?? null, spellcheck: code ? 'false' : null, wrap: code ? 'off' : null,
			'aria-label': c.ariaLabel || null, autocomplete: 'off'
		}).toggleClass('fs-mono fs-textarea-code', code);
		if (f.required) $ta.attr('aria-required', 'true');
		const $meta = $('<div class="fs-textarea-meta fs-num" aria-hidden="true">');
		const $box = $('<div class="fs-textarea">').append($ta);
		if (code || f.maxLength) $box.append($meta);
		function count() {
			const v = $ta.val();
			const bits = [];
			if (code) { const n = v ? v.replace(/\n$/, '').split('\n').length : 0; bits.push(t('{n} line', { n }, '{n} lines')); }
			if (f.maxLength) bits.push(`${v.length} / ${f.maxLength}`);
			$meta.text(bits.join(' · '));
		}
		$ta.on('input', () => { count(); c.change(); });
		return {
			$el: $box,
			$focus: $ta,
			get() { const v = $ta.val(); return code || f.trim === false ? v.replace(/\s+$/, '') : v.trim(); },
			set: (v) => { $ta.val(v ?? ''); count(); },
			setDisabled: (b) => $ta.prop('disabled', b),
			display: (v) => (v ? t('{n} line', { n: v.split('\n').length }, '{n} lines') : '')
		};
	}
});
