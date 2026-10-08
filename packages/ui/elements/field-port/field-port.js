/*
 * field-port.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * field-port — a TCP/UDP port (443), a range (8000:8100; "8000-8100" is
 * accepted and normalised) or a port alias. Empty means any; the value for
 * "any" is `emptyValue` (default ''). Suggests port aliases and well-known
 * services. Registered as schema type `port`.
 */
import $ from 'jquery';
import { defineField, textInput, affix, t } from '../form/fields.js';
import { suggest } from '../field-typeahead/suggest.js';
import { aliasSuggestions } from '../field-address/field-address.js';

export const SERVICES = [
	['HTTPS', 443], ['HTTP', 80], ['SSH', 22], ['DNS', 53], ['DNS over TLS', 853], ['NTP', 123], ['SMTP', 25],
	['Submission', 587], ['IMAPS', 993], ['POP3S', 995], ['RDP', 3389], ['OpenVPN', 1194], ['WireGuard', 51820],
	['IPsec NAT-T', 4500], ['SNMP', 161], ['Syslog', 514], ['LDAPS', 636], ['MySQL', 3306], ['PostgreSQL', 5432], ['HTTP alt', 8080], ['HTTPS alt', 8443]
];

/** Strip a trailing " (NAME)" label and normalise a-b to a:b. */
export function normalisePort(v) {
	return String(v ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim().replace(/^(\d+)\s*-\s*(\d+)$/, '$1:$2');
}

export function classifyPort(raw) {
	const v = normalisePort(raw);
	if (!v || v === 'any') return { kind: 'any', label: t('Any') };
	let m = /^(\d{1,5})$/.exec(v);
	if (m) return +m[1] >= 1 && +m[1] <= 65535 ? { kind: 'port', label: SERVICES.find((s) => s[1] === +m[1])?.[0] || t('Port') } : { kind: 'invalid', label: t('Not valid'), error: t('Ports go from 1 to 65535.') };
	m = /^(\d{1,5}):(\d{1,5})$/.exec(v);
	if (m) {
		if (+m[1] < 1 || +m[2] > 65535) return { kind: 'invalid', label: t('Not valid'), error: t('Ports go from 1 to 65535.') };
		if (+m[1] >= +m[2]) return { kind: 'invalid', label: t('Not valid'), error: t('The range start must be lower than the end.') };
		return { kind: 'range', label: t('{n} ports', { n: +m[2] - +m[1] + 1 }) };
	}
	if (/^\d{1,5}(:\d{1,5})?(\s*,\s*\d{1,5}(:\d{1,5})?)+$/.test(v)) {
		const bad = v.split(',').map((x) => classifyPort(x.trim())).find((k) => k.kind === 'invalid');
		return bad || { kind: 'list', label: t('{n} ports', { n: v.split(',').length }) };
	}
	if (/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(v)) return { kind: 'alias', label: t('Alias') };
	return { kind: 'invalid', label: t('Not valid') };
}

defineField('port', {
	build(f, c) {
		const allowRange = f.range !== false;
		const allowAlias = f.alias !== false;
		const empty = f.emptyValue ?? '';
		const $in = textInput({ ...f, mono: f.mono !== false, placeholder: f.placeholder ?? (f.required ? '443' : t('any')) }, c)
			.attr({ inputmode: allowAlias ? null : 'numeric', spellcheck: 'false' });
		const $kind = $('<span class="input-group-text fs-addr-kind" aria-hidden="true">');
		const $el = affix($in, f, { $after: $kind }).addClass('fs-addr fs-port');
		function showKind() {
			const k = classifyPort($in.val());
			const blank = !$in.val().trim();
			$kind.text(blank ? '' : k.label).attr('data-kind', k.kind).prop('hidden', blank);
			$el.attr('data-kind', blank ? 'empty' : k.kind);
		}
		const s = suggest($in, $el, {
			fetch: (q) => {
				const ql = q.toLowerCase();
				const svc = SERVICES.filter(([n, p]) => !ql || n.toLowerCase().includes(ql) || String(p).startsWith(ql))
					.map(([n, p]) => ({ value: String(p), label: String(p), detail: n, group: t('Services') }));
				return (allowAlias ? aliasSuggestions(q, ['port']) : Promise.resolve([])).then((al) => [...al, ...svc]);
			},
			onPick: (it) => { $in.val(it.value); showKind(); c.change(); },
			labelledBy: c.compact ? null : c.labelId,
			label: c.ariaLabel,
			minChars: 0
		});
		$in.on('input', () => { showKind(); c.change(); });
		$in.on('blur', () => { const n = normalisePort($in.val()); if (n !== $in.val()) { $in.val(n); showKind(); } });
		return {
			$el,
			$focus: $in,
			get() { const v = normalisePort($in.val()); return v === '' || v === 'any' ? empty : v; },
			set(v) { const n = normalisePort(v); $in.val(n === 'any' || n === String(empty) ? '' : n); showKind(); },
			setDisabled(b) { $in.prop('disabled', b); if (b) s.close(); },
			validate(v) {
				if (v === empty) return null;
				const k = classifyPort(v);
				if (k.kind === 'invalid') return k.error || t('Use a port (443), a range (8000:8100) or a port alias.');
				if ((k.kind === 'range' || k.kind === 'list') && !allowRange) return t('Enter a single port.');
				if (k.kind === 'alias' && !allowAlias) return t('Enter a port number.');
				return null;
			},
			display: (v) => (v === empty || v === 'any' ? '' : v),
			destroy: () => s.destroy()
		};
	}
});
