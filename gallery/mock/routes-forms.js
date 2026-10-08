/*
 * routes-forms.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Gallery mock routes for the schema form and its field types:
 *   GET  /api/v1/schema/firewall/rules         rule editor schema
 *   GET  /api/v1/schema/firewall/aliases       alias editor schema (entries as entry-grid)
 *   GET  /api/v1/schema/services/ntp           NTP settings schema
 *   PUT  /api/v1/firewall/rules/{id}           adds checks for the advanced fields and refuses
 *   POST /api/v1/firewall/rules                system rules, then hands over to the core routes
 *   GET  /api/v1/firewall/aliases/{name}       one alias with its entries
 *   PUT  /api/v1/firewall/aliases/{name}       save (422 per entry: entries.N.value)
 *   POST /api/v1/firewall/aliases              create when the body has an entries array
 *                                              (other bodies go to the feedback route)
 *   GET  /api/v1/services/ntp                  NTP settings
 *   PUT  /api/v1/services/ntp                  save (422 on bad servers, orphan stratum…)
 *   GET  /api/v1/gallery/forms/options?set=    dynamic select options (interfaces, timezones)
 *   GET  /api/v1/gallery/forms/slow-schema     the alias schema after 8 s (loading state)
 *   POST /api/v1/gallery/forms/upload?name=    file upload (names containing "fail" fail)
 *   PUT  /api/v1/gallery/forms/demo            the all-fields demo (host name fw01 is taken)
 */
