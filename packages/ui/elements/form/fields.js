/*
 * fields.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Field registry and field wrapper shared by the schema form, the entry grid
 * and the standalone field-<type> elements. See schema.md for the format.
 *
 * A field type registers a control builder:
 *
 *   registerField('text', {
 *     build(f, c) → { $el, $focus, get(), set(v), setDisabled(b), validate?(v), display?(v), destroy?() }
 *   });
 *
 * c (build context): { id, labelId, ariaLabel, compact, change(), rebind(), options() }
 *   id        id for the focusable element (the <label for> points at it)
 *   labelId   id of the visible label (group controls use aria-labelledby)
 *   ariaLabel accessible name when there is no visible label (entry-grid cells)
 *   change()  call on every user edit
 *   rebind()  call after the control replaced its focusable element
 *
 * buildField(f, opts) wraps a control in label, help and an inline error and
 * returns the field instance the form drives. defineField() also registers a
 * standalone element `field-<type>` for pages that need a single input.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { batch } from '../../js/batch.js';
import { t } from '../../js/i18n.js';

const types = new Map();
let seq = 0;

export { t };
export const uid = (p = 'f') => `fs-${p}-${++seq}`;
export const icon = (name) => $('<i aria-hidden="true">').addClass(`fa-solid fa-${name}`);
export const isEmpty = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

export function registerField(type, def) { types.set(type, def); }
export function fieldType(type) { return types.get(type) || types.get('text'); }
export function hasField(type) { return types.has(type); }

/* ------------------------------------------------------------- paths */

