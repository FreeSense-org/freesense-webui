/*
 * modal-form.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * modal-form — a small form in a dialog, driven by config. Submits through
 * FS.api, shows 422 field errors next to the inputs and resolves with the
 * response (null when cancelled). Larger forms use the schema form.
 *
 *   import { modalForm } from '../modal-form/modal-form.js';
 *   const res = await modalForm({ title: 'Add host alias', path: '/v1/firewall/aliases', fields: [...] });
 *
 * Temporary bridge: window.FS.modalForm.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { api } from '../../js/api.js';
import { toast, t, bridge, icon, apiPath } from '../toast/toast.js';
import { dialog, button, busy, triggerButton } from '../confirm/confirm.js';

let seq = 0;

function fieldNode(f, value, idBase) {
	const id = `${idBase}-${f.name}`;
	const $wrap = $('<div class="fs-mf-field">').attr('data-field', f.name);
	const describedBy = [];
	let $input;

	if (f.type === 'switch') {
		$input = $('<input class="form-check-input" type="checkbox" role="switch">').attr('id', id).prop('checked', !!value);
		$wrap.addClass('form-check form-switch fs-mf-switch').append($input, $('<label class="form-check-label">').attr('for', id).text(f.label));
	} else {
		const $label = $('<label class="form-label">').attr('for', id).text(f.label);
		if (f.required) $label.append($('<span class="fs-mf-req" aria-hidden="true">').text(' *'));
		if (f.type === 'select') {
			$input = $('<select class="form-select">');
			if (!f.required || value == null || value === '') $input.append($('<option value="">').text(f.placeholder || t('Choose…')));
			for (const o of f.options || []) {
				const opt = typeof o === 'object' ? o : { value: o, label: o };
				$input.append($('<option>').val(opt.value).text(opt.label ?? opt.value));
			}
			$input.val(value ?? '');
		} else if (f.type === 'textarea') {
			$input = $('<textarea class="form-control">').attr('rows', f.rows || 3).val(value ?? '');
		} else {
			$input = $('<input class="form-control">').attr('type', f.type === 'number' ? 'number' : (f.inputType || 'text')).val(value ?? '');
			if (f.type === 'number') $input.attr({ min: f.min, max: f.max, step: f.step, inputmode: 'numeric' });
			if (f.mono) $input.addClass('fs-mono');
		}
		$input.attr({ id, name: f.name, placeholder: f.type !== 'select' ? f.placeholder : null, maxlength: f.maxlength, autocomplete: f.autocomplete || 'off' });
		if (f.required) $input.attr({ required: true, 'aria-required': 'true' });
		$wrap.append($label, $input);
	}
	if (f.help) {
		describedBy.push(`${id}-help`);
		$wrap.append($('<p class="form-text fs-mf-help">').attr('id', `${id}-help`).text(f.help));
	}
	$wrap.append($('<div class="invalid-feedback fs-mf-error">').attr('id', `${id}-error`));
	if (describedBy.length) $input.attr('aria-describedby', describedBy.join(' '));
	$input.attr('name', f.name);
	return { $wrap, $input, f };
}

function readValue(x) {
	if (x.f.type === 'switch') return x.$input.prop('checked');
	const v = x.$input.val();
	if (x.f.type === 'number') return v === '' ? null : Number(v);
	return typeof v === 'string' && x.f.trim !== false ? v.trim() : v;
}

function setError(x, msg) {
	const $err = x.$wrap.find('.fs-mf-error');
	const help = x.f.help ? `${x.$input.attr('id')}-help` : '';
	if (msg) {
		$err.text(msg);
		x.$input.addClass('is-invalid').attr({ 'aria-invalid': 'true', 'aria-describedby': [help, $err.attr('id')].filter(Boolean).join(' ') });
	} else {
		$err.text('');
		x.$input.removeClass('is-invalid').attr({ 'aria-invalid': null, 'aria-describedby': help || null });
	}
}

/**
 * Open the form. Resolves with the API response ({data, meta}) after a
 * successful submit, or null when cancelled.
 *   { title, text, fields: [{name, type, label, help, required, placeholder, options, min, max, rows, value}],
 *     values: {}, method: 'POST', path, submitLabel, success, transform(values) }
 */