(function (M) {
	'use strict';

	function previous(method, sample) {
		var r = M.routes.find(function (x) { return x.method === method && x.re.test(sample); });
		return r ? r.handler : function () { return M.err(404, 'No mock route for ' + method + ' ' + sample); };
	}
	var coreRulePut = previous('PUT', '/api/v1/firewall/rules/1');
	var coreRulePost = previous('POST', '/api/v1/firewall/rules');
	var coreRuleGet = previous('GET', '/api/v1/firewall/rules/1');
	var feedbackAliasPost = previous('POST', '/api/v1/firewall/aliases');

	var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
	var V4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
	var V4NET = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}\/([12]?\d|3[0-2])$/;
	var HOST = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
	var PORT = /^\d{1,5}(:\d{1,5})?$/;

	/* ------------------------------------------------------------ options */

	var TZ = [
		['Europe', ['Amsterdam', 'Berlin', 'Copenhagen', 'Dublin', 'Helsinki', 'Lisbon', 'London', 'Madrid', 'Oslo', 'Paris', 'Rome', 'Stockholm', 'Vienna', 'Warsaw', 'Zurich']],
		['America', ['Chicago', 'Denver', 'Los_Angeles', 'New_York', 'Sao_Paulo', 'Toronto', 'Vancouver']],
		['Asia', ['Dubai', 'Kolkata', 'Singapore', 'Tokyo']],
		['Australia', ['Melbourne', 'Sydney']],
		['Etc', ['UTC']]
	];

	M.route('GET', '/api/v1/gallery/forms/options', function (p, q) {
		var set = q.get('set') || 'interfaces';
		if (set === 'interfaces') {
			var list = M.interfaces.map(function (i) { return { id: i.id, descr: i.descr, detail: i.if + (i.ipv4 ? ' · ' + i.ipv4 : '') }; });
			if (q.get('floating')) list.push({ id: 'floating', descr: 'Floating', detail: 'Rules for several interfaces at once' });
			return M.ok(list);
		}
		if (set === 'timezones') {
			var out = [];
			TZ.forEach(function (g) { g[1].forEach(function (c) { out.push({ id: g[0] + '/' + c, city: c.replace('_', ' '), region: g[0] }); }); });
			return M.ok(out);
		}
		return M.err(404, 'Unknown option set ' + set);
	});

	/* ------------------------------------------------------------ schemas */

	var PROTOCOLS = [
		{ value: 'any', label: 'Any', group: 'Common' }, { value: 'tcp', label: 'TCP', group: 'Common' }, { value: 'udp', label: 'UDP', group: 'Common' },
		{ value: 'tcp/udp', label: 'TCP/UDP', group: 'Common' }, { value: 'icmp', label: 'ICMP', group: 'Common' },
		{ value: 'esp', label: 'ESP', detail: 'IPsec payload', group: 'Other' }, { value: 'ah', label: 'AH', detail: 'IPsec authentication', group: 'Other' },
		{ value: 'gre', label: 'GRE', detail: 'Generic routing encapsulation', group: 'Other' }, { value: 'ipv6', label: 'IPV6', detail: 'IPv6 in IPv4', group: 'Other' },
		{ value: 'igmp', label: 'IGMP', group: 'Other' }, { value: 'pim', label: 'PIM', group: 'Other' }, { value: 'ospf', label: 'OSPF', group: 'Other' },
		{ value: 'sctp', label: 'SCTP', group: 'Other' }, { value: 'carp', label: 'CARP', detail: 'High availability', group: 'Other' }, { value: 'pfsync', label: 'PFSYNC', detail: 'State synchronisation', group: 'Other' }
	];
	var PORTED = ['tcp', 'udp', 'tcp/udp'];

	var RULE_SCHEMA = {
		resource: 'firewall/rules',
		title: 'Firewall rule',
		summary: '{action} [{ipproto} ][{protocol} ]traffic on {interface} from {source}[ port {source_port}] to {destination}[ port {destination_port}][, logged{log}]',
		summaryIcon: 'shield-halved',
		readonlyWhen: { field: 'system', truthy: true },
		readonlyText: 'This is a system rule and cannot be changed. It keeps the firewall reachable and safe.',
		sections: [
			{ id: 'rule', title: 'Rule', description: 'What happens to matching traffic, and where the rule applies.', fields: [
				{ name: 'action', type: 'segmented', label: 'Action', required: true, default: 'pass', width: 'full',
					help: 'Block drops packets silently; Reject also tells the sender the connection was refused.',
					options: [
						{ value: 'pass', label: 'Pass', icon: 'circle-check', tone: 'pass' },
						{ value: 'block', label: 'Block', icon: 'ban', tone: 'block' },
						{ value: 'reject', label: 'Reject', icon: 'circle-minus', tone: 'reject' }
					] },
				{ name: 'interface', type: 'select', label: 'Interface', required: true, width: 'half',
					options: { source: { path: '/v1/gallery/forms/options', query: { set: 'interfaces', floating: 1 } }, value: 'id', label: 'descr', detail: 'detail' } },
				{ name: 'direction', type: 'segmented', label: 'Direction', width: 'half', default: 'in', visibleWhen: { field: 'interface', equals: 'floating' },
					options: [{ value: 'in', label: 'In' }, { value: 'out', label: 'Out' }, { value: 'any', label: 'Any' }] },
				{ name: 'ipproto', type: 'select', label: 'Address family', width: 'half', default: 'inet',
					options: [{ value: 'inet', label: 'IPv4' }, { value: 'inet6', label: 'IPv6' }, { value: 'inet46', label: 'IPv4 + IPv6' }] },
				{ name: 'protocol', type: 'select', label: 'Protocol', width: 'half', default: 'tcp', required: true, options: PROTOCOLS },
				{ name: 'enabled', type: 'switch', label: 'Enabled', text: 'Apply this rule', default: true, width: 'half' }
			] },
			{ id: 'source', title: 'Source', description: 'Where the traffic comes from.', fields: [
				{ name: 'source', type: 'address', label: 'Address', required: true, default: 'any', invert: true, width: 'two-thirds',
					placeholder: 'any, 192.0.2.10, 10.0.0.0/24, an alias…' },
				{ name: 'source_port', type: 'port', label: 'Port', width: 'third', emptyValue: 'any',
					visibleWhen: { field: 'protocol', in: PORTED }, help: 'Usually any: clients pick a random source port.' }
			] },
			{ id: 'destination', title: 'Destination', description: 'Where the traffic goes to.', fields: [
				{ name: 'destination', type: 'address', label: 'Address', required: true, default: 'any', invert: true, width: 'two-thirds',
					placeholder: 'any, 192.0.2.10, 10.0.0.0/24, an alias…' },
				{ name: 'destination_port', type: 'port', label: 'Port', width: 'third', emptyValue: 'any',
					visibleWhen: { field: 'protocol', in: PORTED } }
			] },
			{ id: 'options', title: 'Options', fields: [
				{ name: 'descr', type: 'text', label: 'Description', maxLength: 52, placeholder: 'e.g. Allow web servers from the internet',
					help: 'Shown in the rule list and in the firewall log.' },
				{ name: 'log', type: 'switch', label: 'Log', text: 'Log packets that match this rule', width: 'half',
					help: 'The firewall log keeps a limited history; log only what you need.' },
				{ name: 'schedule', type: 'select', label: 'Schedule', width: 'half', placeholder: 'Always active',
					options: [{ value: 'WorkHours', label: 'WorkHours', detail: 'Mon–Fri 08:00–18:00' }, { value: 'Weekends', label: 'Weekends', detail: 'Sat–Sun all day' }, { value: 'NightlyBackup', label: 'NightlyBackup', detail: 'Daily 01:00–04:00' }] },
				{ name: 'gateway', type: 'select', label: 'Gateway', width: 'half', default: 'default', visibleWhen: { field: 'action', equals: 'pass' },
					help: 'Policy routing: send matching traffic through this gateway.',
					options: { source: { path: '/v1/status/gateways' }, value: 'name', label: 'name', detail: 'address', prepend: [{ value: 'default', label: 'Default', detail: 'Use the routing table' }] } }
			] },
			{ id: 'advanced', title: 'Advanced options', advanced: true, description: 'State tracking, limits and tags. The defaults suit almost every rule.', fields: [
				{ name: 'state_type', type: 'select', label: 'State type', width: 'half', default: 'keep',
					options: [{ value: 'keep', label: 'Keep state', detail: 'Default' }, { value: 'sloppy', label: 'Sloppy state', detail: 'Asymmetric routing' }, { value: 'synproxy', label: 'Synproxy', detail: 'TCP only' }, { value: 'none', label: 'None' }] },
				{ name: 'max_states', type: 'number', label: 'Maximum states', width: 'half', min: 1, max: 1000000, unit: 'states', placeholder: 'No limit' },
				{ name: 'tag', type: 'text', label: 'Tag', width: 'half', mono: true, pattern: '^[A-Za-z0-9_]{0,32}$',
					patternMessage: 'Use up to 32 letters, digits and underscores.', help: 'Mark matching packets for NAT or other rules.' },
				{ name: 'quick', type: 'switch', label: 'Quick', text: 'Stop at the first match', default: true, width: 'half', visibleWhen: { field: 'interface', equals: 'floating' } },
				{ name: 'tcp_flags', type: 'checklist', label: 'TCP flags that must be set', visibleWhen: { field: 'protocol', in: ['tcp', 'tcp/udp'] },
					options: ['FIN', 'SYN', 'RST', 'PSH', 'ACK', 'URG', 'ECE', 'CWR'] }
			] }
		]
	};

	var ALIAS_SCHEMA = {
		resource: 'firewall/aliases',
		title: 'Alias',
		sections: [
			{ id: 'alias', title: 'Alias', description: 'A named list of hosts, networks, ports or URLs that rules can use.', fields: [
				{ name: 'name', type: 'text', label: 'Name', required: true, mono: true, width: 'half', pattern: '^[A-Za-z][A-Za-z0-9_]{0,30}$',
					patternMessage: 'Use letters, digits and underscores, starting with a letter (max. 31).', help: 'Rules refer to the alias by this name.' },
				{ name: 'type', type: 'select', label: 'Type', required: true, width: 'half', default: 'host',
					options: [{ value: 'host', label: 'Hosts' }, { value: 'network', label: 'Networks' }, { value: 'port', label: 'Ports' }, { value: 'url', label: 'URL table' }] },
				{ name: 'descr', type: 'text', label: 'Description', maxLength: 64 },
				{ name: 'update_freq', type: 'number', label: 'Refresh every', unit: 'days', min: 1, max: 365, default: 1, width: 'half', visibleWhen: { field: 'type', equals: 'url' } }
			] },
			{ id: 'entries', title: 'Entries', description: 'One address, network, port or URL per row. Order is kept.', fields: [
				{ name: 'entries', type: 'entry-grid', label: 'Entries', min: 1, max: 200, addLabel: 'Add entry', fields: [
					{ name: 'value', type: 'text', label: 'Value', required: true, mono: true, width: 'lg', placeholder: '192.0.2.10' },
					{ name: 'descr', type: 'text', label: 'Description', width: 'lg', placeholder: 'Optional' }
				] }
			] }
		]
	};

	var NTP_SCHEMA = {
		resource: 'services/ntp',
		title: 'NTP',
		sections: [
			{ id: 'general', title: 'General', fields: [
				{ name: 'enable', type: 'switch', label: 'NTP server', text: 'Serve time to clients on the selected interfaces', default: true },
				{ name: 'interfaces', type: 'checklist', label: 'Interfaces', enabledWhen: { field: 'enable', truthy: true },
					help: 'Clients on these interfaces can query this firewall. Choose none to listen on all.',
					options: { source: { path: '/v1/gallery/forms/options', query: { set: 'interfaces' } }, value: 'id', label: 'descr', detail: 'detail' } },
				{ name: 'orphan', type: 'number', label: 'Orphan mode stratum', width: 'half', min: 1, max: 15, default: 12,
					help: 'Stratum to announce when no time server can be reached.' },
				{ name: 'timezone', type: 'select', label: 'Time zone', width: 'half', required: true,
					options: { source: { path: '/v1/gallery/forms/options', query: { set: 'timezones' } }, value: 'id', label: 'city', group: 'region' } }
			] },
			{ id: 'servers', title: 'Time servers', description: 'The firewall syncs its clock with these servers. Use at least three for a reliable time.', fields: [
				{ name: 'servers', type: 'entry-grid', label: 'Servers', min: 1, max: 10, addLabel: 'Add server', fields: [
					{ name: 'address', type: 'text', label: 'Server', required: true, mono: true, width: 'xl', placeholder: 'pool.ntp.org' },
					{ name: 'pool', type: 'switch', label: 'Pool', width: 'auto' },
					{ name: 'prefer', type: 'switch', label: 'Prefer', width: 'auto' },
					{ name: 'noselect', type: 'switch', label: 'Monitor only', width: 'auto' }
				] }
			] },
			{ id: 'logging', title: 'Logging', fields: [
				{ name: 'log_peer', type: 'switch', label: 'Peer messages', text: 'Log messages about time servers', width: 'half' },
				{ name: 'log_sys', type: 'switch', label: 'System messages', text: 'Log clock adjustments', width: 'half' },
				{ name: 'stats', type: 'segmented', label: 'Statistics', default: 'off', options: [{ value: 'off', label: 'Off' }, { value: 'loop', label: 'Loop' }, { value: 'all', label: 'Loop + peers' }],
					help: 'Statistics files are written to /var/log/ntp and rotated daily.' }
			] },
			{ id: 'advanced', title: 'Advanced', advanced: true, description: 'Access restrictions and the leap second file.', fields: [
				{ name: 'restrict', type: 'checklist', label: 'Access restrictions', options: [
					{ value: 'kod', label: 'Kiss-o\'-death', detail: 'Tell abusive clients to slow down' },
					{ value: 'nomodify', label: 'No modify', detail: 'Refuse ntpq/ntpdc changes' },
					{ value: 'noquery', label: 'No query', detail: 'Refuse ntpq/ntpdc status queries' },
					{ value: 'noserve', label: 'No serve', detail: 'Refuse time requests' },
					{ value: 'nopeer', label: 'No peer', detail: 'Refuse peer associations' },
					{ value: 'notrap', label: 'No trap', detail: 'Refuse mode 6 trap service' }
				] },
				{ name: 'leapsec', type: 'textarea', label: 'Leap seconds', code: true, rows: 5, placeholder: '#$ 3676924800\n#@ 3881174400\n3692217600 37 # 1 Jan 2017',
					help: 'Paste the contents of a leap-seconds.list file. Leave empty to use the built-in list.' }
			] }
		]
	};

	M.route('GET', '/api/v1/schema/firewall/rules', function () { return M.ok(RULE_SCHEMA); });
	M.route('GET', '/api/v1/schema/firewall/aliases', function () { return M.ok(ALIAS_SCHEMA); });
	M.route('GET', '/api/v1/schema/services/ntp', function () { return M.ok(NTP_SCHEMA); });
	M.route('GET', '/api/v1/gallery/forms/slow-schema', function () { return Object.assign(M.ok(ALIAS_SCHEMA), { delay: 8000 }); });

	/* -------------------------------------------------------------- rules */

	/* Checks for the fields the core mock does not know; the core validates the rest and saves. */
	function ruleExtraErrors(b) {
		var e = {};
		if (b.max_states != null && !(Math.floor(b.max_states) === b.max_states && b.max_states >= 1 && b.max_states <= 1000000)) e.max_states = 'Use a whole number from 1 to 1,000,000.';
		if (b.tag && !/^[A-Za-z0-9_]{1,32}$/.test(b.tag)) e.tag = 'Use up to 32 letters, digits and underscores.';
		if (b.state_type === 'synproxy' && b.protocol !== 'tcp') e.state_type = 'Synproxy only works with TCP.';
		if (b.interface === 'floating' && !b.direction) e.direction = 'Choose a direction for a floating rule.';
		return e;
	}
	M.route('PUT', '/api/v1/firewall/rules/{id}', function (p, q, b) {
		var cur = coreRuleGet({ id: p.id });
		if (cur.status === 200 && cur.body.data.system) return M.err(409, 'System rules cannot be changed.');
		var e = ruleExtraErrors(b || {});
		if (Object.keys(e).length) return M.err(422, 'Fix the highlighted fields.', e);
		return coreRulePut(p, q, b);
	});
	M.route('POST', '/api/v1/firewall/rules', function (p, q, b) {
		var e = ruleExtraErrors(b || {});
		if (Object.keys(e).length) return M.err(422, 'Fix the highlighted fields.', e);
		return coreRulePost(p, q, b);
	});

	/* ------------------------------------------------------------ aliases */

	function A(name, type, descr, entries) { return { name: name, type: type, descr: descr, entries: entries.map(function (x) { return { value: x[0], descr: x[1] || '' }; }) }; }
	var ALIASES = {
		ADMIN_HOSTS: A('ADMIN_HOSTS', 'host', 'Workstations allowed to administer', [['192.168.1.31', 'admin-laptop'], ['192.168.1.32', 'office-pc'], ['10.99.0.2', 'site VPN jump host']]),
		DNS_SERVERS: A('DNS_SERVERS', 'host', 'Approved resolvers', [['192.168.1.1', 'this firewall'], ['9.9.9.9', 'Quad9']]),
		MAIL_PORTS: A('MAIL_PORTS', 'port', 'SMTP, Submission, IMAPS', [['25', 'SMTP'], ['587', 'Submission'], ['993', 'IMAPS']]),
		SSH_ADMIN: A('SSH_ADMIN', 'port', 'SSH on 22 and 2222', [['22', 'SSH'], ['2222', 'SSH (alternate)']]),
		RFC1918_ALL: A('RFC1918_ALL', 'network', 'All private ranges', [['10.0.0.0/8', ''], ['172.16.0.0/12', ''], ['192.168.0.0/16', '']]),
		WEB_SERVERS: A('WEB_SERVERS', 'host', 'DMZ web tier', [['172.16.40.10', 'web01'], ['172.16.40.12', 'web02']]),
		CROWDSEC_BLOCKLIST: Object.assign(A('CROWDSEC_BLOCKLIST', 'url', 'Community blocklist (auto)', [['https://blocklists.example.org/crowdsec.txt', 'Refreshed by the CrowdSec bouncer']]), { update_freq: 1 }),
		IOT_DEVICES: A('IOT_DEVICES', 'host', 'Everything on the IOT VLAN that needs Home Assistant', [])
	};
	for (var n = 1; n <= 36; n++) ALIASES.IOT_DEVICES.entries.push({ value: '10.30.0.' + (10 + n), descr: ['thermostat', 'doorbell', 'plug', 'bulb', 'sensor', 'camera'][n % 6] + '-' + n });

	function aliasErrors(b, renameFrom) {
		var e = {};
		var name = String(b.name || '');
		if (!/^[A-Za-z][A-Za-z0-9_]{0,30}$/.test(name)) e.name = 'Use letters, digits and underscores, starting with a letter (max. 31).';
		else if (name.toUpperCase() !== String(renameFrom || '').toUpperCase()) {
			var core = M.dispatch('GET', '/api/v1/firewall/aliases', new URLSearchParams(), null).body.data || [];
			if (ALIASES[name.toUpperCase()] || core.some(function (a) { return a.name.toUpperCase() === name.toUpperCase(); })) e.name = 'An alias named ' + name + ' already exists.';
		}
		if (['host', 'network', 'port', 'url'].indexOf(b.type) < 0) e.type = 'Choose a type.';
		if ((b.descr || '').length > 64) e.descr = 'Keep the description to 64 characters.';
		var rows = Array.isArray(b.entries) ? b.entries : [];
		if (!rows.length) e.entries = 'Add at least one entry.';
		var seen = {};
		rows.forEach(function (r, i) {
			var v = String((r && r.value) || '').trim();
			var ok = b.type === 'host' ? V4.test(v) || (HOST.test(v) && /[a-z]/i.test(v))
				: b.type === 'network' ? V4NET.test(v) || V4.test(v)
					: b.type === 'port' ? PORT.test(v) && v.split(':').every(function (x) { return +x >= 1 && +x <= 65535; })
						: /^https?:\/\/\S+$/.test(v);
			if (!v) e['entries.' + i + '.value'] = 'Enter a value or remove the row.';
			else if (!ok) e['entries.' + i + '.value'] = { host: 'Not an IPv4 address or host name.', network: 'Not a network in CIDR form (10.0.0.0/24).', port: 'Not a port (443) or range (8000:8100).', url: 'Enter an http(s) URL.' }[b.type] || 'Not valid for this type.';
			else if (seen[v]) e['entries.' + i + '.value'] = 'Already listed in row ' + seen[v] + '.';
			seen[v] = seen[v] || i + 1;
			if (r && r.descr && r.descr.length > 40) e['entries.' + i + '.descr'] = 'Keep it to 40 characters.';
		});
		if (b.type === 'url' && !(b.update_freq >= 1 && b.update_freq <= 365)) e.update_freq = 'Use 1 to 365 days.';
		return e;
	}

	M.route('GET', '/api/v1/firewall/aliases/{name}', function (p) {
		var a = ALIASES[p.name.toUpperCase()];
		return a ? M.ok(clone(a)) : M.err(404, 'Alias ' + p.name + ' does not exist.');
	});
	M.route('PUT', '/api/v1/firewall/aliases/{name}', function (p, q, b) {
		var cur = ALIASES[p.name.toUpperCase()];
		if (!cur) return M.err(404, 'Alias ' + p.name + ' does not exist.');
		var e = aliasErrors(b || {}, p.name);
		if (Object.keys(e).length) return M.err(422, 'Fix the highlighted fields.', e);
		delete ALIASES[p.name.toUpperCase()];
		ALIASES[b.name.toUpperCase()] = clone(b);
		return M.ok(b, { message: 'Alias ' + b.name + ' saved', pending: true });
	});
	M.route('POST', '/api/v1/firewall/aliases', function (p, q, b) {
		if (!b || !Array.isArray(b.entries)) return feedbackAliasPost(p, q, b);
		var e = aliasErrors(b, null);
		if (Object.keys(e).length) return M.err(422, 'Fix the highlighted fields.', e);
		ALIASES[b.name.toUpperCase()] = clone(b);
		return M.ok(b, { message: 'Alias ' + b.name + ' created', pending: true });
	});

	/* ---------------------------------------------------------------- NTP */

	var NTP = {
		enable: true, interfaces: ['lan', 'opt2'], orphan: 12, timezone: 'Europe/Copenhagen',
		servers: [{ address: '0.freesense.pool.ntp.org', pool: true, prefer: false, noselect: false }, { address: 'time.cloudflare.com', pool: false, prefer: true, noselect: false }, { address: '192.0.2.123', pool: false, prefer: false, noselect: true }],
		log_peer: false, log_sys: true, stats: 'off', restrict: ['kod', 'nomodify', 'noquery', 'nopeer', 'notrap'], leapsec: ''
	};
	M.route('GET', '/api/v1/services/ntp', function () { return M.ok(clone(NTP)); });
	M.route('PUT', '/api/v1/services/ntp', function (p, q, b) {
		b = b || {};
		var e = {};
		var servers = Array.isArray(b.servers) ? b.servers : [];
		if (!servers.length) e.servers = 'Add at least one time server.';
		servers.forEach(function (s, i) {
			var v = String((s && s.address) || '');
			if (!(V4.test(v) || (HOST.test(v) && /[a-z]/i.test(v)))) e['servers.' + i + '.address'] = 'Enter a host name or an IPv4 address.';
			if (s && s.pool && V4.test(v)) e['servers.' + i + '.pool'] = 'A pool needs a host name, not an address.';
		});
		if (servers.filter(function (s) { return s && s.prefer; }).length > 1) e.servers = 'Prefer only one server.';
		if (b.orphan != null && !(b.orphan >= 1 && b.orphan <= 15)) e.orphan = 'Use a stratum from 1 to 15.';
		if (b.leapsec && !/^(\s*(#.*|\d+\s+\d+.*)?\s*\n?)*$/.test(b.leapsec)) e.leapsec = 'This does not look like a leap-seconds.list file.';
		if (Object.keys(e).length) return M.err(422, 'Fix the highlighted fields.', e);
		Object.assign(NTP, b);
		return M.ok(clone(NTP), { message: 'NTP settings saved; ntpd restarted' });
	});

	/* --------------------------------------------------- uploads and demo */

	M.route('POST', '/api/v1/gallery/forms/upload', function (p, q) {
		var name = q.get('name') || 'upload.bin';
		if (/fail/i.test(name)) return Object.assign(M.err(422, 'The file could not be stored (simulated).'), { delay: 900 });
		return Object.assign(M.ok({ id: 'upl-' + Math.random().toString(36).slice(2, 10), name: name, size: +q.get('size') || null }), { delay: 1400 });
	});
	M.route('PUT', '/api/v1/gallery/forms/demo', function (p, q, b) {
		b = b || {};
		if (b.hostname === 'fw01') return M.err(422, 'Fix the highlighted fields.', { hostname: 'That host name is already used by another device.', 'peers.0.endpoint': 'This endpoint does not answer (simulated).' });
		return M.ok(b, { message: 'Demo settings saved' });
	});
})(window.FSMock);
