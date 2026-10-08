/*
 * field-segmented.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * field-segmented — a small set (2–5) of exclusive options as one segmented
 * control. Native radios underneath, so arrow keys and forms work as usual.
 * An option may carry an icon and a tone (pass, block, reject, match, ok,
 * warn, crit) that colours it when selected — always together with its text.
 * Registered as schema type `segmented`.
 */
import $ from 'jquery';
import { defineField, staticOptions, optionLabel, icon, uid } from '../form/fields.js';

defineField('segmented', {
	group: true,
	build(f, c) {
		const opts = staticOptions(f);
		const name = uid('seg');
		const $box = $('<div class="fs-seg" role="radiogroup">').attr('aria-label', c.ariaLabel || null);
		if (f.required) $box.attr('aria-required', 'true');
		const $inputs = opts.map((o, i) => {
			const id = i === 0 ? c.id : `${name}-${i}`;
			const $r = $('<input type="radio" class="fs-seg-input visually-hidden">').attr({ id, name, value: String(i) }).prop('disabled', !!o.disabled);
			const $l = $('<label class="fs-seg-btn">').attr({ for: id, 'data-tone': o.tone || null });
			if (o.icon) $l.append(icon(o.icon));
			$l.append($('<span>').text(o.label));
			if (o.detail) $l.attr('title', o.detail);
			$box.append($r, $l);
			return $r;
		});
		$box.on('change', 'input', c.change);
		const checked = () => $inputs.findIndex(($r) => $r.prop('checked'));
		return {
			$el: $box,
			$focus: $box,
			$describe: () => $box,
			get() { const i = checked(); return i < 0 ? null : opts[i].value; },
			set(v) {
				const i = opts.findIndex((o) => String(o.value) === String(v));
				$inputs.forEach(($r, n) => $r.prop('checked', n === i));
			},
			setDisabled(b) { $box.toggleClass('is-disabled', b); $inputs.forEach(($r, n) => $r.prop('disabled', b || !!opts[n].disabled)); },
			setInvalid: (b) => $box.toggleClass('is-invalid', b),
			focus() { const i = checked(); ($inputs[i >= 0 ? i : 0] || $box).trigger('focus'); },
			display: (v) => optionLabel(opts, v)
		};
	}
});