export function modalForm(o = {}) {
	const idBase = `fs-mf-${++seq}`;
	const d = dialog({ title: o.title || '', icon: o.icon || null, static: true, focus: () => d.$dialog.find('.form-control, .form-select, .form-check-input').filter(':visible')[0] });
	d.$dialog.addClass('fs-modal-form');
	const $form = $('<form class="fs-mf-form" novalidate>').attr('id', `${idBase}-form`);
	if (o.text) $form.append($('<p class="fs-dialog-text">').text(o.text));
	const $alert = $('<div class="fs-mf-alert" role="alert" tabindex="-1" hidden>');
	$form.append($alert);
	const values = o.values || {};
	const fields = (o.fields || []).map((f) => fieldNode(f, values[f.name] ?? f.value, idBase));
	$form.append(fields.map((x) => x.$wrap));
	d.$body.append($form);

	const $cancel = button(o.cancelLabel || t('Cancel')).addClass('fs-dialog-cancel').on('click', () => d.close(null));
	const $submit = button(o.submitLabel || t('Save'), { variant: 'primary', primary: true, type: 'submit' }).attr('form', $form.attr('id'));
	d.$footer.append($cancel, $submit);

	function showAlert(msg) {
		$alert.prop('hidden', !msg).empty();
		if (msg) $alert.append(icon('circle-exclamation'), $('<span>').text(msg));
	}
	fields.forEach((x) => x.$input.on('input change', () => { if (x.$input.hasClass('is-invalid')) setError(x, null); }));

	let sending = false;
	$form.on('submit', async (e) => {
		e.preventDefault();
		if (sending) return;
		showAlert(null);
		/* Client-side: required fields only; the API owns every other rule. */
		let first = null;
		for (const x of fields) {
			const v = readValue(x);
			const missing = x.f.required && x.f.type !== 'switch' && (v === '' || v == null);
			setError(x, missing ? t('{label} is required.', { label: x.f.label }) : null);
			if (missing && !first) first = x;
		}
		if (first) { first.$input.trigger('focus'); return; }

		const body = Object.fromEntries(fields.map((x) => [x.f.name, readValue(x)]));
		sending = true;
		busy($submit, true);
		$cancel.prop('disabled', true);
		try {
			const res = await api.request((o.method || 'POST').toUpperCase(), apiPath(o.path), o.transform ? o.transform(body) : body);
			const meta = res.meta || {};
			const msg = meta.message || o.success;
			if (msg) toast(msg, { level: 'ok' });
			if (meta.pending) $(document).trigger('fs:pending', [{ path: o.path }]);
			d.close(res);
		} catch (err) {
			if (err.fields) {
				let focus = null;
				for (const x of fields) {
					const m = err.fields[x.f.name];
					setError(x, m || null);
					if (m && !focus) focus = x;
				}
				const unknown = Object.keys(err.fields).filter((k) => !fields.some((x) => x.f.name === k));
				showAlert(unknown.length ? `${err.message} ${unknown.map((k) => err.fields[k]).join(' ')}` : err.message);
				(focus ? focus.$input : $alert).trigger('focus');
			} else {
				showAlert(err.message || t('The request failed.'));
			}
		} finally {
			sending = false;
			busy($submit, false);
			$cancel.prop('disabled', false);
		}
	});

	return d.result.then((r) => r || null);
}

el.define('modal-form', {
	init(node, config) {
		const $node = $(node).addClass('fs-confirm');
		const $btn = triggerButton({ variant: 'primary', ...config }, config.title || t('Open')).appendTo($node);
		async function open(extra) {
			const res = await modalForm({ ...config, icon: config.dialogIcon, ...extra });
			if (res) $node.trigger('fs:saved', [res]);
			return res;
		}
		$btn.on('click', () => open());
		return { open, destroy() { $btn.off(); } };
	}
});

bridge('modalForm', modalForm);
