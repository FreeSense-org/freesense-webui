/*
 * field-number.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * field-number — number with min/max/step and a unit shown as a suffix.
 * Empty is null. Registered as schema type `number`.
 */
import { defineField, textInput, affix, t } from '../form/fields.js';

defineField('number', {
	build(f, c) {
		const integer = f.step === undefined || (f.step !== 'any' && Number.isInteger(f.step));
		const $in = textInput(f, c, 'number').addClass('fs-num').attr({
			min: f.min ?? null, max: f.max ?? null, step: f.step ?? 1,
			inputmode: integer ? 'numeric' : 'decimal'
		});
		$in.on('input', c.change);
		return {
			$el: affix($in, f),
			$focus: $in,
			get() { const v = $in.val(); return v === '' ? null : Number(v); },
			set: (v) => $in.val(v ?? ''),
			setDisabled: (b) => $in.prop('disabled', b),
			badInput: () => ($in[0].validity && $in[0].validity.badInput ? t('Enter a number.') : null),
			validate(v) {
				if (!Number.isFinite(v)) return t('Enter a number.');
				if (integer && !Number.isInteger(v)) return t('Enter a whole number.');
				return null;
			},
			display: (v) => (v == null ? '' : `${v}${f.unit ? ` ${f.unit}` : ''}`)
		};
	}
});
