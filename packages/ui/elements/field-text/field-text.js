/*
 * field-text.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * field-text — single-line text with optional prefix/suffix, monospace and pattern.
 * Registered as schema type `text`; standalone element `field-text`.
 */
import { defineField, textInput, affix } from '../form/fields.js';

export function trimmed(v, f) { return typeof v === 'string' && f.trim !== false ? v.trim() : v; }

defineField('text', {
	build(f, c) {
		const $in = textInput(f, c, f.inputType || 'text');
		$in.on('input', c.change);
		return {
			$el: affix($in, f),
			$focus: $in,
			get: () => trimmed($in.val(), f),
			set: (v) => $in.val(v ?? ''),
			setDisabled: (b) => $in.prop('disabled', b)
		};
	}
});
