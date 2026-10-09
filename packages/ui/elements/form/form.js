/*
 * form.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * form — the schema-driven editor behind ResourcePage and SettingsPage
 * (docs/PAGES.md). Fields, labels, help, validation and show/hide rules come
 * from the schema (GET /api/v1/schema/{resource}, format in schema.md);
 * current values from a load path; Save goes back through FS.api.
 *
 * Sections render as cards, advanced sections start collapsed (and open when
 * they contain an error). visibleWhen / enabledWhen rules run live. Changes
 * are tracked: a sticky action bar says "Unsaved changes", Ctrl+S saves, and
 * leaving the page (reload, close, partial navigation, Cancel) asks first.
 * Client-side checks mirror the server; a 422 maps error.details.fields onto
 * the fields, with an error summary at the top that takes focus and links to
 * each field.
 */
import $ from 'jquery';
import { el } from '../../js/el.js';
import { api } from '../../js/api.js';
import { batch } from '../../js/batch.js';
import { states } from '../../js/states.js';
import { nav } from '../../js/nav.js';
import { toast } from '../toast/toast.js';
import { confirm, busy, isBusy } from '../confirm/confirm.js';
import { calloutNode } from '../callout/callout.js';
import { buildField, checkCondition, getPath, setPath, icon, uid, t } from './fields.js';
/* Every field type registers itself on import. */
import '../field-text/field-text.js';
import '../field-number/field-number.js';
import '../field-secret/field-secret.js';
import '../field-select/field-select.js';
import '../field-checklist/field-checklist.js';
import '../field-switch/field-switch.js';
import '../field-segmented/field-segmented.js';
import '../field-textarea/field-textarea.js';
import '../field-address/field-address.js';
import '../field-port/field-port.js';
import '../field-typeahead/field-typeahead.js';
import '../entry-grid/entry-grid.js';
import '../field-file/field-file.js';
import '../field-datetime/field-datetime.js';
import '../field-color/field-color.js';

/* ------------------------------------------------ leave-page guard (shared) */

const guards = new Set();
const anyDirty = () => [...guards].some((g) => g.dirty());

window.addEventListener('beforeunload', (e) => {
	if (!anyDirty()) return;
	e.preventDefault();
	e.returnValue = '';
});

/* Partial navigation: ask before FS.nav swaps the page out (capture phase runs before FS.nav's handler). */
document.addEventListener('click', (e) => {
	const a = e.target instanceof Element ? e.target.closest('a[data-fs-nav]') : null;
	if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !anyDirty()) return;
	e.preventDefault();
	e.stopPropagation();
	confirmDiscard().then((ok) => {
		if (!ok) return;
		guards.forEach((g) => g.dirty() && g.forget());
		go(a.href);
	});
}, true);

function confirmDiscard() {
	return confirm({
		title: t('Discard changes?'),
		text: t('You have unsaved changes on this page. They will be lost.'),
		confirmLabel: t('Discard'),
		cancelLabel: t('Keep editing'),
		danger: true
	});
}

function go(href) {
	if (document.querySelector('[data-fs-main]')) nav.go(href);
	else location.href = href;
}

/* ------------------------------------------------------------- helpers */

/** Fill {placeholders} in a path or href from one or more objects (URL-encoded). */
function fill(tpl, ...sources) {
	return String(tpl || '').replace(/\{([\w.]+)\}/g, (m, k) => {
		for (const s of sources) { const v = getPath(s, k); if (v !== undefined && v !== null && v !== '') return encodeURIComponent(v); }
		return m;
	});
}

function normaliseSchema(s) {
	const schema = s && typeof s === 'object' ? s : {};
	if (Array.isArray(schema.sections)) return schema;
	return { ...schema, sections: [{ id: 'main', fields: schema.fields || [] }] };
}

/* --------------------------------------------------------------- element */