/** Read 'a.b.c' or '[name=x].y' style paths from an object. */
export function getPath(obj, path) {
	if (obj == null || !path) return undefined;
	if (Object.prototype.hasOwnProperty.call(obj, path)) return obj[path];
	return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** Write a dotted name into a nested object ({a: {b: v}}). */
export function setPath(obj, path, value) {
	const keys = String(path).split('.');
	let o = obj;
	keys.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
	o[keys[keys.length - 1]] = value;
	return obj;
}

/* -------------------------------------------------------- conditions */

/**
 * Evaluate a visibleWhen / enabledWhen rule against the current values.
 *   {field, equals} {field, notEquals} {field, in: []} {field, notIn: []} {field, truthy: bool}
 *   [rule, rule]   all must hold          {any: [rule, rule]}   one must hold
 */
export function checkCondition(cond, values) {
	if (!cond) return true;
	if (Array.isArray(cond)) return cond.every((c) => checkCondition(c, values));
	if (cond.any) return cond.any.some((c) => checkCondition(c, values));
	if (cond.all) return cond.all.every((c) => checkCondition(c, values));
	const v = getPath(values, cond.field);
	const same = (a, b) => (Array.isArray(a) ? a.map(String).includes(String(b)) : String(a ?? '') === String(b ?? ''));
	if ('equals' in cond) return same(v, cond.equals);
	if ('notEquals' in cond) return !same(v, cond.notEquals);
	if ('in' in cond) return (cond.in || []).some((x) => same(v, x));
	if ('notIn' in cond) return !(cond.notIn || []).some((x) => same(v, x));
	if ('truthy' in cond) return !isEmpty(v) && v !== false && v !== 0 ? !!cond.truthy : !cond.truthy;
	return !isEmpty(v) && v !== false;
}

/* ----------------------------------------------------------- options */

function normOption(o) {
	if (o === null || typeof o !== 'object') return { value: o, label: String(o) };
	return { ...o, label: o.label ?? String(o.value) };
}

/** Static options of a field, normalised to [{value, label, group, detail, icon, tone, disabled}]. */
export function staticOptions(f) {
	return Array.isArray(f.options) ? f.options.map(normOption) : [];
}

/**
 * Options of a field: static, or loaded from {source: {path, query}, value, label, group, detail}
 * (dot paths into each row), with optional `prepend` / `append` static options.
 */
export function loadOptions(f) {
	const o = f.options;
	if (!o || Array.isArray(o) || !o.source) return Promise.resolve(staticOptions(f));
	return batch.get(o.source.path, o.source.query).then((res) => {
		const rows = Array.isArray(res.data) ? res.data : [];
		const map = (r) => ({
			value: getPath(r, o.value || 'value'),
			label: String(getPath(r, o.label || 'label') ?? getPath(r, o.value || 'value')),
			group: o.group ? getPath(r, o.group) : undefined,
			detail: o.detail ? getPath(r, o.detail) : undefined
		});
		return [...(o.prepend || []).map(normOption), ...rows.map(map), ...(o.append || []).map(normOption)];
	});
}

/** Label of a value among options (for summaries and read-only display). */
export function optionLabel(opts, v) {
	const o = opts.find((x) => String(x.value) === String(v));
	return o ? o.label : (v ?? '');
}

/* -------------------------------------------------------- validation */

/** Rules every field shares: required, pattern, length, numeric range. Returns a message or null. */
export function validateCommon(f, v) {
	const label = f.label || f.name;
	if (isEmpty(v)) return f.required ? f.requiredMessage || t('{label} is required.', { label }) : null;
	if (typeof v === 'string') {
		if (f.pattern && !new RegExp(f.pattern).test(v)) return f.patternMessage || t('{label} has an invalid format.', { label });
		if (f.minLength && v.length < f.minLength) return t('Use at least {n} characters.', { n: f.minLength });
		if (f.maxLength && v.length > f.maxLength) return t('Use at most {n} characters.', { n: f.maxLength });
	}
	if (typeof v === 'number') {
		if (f.min != null && v < f.min) return t('Enter {min} or more.', { min: f.min });
		if (f.max != null && v > f.max) return t('Enter {max} or less.', { max: f.max });
	}
	if (Array.isArray(v)) {
		if (f.minItems && v.length < f.minItems) return t('Choose at least {n}.', { n: f.minItems });
		if (f.maxItems && v.length > f.maxItems) return t('Choose at most {n}.', { n: f.maxItems });
	}
	return null;
}

/* --------------------------------------------------- shared markup */

/** Wrap an input with prefix/suffix add-ons (Bootstrap input group). */
export function affix($input, f, extra = {}) {
	const pre = extra.prefix ?? f.prefix;
	const suf = extra.suffix ?? f.suffix ?? f.unit;
	if (!pre && !suf && !extra.$before && !extra.$after) return $input;
	const $g = $('<div class="input-group fs-field-group">');
	if (extra.$before) $g.append(extra.$before);
	if (pre) $g.append($('<span class="input-group-text fs-field-affix">').text(pre));
	$g.append($input);
	if (suf) $g.append($('<span class="input-group-text fs-field-affix">').text(suf));
	if (extra.$after) $g.append(extra.$after);
	return $g;
}

/** Plain text input used by several types. */
export function textInput(f, c, type = 'text') {
	const $in = $('<input class="form-control">').attr({
		id: c.id, type, name: f.name, placeholder: f.placeholder ?? null, maxlength: f.maxLength ?? null,
		autocomplete: f.autocomplete || 'off', inputmode: f.inputmode ?? null,
		spellcheck: f.mono ? 'false' : null, 'aria-label': c.ariaLabel || null
	});
	if (f.mono) $in.addClass('fs-mono');
	if (f.required) $in.attr('aria-required', 'true');
	return $in;
}

export function iconButton(label, ic, extra = 'btn-secondary') {
	return $('<button type="button" class="btn fs-field-btn">').addClass(extra).attr({ 'aria-label': label, title: label }).append(icon(ic));
}

/* ------------------------------------------------------------ wrapper */

/**
 * Build one field: label, control, help, inline error.
 *   opts: { onChange(inst), value, compact, ariaLabel }
 * Returns the field instance:
 *   { name, f, $wrap, get(), set(v), validate() → [{message, focus}], setError(msg, sub?),
 *     clearErrors(), focus(), setDisabled(b), setVisible(b), display(), visible, destroy() }
 */
export function buildField(f, opts = {}) {
	const def = fieldType(f.type);
	const id = uid('fld');
	const labelId = `${id}-label`;
	const helpId = `${id}-help`;
	const errId = `${id}-error`;
	const group = !!def.group;
	const compact = !!opts.compact;

	const $wrap = $('<div class="fs-field">').attr({ 'data-name': f.name, 'data-type': f.type || 'text', 'data-width': f.width || 'full' });
	let $label = null;
	if (!compact) {
		$label = $(group ? '<span class="fs-field-label">' : '<label class="fs-field-label">').attr('id', labelId);
		if (!group) $label.attr('for', id);
		$label.append($('<span class="fs-field-label-text">').text(f.label || f.name));
		if (f.required) $label.append($('<span class="fs-field-req" aria-hidden="true">').text('*'));
		if (f.badge) $label.append($('<span class="fs-field-badge">').text(f.badge));
		$wrap.append($label);
	}

	let inst = null;
	let error = null;
	let disabledBy = { schema: !!(f.disabled || f.readonly), rule: false, form: false };
	const c = {
		id, labelId, compact,
		ariaLabel: compact ? (opts.ariaLabel || f.label || f.name) : null,
		change() {
			if (error) inst.setError(null);
			if (opts.onChange) opts.onChange(inst);
			$wrap.trigger('fs:field-change', [inst]);
		},
		rebind() { aria(); },
		/** Show an error right away (e.g. a rejected file) without waiting for validation. */
		error(msg) { inst.setError(msg); }
	};
	let ctrl = null;
	ctrl = def.build(f, c);
	$wrap.append($('<div class="fs-field-control">').append(ctrl.$el));
	if (f.help && !compact) $wrap.append($('<p class="fs-field-help">').attr('id', helpId).text(f.help));
	const $err = $('<p class="fs-field-error">').attr({ id: errId, hidden: true });
	$wrap.append($err);

	function describeTarget() { if (!ctrl) return null; return ctrl.$describe ? ctrl.$describe() : ctrl.$focus; }
	function aria() {
		const $t = describeTarget();
		if (!$t) return;
		const ids = [f.help && !compact ? helpId : null, error ? errId : null].filter(Boolean).join(' ');
		$t.attr({ 'aria-describedby': ids || null, 'aria-invalid': error ? 'true' : null });
		if (group && !compact) $t.attr('aria-labelledby', labelId);
	}

	inst = {
		name: f.name,
		f,
		$wrap,
		visible: true,
		get: () => ctrl.get(),
		set(v) { ctrl.set(v === undefined ? f.default : v); },
		/** Display text of the current value (summaries). */
		display() { const v = ctrl.get(); return ctrl.display ? ctrl.display(v) : Array.isArray(v) ? v.join(', ') : (v === true ? t('yes') : v === false ? '' : String(v ?? '')); },
		validate() {
			if (!inst.visible || inst.disabled()) return [];
			const v = ctrl.get();
			const msg = (ctrl.badInput && ctrl.badInput()) || validateCommon(f, v) || (!isEmpty(v) && ctrl.validate ? ctrl.validate(v) : null);
			inst.setError(msg);
			const out = msg ? [{ name: f.name, label: f.label || f.name, message: msg, id, focus: () => inst.focus() }] : [];
			if (ctrl.validateParts) out.push(...ctrl.validateParts());
			return out;
		},
		/** Show (msg) or clear (null) the inline error; sub targets a part (entry-grid rows). */
		setError(msg, sub = null) {
			if (sub && ctrl.setSubError && ctrl.setSubError(sub, msg)) return;
			error = msg || null;
			$wrap.toggleClass('is-invalid', !!error);
			$err.prop('hidden', !error).empty();
			if (error) $err.append(icon('circle-exclamation'), $('<span>').text(error));
			if (ctrl.setInvalid) ctrl.setInvalid(!!error);
			else if (ctrl.$focus) ctrl.$focus.toggleClass('is-invalid', !!error);
			aria();
		},
		clearErrors() { inst.setError(null); if (ctrl.clearSubErrors) ctrl.clearSubErrors(); },
		errorEntries() {
			const own = error ? [{ name: f.name, label: f.label || f.name, message: error, id, focus: () => inst.focus() }] : [];
			return own.concat(ctrl.subErrorEntries ? ctrl.subErrorEntries() : []);
		},
		focus() { (ctrl.focus ? ctrl.focus() : ctrl.$focus && ctrl.$focus.first().trigger('focus')); },
		focusId: () => id,
		disabled: () => disabledBy.schema || disabledBy.rule || disabledBy.form,
		setDisabled(b, by = 'form') {
			disabledBy[by] = !!b;
			const d = inst.disabled();
			$wrap.toggleClass('is-disabled', d);
			ctrl.setDisabled(d);
		},
		setVisible(b) {
			inst.visible = !!b;
			$wrap.prop('hidden', !b).toggleClass('is-hidden', !b);
		},
		ready: ctrl.ready || Promise.resolve(),
		destroy() { if (ctrl.destroy) ctrl.destroy(); }
	};

	inst.set(opts.value !== undefined ? opts.value : f.value);
	aria();
	if (inst.disabled()) ctrl.setDisabled(true);
	$wrap.toggleClass('is-disabled', inst.disabled());
	if (opts.error) inst.setError(opts.error);
	return inst;
}

/**
 * Register a field type and its standalone element (`field-<type>` unless
 * elName is given). The element config is the field schema plus
 * `value` and `error`; it emits `fs:change` [value] on edits.
 */
export function defineField(type, def, elName = `field-${type}`) {
	registerField(type, def);
	if (el.has(elName)) return;
	el.define(elName, {
		init(node, config) {
			const $node = $(node).addClass('fs-field-el').empty();
			const f = { name: config.name || type, ...config, type };
			const inst = buildField(f, {
				value: config.value,
				error: config.error,
				onChange: (i) => $node.trigger('fs:change', [i.get()])
			});
			$node.append(inst.$wrap);
			return {
				get: inst.get,
				set: inst.set,
				validate: () => inst.validate(),
				setError: inst.setError,
				setDisabled: (b) => inst.setDisabled(b),
				focus: inst.focus,
				destroy: inst.destroy
			};
		}
	});
}
