/*
 * field-datetime.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * field-datetime — a date, a time or both, with the browser's native pickers.
 *   mode: 'datetime' (default) | 'date' | 'time'
 *   range: true   two inputs (from → to); value {from, to}, to must be after from
 *   days: true    with a range: weekday toggles for schedules; value {days, from, to}
 * Values are ISO-style local strings ("2026-10-08T14:30", "2026-10-08", "08:00").
 * Registered as schema type `datetime`.
 */
import $ from 'jquery';
import { defineField, uid, t } from '../form/fields.js';

const TYPES = { datetime: 'datetime-local', date: 'date', time: 'time' };
const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];

defineField('datetime', {
	build(f, c) {
		const mode = TYPES[f.mode] ? f.mode : 'datetime';
		const input = (id, label) => $('<input class="form-control fs-num fs-dt-input">').attr({ id, type: TYPES[mode], min: f.min ?? null, max: f.max ?? null, step: f.step ?? null, 'aria-label': label });
		const $from = input(c.id, f.range ? t('From') : c.ariaLabel);
		const $box = $('<div class="fs-dt">').attr('data-mode', mode);
		let $to = null;
		let $days = null;
		if (f.range) {
			$to = input(uid('dt'), t('To'));
			$box.addClass('is-range').append($('<div class="fs-dt-range">').append($from, $('<span class="fs-dt-sep" aria-hidden="true">').text('→'), $to));
		} else $box.append($from);
		if (f.range && f.days) {
			const name = uid('days');
			$days = $('<div class="fs-dt-days" role="group">').attr('aria-label', t('Days'));
			DAYS.forEach(([v, l]) => {
				const id = `${name}-${v}`;
				$days.append($('<input type="checkbox" class="fs-seg-input visually-hidden">').attr({ id, value: v }), $('<label class="fs-dt-day">').attr('for', id).text(t(l)));
			});
			$box.prepend($days);
		}
		$box.on('input change', 'input', c.change);
		if (f.required) $from.attr('aria-required', 'true');
		const days = () => ($days ? $days.find('input:checked').map((i, n) => n.value).get() : null);
		return {
			$el: $box,
			$focus: $days ? $days.find('input').first() : $from,
			$describe: () => $box.find('input.fs-dt-input'),
			get() {
				if (!f.range) return $from.val() || null;
				const from = $from.val();
				const to = $to.val();
				const d = days();
				if (!from && !to && (!d || !d.length)) return null;
				return d ? { days: d, from, to } : { from, to };
			},
			set(v) {
				if (!f.range) { $from.val(v || ''); return; }
				const o = v && typeof v === 'object' ? v : {};
				$from.val(o.from || '');
				$to.val(o.to || '');
				if ($days) $days.find('input').each((i, n) => { n.checked = (o.days || []).includes(n.value); });
			},
			setDisabled: (b) => $box.find('input').prop('disabled', b),
			setInvalid: (b) => $box.find('input.fs-dt-input').toggleClass('is-invalid', b),
			badInput: () => ($box.find('input.fs-dt-input').toArray().some((n) => n.validity && n.validity.badInput) ? t('Enter a complete date or time.') : null),
			validate(v) {
				if (!f.range) return null;
				if (!v.from || !v.to) return t('Enter both the start and the end.');
				if (v.to <= v.from) return t('The end must be after the start.');
				if (v.days && !v.days.length) return t('Choose at least one day.');
				return null;
			},
			display(v) {
				if (!v) return '';
				if (!f.range) return String(v).replace('T', ' ');
				return `${v.days ? `${v.days.join(', ')} ` : ''}${String(v.from).replace('T', ' ')}–${String(v.to).replace('T', ' ')}`;
			}
		};
	}
});