el.define('form', {
	init(node, config, ctx) {
		const $node = $(node).addClass('fs-form').empty()
			.attr({ 'data-density': config.density || null, 'data-layout': config.layout || 'cards' });
		const $body = $('<div class="fs-form-body">').appendTo($node);
		const ns = `.${uid('form')}`;
		let api$ = null;
		let state = null;

		function fetchAll() {
			const schemaP = config.schema ? Promise.resolve(config.schema)
				: config.schemaSource ? batch.get(config.schemaSource.path, config.schemaSource.query).then((r) => r.data)
					: Promise.resolve({ sections: [] });
			const valuesP = config.values ? Promise.resolve(config.values)
				: config.load ? batch.get(config.load.path, config.load.query).then((r) => {
					const d = r.data || {};
					/* load.field: edit that member (e.g. a rule's "fields"); the rest stays available to conditions and placeholders. */
					return config.load.field ? { ...d, ...(d[config.load.field] || {}) } : d;
				})
					: Promise.resolve({});
			return Promise.all([schemaP, valuesP]);
		}

		states.load(ctx, $body, fetchAll, ([schema, values]) => {
			if (state) state.destroy();
			state = build(normaliseSchema(schema), values || {});
			return true;
		}, { lines: 6 });

		/* ----------------------------------------------------------- build */

		function build(schema, values) {
			$body.empty();
			const fields = [];
			const sections = [];
			let baseline = '';
			let original = values;
			let saving = false;
			let wasDirty = false;
			const readonly = config.readonly === true || (!!(config.readonlyWhen || schema.readonlyWhen) && checkCondition(config.readonlyWhen || schema.readonlyWhen, values));
			const method = String((config.save && config.save.method) || 'PUT').toUpperCase();

			const $form = $('<form class="fs-form-form" novalidate>').attr('aria-label', config.label || schema.title || null);
			const $alerts = $('<div class="fs-form-alerts">');
			const $summaryBox = $('<div class="fs-form-errors" role="alert" tabindex="-1">').prop('hidden', true);
			$alerts.append($summaryBox);
			if (readonly) {
				$alerts.prepend(calloutNode({
					level: 'info', icon: 'lock',
					title: config.readonlyTitle || schema.readonlyTitle || t('Read only'),
					text: config.readonlyText || schema.readonlyText || t('This is a system rule and cannot be changed.')
				}));
			}
			$form.append($alerts);

			/* Live summary sentence. */
			const summaryTpl = config.summary === true ? schema.summary : (typeof config.summary === 'string' ? config.summary : null);
			const $live = summaryTpl ? $('<div class="fs-form-summary">').append($('<span class="fs-form-summary-icon">').append(icon(schema.summaryIcon || 'wand-magic-sparkles')), $('<p class="fs-form-summary-text">')) : null;
			if ($live) $form.append($live);

			const order = config.sections || schema.order;
			const list = order ? order.map((id) => schema.sections.find((s) => s.id === id)).filter(Boolean) : schema.sections;
			const plain = config.layout === 'plain';

			list.forEach((s) => {
				const sid = uid('sec');
				const collapsible = !!(s.collapsed || s.advanced);
				const $sec = $('<section class="fs-form-section">').attr({ 'data-id': s.id || null, 'aria-labelledby': s.title ? `${sid}-t` : null })
					.toggleClass('is-collapsible', collapsible).toggleClass('is-plain', plain);
				const $grid = $('<div class="fs-form-grid">').attr('id', `${sid}-b`);
				const sec = { s, $sec, $grid, fields: [], open: true };
				if (s.title) {
					const $head = $('<div class="fs-form-section-head">');
					const $title = $('<h2 class="fs-form-section-title">').attr('id', `${sid}-t`);
					if (collapsible) {
						const $btn = $('<button type="button" class="fs-form-section-toggle" aria-expanded="false">').attr('aria-controls', `${sid}-b`)
							.append($('<span class="fs-form-section-chev">').append(icon('chevron-right')), $('<span>').text(s.title));
						if (s.advanced || s.collapsed) $btn.append($('<span class="fs-form-section-tag">').text(s.tag || t('Advanced')));
						$title.append($btn);
						$btn.on('click', () => toggle(sec, !sec.open));
						sec.$btn = $btn;
					} else $title.text(s.title);
					$head.append($title);
					if (s.description) $head.append($('<p class="fs-form-section-desc">').text(s.description));
					$sec.append($head);
				}
				$sec.append($grid);
				(s.fields || []).forEach((f) => {
					const inst = buildField(f, { value: getPath(values, f.name), onChange: changed });
					inst.section = sec;
					sec.fields.push(inst);
					fields.push(inst);
					$grid.append(inst.$wrap);
				});
				sections.push(sec);
				$form.append($sec);
				if (collapsible) toggle(sec, s.open === true, false);
			});

			/* Sticky action bar. */
			const $bar = $('<div class="fs-form-bar">');
			const $status = $('<span class="fs-form-status" role="status">');
			const $actions = $('<div class="fs-form-actions">');
			const $cancel = $('<button type="button" class="btn btn-secondary fs-form-cancel">');
			const $save = $('<button type="submit" class="btn btn-primary fs-form-save">').append(icon('check'), $('<span>').text(config.submitLabel || (method === 'POST' ? t('Create') : t('Save'))));
			if (config.cancelHref) $cancel.text(readonly ? t('Back') : t('Cancel'));
			else $cancel.text(t('Discard changes'));
			$actions.append($cancel, readonly ? null : $save);
			$bar.append($status, $actions);
			if (!readonly || config.cancelHref) $form.append($bar);
			$body.append($form);

			function toggle(sec, open, focus) {
				sec.open = open;
				sec.$sec.toggleClass('is-open', open);
				sec.$grid.prop('hidden', !open);
				if (sec.$btn) sec.$btn.attr('aria-expanded', open ? 'true' : 'false');
				if (focus) sec.$btn.trigger('focus');
			}

			/* ------------------------------------------------ values & rules */

			function flatValues() { const o = {}; fields.forEach((x) => { o[x.name] = x.get(); }); return o; }
			function serialise() {
				const out = {};
				fields.forEach((x) => { if (x.visible || config.keepHidden) setPath(out, x.name, x.get()); });
				return out;
			}
			function rules() {
				for (let pass = 0; pass < 3; pass++) {
					const flat = flatValues();
					let changedAny = false;
					sections.forEach((sec) => {
						const vis = checkCondition(sec.s.visibleWhen, flat);
						sec.$sec.prop('hidden', !vis);
						sec.fields.forEach((x) => {
							const v = vis && checkCondition(x.f.visibleWhen, flat);
							if (v !== x.visible) { x.setVisible(v); changedAny = true; }
							if (!readonly) x.setDisabled(!checkCondition(x.f.enabledWhen, flat), 'rule');
						});
					});
					if (!changedAny) break;
				}
			}
			const isDirty = () => !readonly && JSON.stringify(serialise()) !== baseline;
			function renderSummary() {
				if (!$live) return;
				const $p = $live.find('.fs-form-summary-text').empty();
				const byName = Object.fromEntries(fields.map((x) => [x.name, x]));
				const disp = (k) => { const x = byName[k]; return x && x.visible ? String(x.display() ?? '').trim() : ''; };
				/* [optional segment {with} tokens] is dropped when any token in it is empty. */
				String(summaryTpl).split(/(\[[^\]]*\])/).forEach((part) => {
					const opt = part.startsWith('[') && part.endsWith(']');
					const body = opt ? part.slice(1, -1) : part;
					const toks = [...body.matchAll(/\{([\w.]+)\}/g)].map((m) => m[1]);
					if (opt && toks.some((k) => !disp(k))) return;
					body.split(/(\{[\w.]+\})/).forEach((bit) => {
						const m = /^\{([\w.]+)\}$/.exec(bit);
						if (m) { const v = disp(m[1]); $p.append(v ? $('<span class="fs-form-summary-token">').text(v) : $('<span class="fs-form-summary-missing">').text('…')); }
						else if (bit) $p.append(document.createTextNode(bit));
					});
				});
			}
			function updateStatus() {
				const dirty = isDirty();
				$node.toggleClass('is-dirty', dirty);
				$status.empty();
				if (readonly) $status.append(icon('lock'), $('<span>').text(t('Read only')));
				else if (dirty) $status.append($('<span class="fs-form-dot" aria-hidden="true">'), $('<span>').text(t('Unsaved changes')));
				else if (state && state.savedOnce) $status.append(icon('circle-check'), $('<span>').text(t('All changes saved')));
				if (!config.cancelHref) $cancel.prop('disabled', saving).prop('hidden', readonly || !dirty);
				if (dirty !== wasDirty) { wasDirty = dirty; $node.trigger('fs:dirty', [dirty]); }
			}
			function changed() {
				rules();
				renderSummary();
				updateStatus();
				$node.trigger('fs:change', [serialise()]);
			}
			function setValues(v) {
				fields.forEach((x) => x.set(getPath(v, x.name)));
				rules();
				renderSummary();
			}

			/* ------------------------------------------------------- errors */

			function clearErrors() {
				fields.forEach((x) => x.clearErrors());
				$summaryBox.prop('hidden', true).empty();
			}
			function showErrors(entries, { message = null, general = [], focus = true } = {}) {
				entries.forEach((e) => {
					const x = fields.find((f) => e.name === f.name || String(e.name).startsWith(`${f.name}.`));
					if (x && x.section && x.section.$btn && !x.section.open) toggle(x.section, true);
				});
				$summaryBox.empty();
				const n = entries.length + general.length;
				const $head = $('<div class="fs-form-errors-head">').append(icon('circle-exclamation'),
					$('<p class="fs-form-errors-title">').text(n ? t('{n} field needs attention', { n: entries.length || n }, '{n} fields need attention') : (message || t('The changes could not be saved.'))));
				$summaryBox.append($head);
				if (message && n) $summaryBox.append($('<p class="fs-form-errors-text">').text(message));
				if (n) {
					const $ul = $('<ul class="fs-form-errors-list">');
					entries.forEach((e) => {
						const $a = $('<a>').attr('href', `#${e.id}`).append($('<span class="fs-form-errors-field">').text(e.label), $('<span>').text(e.message));
						$a.on('click', (ev) => {
							ev.preventDefault();
							const x = fields.find((f) => e.name === f.name || String(e.name).startsWith(`${f.name}.`));
							if (x && x.section && !x.section.open) toggle(x.section, true);
							e.focus();
							const target = document.getElementById(e.id);
							if (target && target.scrollIntoView) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
						});
						$ul.append($('<li>').append($a));
					});
					general.forEach((g) => $ul.append($('<li class="fs-form-errors-general">').text(g)));
					$summaryBox.append($ul);
				}
				$summaryBox.prop('hidden', false);
				if (focus) {
					if (config.errorFocus === 'field' && entries[0]) entries[0].focus();
					else $summaryBox[0].focus();
				}
				$node.trigger('fs:invalid', [entries]);
			}
			/** Map {name: message} (dots or [n] for rows) onto fields; returns {entries, general}. */
			function applyFieldErrors(map) {
				const general = [];
				Object.entries(map || {}).forEach(([key, msg]) => {
					const k = String(key).replace(/\[(\d+)\]/g, '.$1');
					const exact = fields.find((x) => x.name === k);
					if (exact) { exact.setError(msg); return; }
					const parent = fields.filter((x) => k.startsWith(`${x.name}.`)).sort((a, b) => b.name.length - a.name.length)[0];
					if (parent) parent.setError(msg, k.slice(parent.name.length + 1));
					else general.push(msg);
				});
				return { entries: fields.flatMap((x) => x.errorEntries()), general };
			}

			/* --------------------------------------------------------- save */

			async function save() {
				if (readonly || saving) return false;
				clearErrors();
				const entries = fields.flatMap((x) => x.validate());
				if (entries.length) { showErrors(entries); return false; }
				if (!config.save || !config.save.path) { toast(t('Nothing to save to (no save path).'), { level: 'warn' }); return false; }
				/* save.body: constant fields sent with every save (e.g. floating: true for a new floating rule). */
				const body = { ...((config.save && config.save.body) || {}), ...serialise() };
				saving = true;
				busy($save, true);
				updateStatus();
				try {
					const res = await api.request(method, fill(config.save.path, original, body), body);
					const meta = res.meta || {};
					const saved = res.data && typeof res.data === 'object' ? res.data : body;
					original = { ...original, ...body, ...saved };
					baseline = JSON.stringify(serialise());
					state.savedOnce = true;
					toast(meta.message || config.successMessage || t('Changes saved'), { level: 'ok' });
					if (meta.pending) $(document).trigger('fs:pending', [{ path: config.save.path }]);
					$node.trigger('fs:saved', [res]);
					if (config.successHref) go(fill(config.successHref, saved, body));
					return res;
				} catch (err) {
					if (err.status === 422 && (err.fields || (err.messages && err.messages.length))) {
						const { entries: e2, general } = applyFieldErrors(err.fields);
						showErrors(e2, { message: err.message, general: general.concat(err.messages || []) });
					} else {
						showErrors([], { message: err.message || t('The changes could not be saved.') });
					}
					return false;
				} finally {
					saving = false;
					busy($save, false);
					updateStatus();
				}
			}

			$form.on('submit', (e) => { e.preventDefault(); if (!isBusy($save)) save(); });
			$cancel.on('click', async () => {
				if (isDirty() && !(await confirmDiscard())) return;
				clearErrors();
				if (config.cancelHref) { guard.forget(); go(config.cancelHref); return; }
				setValues(original);
				updateStatus();
			});
			$(document).on(`keydown${ns}`, (e) => {
				if (!(e.ctrlKey || e.metaKey) || e.altKey || String(e.key).toLowerCase() !== 's') return;
				if (!document.body.contains(node) || readonly) return;
				const active = document.activeElement;
				const inThis = node.contains(active);
				const inOther = active && active.closest && active.closest('.fs-form') && !inThis;
				const first = document.querySelector('.fs-form') === node;
				if (!inThis && (inOther || !first)) return;
				if ($('.modal.show').length && !node.closest('.modal')) return;
				e.preventDefault();
				save();
			});

			let forgotten = false;
			const guard = {
				node,
				dirty: () => !forgotten && isDirty(),
				forget() { forgotten = true; }
			};
			guards.add(guard);

			rules();
			baseline = JSON.stringify(serialise());
			if (readonly) fields.forEach((x) => x.setDisabled(true, 'form'));
			renderSummary();
			updateStatus();
			if (config.errors) {
				const { entries, general } = applyFieldErrors(config.errors);
				showErrors(entries, { general, focus: false, message: config.errorMessage || null });
			}
			Promise.all(fields.map((x) => x.ready)).then(() => renderSummary(), () => {});

			api$ = {
				values: serialise,
				set(v) { setValues(v); updateStatus(); },
				validate() { clearErrors(); const e = fields.flatMap((x) => x.validate()); if (e.length) showErrors(e); return e.length === 0; },
				save,
				isDirty,
				reset() { setValues(original); clearErrors(); updateStatus(); },
				setErrors(map, message) { clearErrors(); const r = applyFieldErrors(map); showErrors(r.entries, { message, general: r.general }); },
				field: (name) => fields.find((x) => x.name === name) || null
			};
			return {
				savedOnce: false,
				destroy() {
					guards.delete(guard);
					$(document).off(ns);
					fields.forEach((x) => x.destroy());
				}
			};
		}

		return {
			values: () => (api$ ? api$.values() : null),
			set: (v) => api$ && api$.set(v),
			validate: () => (api$ ? api$.validate() : false),
			save: () => (api$ ? api$.save() : Promise.resolve(false)),
			isDirty: () => (api$ ? api$.isDirty() : false),
			reset: () => api$ && api$.reset(),
			setErrors: (map, message) => api$ && api$.setErrors(map, message),
			field: (name) => (api$ ? api$.field(name) : null),
			destroy() { if (state) state.destroy(); $(document).off(ns); }
		};
	}
});
