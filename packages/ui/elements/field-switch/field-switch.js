/*
 * field-switch.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * field-switch — boolean on/off. The label sits above like every field; the
 * optional `text` caption next to the switch says what "on" means (without
 * one, the switch shows On/Off). `values: [off, on]` maps the boolean to
 * other values (e.g. ['', 'yes']). Registered as schema type `switch`.
 */
import $ from 'jquery';
import { defineField, t } from '../form/fields.js';

defineField('switch', {
	build(f, c) {
		const $in = $('<input class="form-check-input" type="checkbox" role="switch">').attr({ id: c.id, name: f.name, 'aria-label': c.ariaLabel || null });
		const $box = $('<div class="form-check form-switch fs-switch">').append($in);
		const $state = $('<span class="fs-switch-state" aria-hidden="true">');
		if (f.text && !c.compact) $box.append($('<label class="form-check-label fs-switch-text">').attr('for', c.id).text(f.text));
		else if (!c.compact) $box.append($state);
		const [off, on] = Array.isArray(f.values) ? f.values : [false, true];
		const sync = () => $state.text($in.prop('checked') ? t('On') : t('Off'));
		$in.on('change', () => { sync(); c.change(); });
		return {
			$el: $box,
			$focus: $in,
			get: () => ($in.prop('checked') ? on : off),
			/* Without values, the API's checkbox fields ("yes", as a 1.x form posts them) count as on too. */
			set(v) { $in.prop('checked', v === on || String(v) === String(on) || (!Array.isArray(f.values) && (v === 'yes' || v === 'on'))); sync(); },
			setDisabled: (b) => $in.prop('disabled', b),
			display: (v) => (v === on ? (f.label || t('On')) : '')
		};
	}
});
