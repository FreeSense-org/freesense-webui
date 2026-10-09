/*
 * field-address.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * field-address — an address as firewall rules use it: any, an IPv4/IPv6
 * host, a network in CIDR form, a host name, an alias or an interface
 * network ("LAN net", "WAN address", "This Firewall"). Validates as you type
 * and shows what it understood (Host, Network, Alias…) next to the input.
 * Suggests aliases from /v1/firewall/aliases?q= and interface networks.
 * `invert: true` adds a "not" toggle (value prefixed with "!").
 * Registered as schema type `address`.
 */
import $ from 'jquery';
import { batch } from '../../js/batch.js';
import { defineField, textInput, affix, t } from '../form/fields.js';
import { suggest } from '../field-typeahead/suggest.js';

const V4 = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)(\\.(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)){3}';
const RE = {
	v4: new RegExp(`^${V4}$`),
	v4net: new RegExp(`^${V4}/([12]?\\d|3[0-2])$`),
	alias: /^[A-Z][A-Z0-9_]{0,31}$|^[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]*$/,
	host: /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.?$/i,
	iface: /^[A-Za-z0-9_]+ (net|address)$/i
};

export function isIPv6(v) {
	if (!v.includes(':') || !/^[0-9a-f:.]+$/i.test(v)) return false;
	const halves = v.split('::');
	if (halves.length > 2) return false;
	const split = (h) => (h ? h.split(':') : []);
	const all = [...split(halves[0]), ...(halves.length === 2 ? split(halves[1]) : [])];
	let n = 0;
	for (let i = 0; i < all.length; i++) {
		const g = all[i];
		if (g.includes('.')) {
			if (i !== all.length - 1 || !RE.v4.test(g)) return false;
			n += 2;
		} else if (/^[0-9a-f]{1,4}$/i.test(g)) n++;
		else return false;
	}
	return halves.length === 2 ? n <= 7 : n === 8;
}

/** What an address string is: {kind, label} with kind any|iface|ip|network|alias|fqdn|invalid. */
export function classifyAddress(raw) {
	const v = String(raw || '').trim();
	if (!v) return { kind: 'empty', label: '' };
	if (v.toLowerCase() === 'any') return { kind: 'any', label: t('Any') };
	if (v === 'This Firewall' || RE.iface.test(v)) return { kind: 'iface', label: t('Interface') };
	if (RE.v4.test(v)) return { kind: 'ip', label: t('Host') };
	if (RE.v4net.test(v)) return { kind: 'network', label: t('Network') };
	const [a6, p6] = v.split('/');
	if (isIPv6(a6) && (p6 === undefined || (/^\d{1,3}$/.test(p6) && +p6 <= 128))) return p6 === undefined ? { kind: 'ip', label: t('IPv6 host') } : { kind: 'network', label: t('IPv6 network') };
	if (RE.alias.test(v)) return { kind: 'alias', label: t('Alias') };
	if (RE.host.test(v) && /[a-z]/i.test(v)) return { kind: 'fqdn', label: t('Host name') };
	return { kind: 'invalid', label: t('Not valid') };
}

const KIND_TEXT = {
	any: 'any', iface: 'an interface network', ip: 'a host address', network: 'a network', alias: 'an alias', fqdn: 'a host name'
};

let ifaces = null;
let ifacesAt = 0;
/** Interface networks ("LAN net", "LAN address"), cached for a minute. */
export function interfaceNets() {
	if (!ifaces || Date.now() - ifacesAt > 60000) {
		ifacesAt = Date.now();
		/* /v1/status/interfaces: {name, description, ipaddr, subnet (dotted), ipaddrv6, subnetv6}. */
		const bits = (m) => String(m).split('.').reduce((n, o) => n + (Number(o) >>> 0).toString(2).replace(/0/g, '').length, 0);
		ifaces = batch.get('/v1/status/interfaces').then((r) => (r.data || []).filter((i) => i.ipaddr || i.ipaddrv6).flatMap((i) => {
			const net = i.ipaddr ? `${i.ipaddr}${i.subnet ? `/${bits(i.subnet)}` : ''}` : `${i.ipaddrv6}${i.subnetv6 ? `/${i.subnetv6}` : ''}`;
			const name = i.description || i.name;
			return [
				{ value: `${name} net`, label: `${name} net`, detail: net, group: t('Interfaces') },
				{ value: `${name} address`, label: `${name} address`, detail: i.ipaddr || i.ipaddrv6, group: t('Interfaces') }
			];
		}), () => []);
	}
	return ifaces;
}

