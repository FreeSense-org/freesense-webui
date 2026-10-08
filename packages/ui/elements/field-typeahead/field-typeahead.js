/*
 * field-typeahead.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * field-typeahead — free text with suggestions from an API source
 * (`source: {path, query, param: 'q', value, label, detail, group}`, the
 * last four being dot paths into each row) or a static `suggestions` list. `strict: true` only
 * accepts a suggested value. Registered as schema type `typeahead`.
 */
import { batch } from '../../js/batch.js';
import { defineField, textInput, affix, getPath, t } from '../form/fields.js';
import { suggest } from './suggest.js';

/** Suggestions for a typeahead config: [{value, label, detail, group}]. */
export function typeaheadFetch(f) {
	const m = f.source || {};
	const map = (r) => (r && typeof r === 'object'
		? { value: String(getPath(r, m.value || 'value') ?? ''), label: String(getPath(r, m.label || m.value || 'value') ?? ''), detail: m.detail ? getPath(r, m.detail) : r.detail, group: m.group ? getPath(r, m.group) : r.group }
		: { value: String(r), label: String(r) });
	return (q) => {
		const ql = q.toLowerCase();
		if (f.source) {
			return batch.get(f.source.path, { ...(f.source.query || {}), [f.source.param || 'q']: q })
				.then((res) => (Array.isArray(res.data) ? res.data : []).map(map));
		}
		return Promise.resolve((f.suggestions || []).map(map).filter((s) => !ql || `${s.value} ${s.label} ${s.detail || ''}`.toLowerCase().includes(ql)));
	};
}

defineField('typeahead', {
	build(f, c) {
		const $in = textInput(f, c);
		const $el = affix($in, f);
		const $anchor = $el === $in ? null : $el;
		const fetch = typeaheadFetch(f);
		let known = new Set();
		const s = suggest($in, $anchor || $in.wrap('<div class="fs-typeahead">').parent(), {
			fetch: (q) => fetch(q).then((items) => { items.forEach((i) => known.add(i.value)); return items; }),
			onPick: (it) => { $in.val(it.value); c.change(); },
			labelledBy: c.compact ? null : c.labelId,
			label: c.ariaLabel,
			minChars: f.minChars ?? 1
		});
		$in.on('input', c.change);
		return {
			$el: $anchor || $in.parent(),
			$focus: $in,
			get: () => $in.val().trim(),
			set(v) { $in.val(v ?? ''); if (v) known.add(String(v)); },
			setDisabled: (b) => { $in.prop('disabled', b); if (b) s.close(); },
			validate: (v) => (f.strict && !known.has(v) ? t('Choose one of the suggestions.') : null),
			destroy: () => { s.destroy(); known = new Set(); }
		};
	}
});