/** Aliases matching q, limited to the given types. */
export function aliasSuggestions(q, types) {
	return batch.get('/v1/firewall/aliases', q ? { q } : null).then((r) => (r.data || [])
		.filter((a) => !types || types.includes(a.type))
		.map((a) => ({ value: a.name, label: a.name, detail: a.descr, group: t('Aliases') })), () => []);
}

defineField('address', {
	build(f, c) {
		const allow = f.allow || ['any', 'iface', 'ip', 'network', 'alias', 'fqdn'];
		const $in = textInput({ ...f, mono: f.mono !== false }, c).attr('spellcheck', 'false');
		const $kind = $('<span class="input-group-text fs-addr-kind" aria-hidden="true">');
		let $not = null;
		if (f.invert) {
			$not = $('<button type="button" class="btn btn-secondary fs-addr-not" aria-pressed="false">')
				.attr('title', t('Invert match: everything except this address')).append($('<span>').text(t('Not')))
				.on('click', () => { $not.attr('aria-pressed', $not.attr('aria-pressed') === 'true' ? 'false' : 'true'); c.change(); });
		}
		const $el = affix($in, f, { $before: $not, $after: $kind }).addClass('fs-addr');
		function showKind() {
			const k = classifyAddress($in.val());
			$kind.text(k.label).attr('data-kind', k.kind).prop('hidden', !k.label);
			$el.attr('data-kind', k.kind);
		}
		const s = suggest($in, $el, {
			fetch: (q) => {
				const ql = q.toLowerCase();
				const special = [
					allow.includes('any') ? { value: 'any', label: 'any', detail: t('Every address'), group: t('Special') } : null,
					allow.includes('iface') ? { value: 'This Firewall', label: 'This Firewall', detail: t('Every address of this firewall'), group: t('Special') } : null
				].filter(Boolean);
				return Promise.all([
					allow.includes('iface') ? interfaceNets() : [],
					allow.includes('alias') ? aliasSuggestions(q, f.aliasTypes || ['host', 'network', 'urltable']) : []
				]).then(([nets, aliases]) => [...special, ...nets].filter((x) => !ql || `${x.label} ${x.detail || ''}`.toLowerCase().includes(ql)).concat(aliases));
			},
			onPick: (it) => { $in.val(it.value); showKind(); c.change(); },
			labelledBy: c.compact ? null : c.labelId,
			label: c.ariaLabel,
			minChars: 0
		});
		$in.on('input', () => { showKind(); c.change(); });
		const inverted = () => !!$not && $not.attr('aria-pressed') === 'true';
		return {
			$el,
			$focus: $in,
			get() { const v = $in.val().trim(); return v && inverted() ? `!${v}` : v; },
			set(v) {
				let s2 = String(v ?? '');
				const neg = s2.startsWith('!');
				if (neg) s2 = s2.slice(1);
				$in.val(s2);
				if ($not) $not.attr('aria-pressed', neg ? 'true' : 'false');
				showKind();
			},
			setDisabled(b) { $in.prop('disabled', b); if ($not) $not.prop('disabled', b); if (b) s.close(); },
			validate(v) {
				const k = classifyAddress(String(v).replace(/^!/, ''));
				if (k.kind === 'invalid') return f.invalidMessage || t('Enter any, an address, a network in CIDR form, a host name or an alias.');
				if (!allow.includes(k.kind)) return t('{kind} is not allowed here.', { kind: t(KIND_TEXT[k.kind] || k.kind).replace(/^./, (m) => m.toUpperCase()) });
				return null;
			},
			display: (v) => (String(v).startsWith('!') ? `${t('not')} ${String(v).slice(1)}` : v),
			destroy: () => s.destroy()
		};
	}
});
