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
 *   GET  /api/v1/schema/firewall/aliases       alias schema, as the API serves it
 *   GET  /api/v1/schema/services/ntp           NTP schema, as the API serves it (interfaces from the mock)
 *   PUT  /api/v1/firewall/rules/{id}           adds checks for the advanced fields and refuses
 *   POST /api/v1/firewall/rules                system rules, then hands over to the core routes
 *   GET    /api/v1/firewall/aliases           {name, type, description, entries: [{address, detail}], update_frequency?}
 *   GET    /api/v1/firewall/aliases/{name}    one alias (404 when missing)
 *   POST   /api/v1/firewall/aliases           create (201; 422 per entry: entries.N.address)
 *   PUT    /api/v1/firewall/aliases/{name}    update; omitted fields keep their value, "name" renames
 *   DELETE /api/v1/firewall/aliases/{name}    delete (409 while RFC1918_ALL is used by rules)
 *   GET    /api/v1/services/ntp               NTP settings with the *_choices maps, as the API
 *   PUT    /api/v1/services/ntp               save (422 on bad servers, orphan stratum…)
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

	/* The schemas exactly as GET /api/v1/schema/... returns them on a firewall. */
	var ALIAS_SCHEMA = {
		"title": "Alias",
		"summary": "{type} alias {name}[ with {entries}]",
		"summaryIcon": "tags",
		"sections": [
			{
				"id": "general",
				"title": "General",
				"fields": [
					{
						"name": "name",
						"type": "text",
						"label": "Name",
						"required": true,
						"mono": true,
						"width": "half",
						"maxLength": 31,
						"pattern": "^[A-Za-z0-9_]+$",
						"patternMessage": "Use letters, digits and underscores only.",
						"help": "Used in rules instead of the addresses or ports it contains."
					},
					{
						"name": "type",
						"type": "select",
						"label": "Type",
						"required": true,
						"width": "half",
						"default": "host",
						"options": [
							{
								"value": "host",
								"label": "Host(s)",
								"group": "Addresses"
							},
							{
								"value": "network",
								"label": "Network(s)",
								"group": "Addresses"
							},
							{
								"value": "port",
								"label": "Port(s)",
								"group": "Ports"
							},
							{
								"value": "url",
								"label": "URL (IPs)",
								"group": "Downloaded lists"
							},
							{
								"value": "url_ports",
								"label": "URL (Ports)",
								"group": "Downloaded lists"
							},
							{
								"value": "urltable",
								"label": "URL Table (IPs)",
								"group": "Downloaded lists"
							},
							{
								"value": "urltable_ports",
								"label": "URL Table (Ports)",
								"group": "Downloaded lists"
							}
						]
					},
					{
						"name": "description",
						"type": "text",
						"label": "Description",
						"maxLength": 200,
						"help": "For your reference (not parsed)."
					}
				]
			},
			{
				"id": "entries",
				"title": "Entries",
				"description": "Hosts, networks (CIDR), ranges (a-b), ports, port ranges (a:b), other aliases, or URLs for downloaded lists.",
				"fields": [
					{
						"name": "entries",
						"type": "entry-grid",
						"label": "Entries",
						"min": 0,
						"max": 5000,
						"reorder": true,
						"addLabel": "Add entry",
						"emptyText": "No entries yet.",
						"fields": [
							{
								"name": "address",
								"type": "text",
								"label": "Entry",
								"mono": true,
								"required": true,
								"width": "lg"
							},
							{
								"name": "detail",
								"type": "text",
								"label": "Description",
								"width": "lg"
							}
						]
					},
					{
						"name": "update_frequency",
						"type": "number",
						"label": "Update frequency",
						"min": 1,
						"max": 365,
						"unit": "days",
						"width": "third",
						"visibleWhen": {
							"field": "type",
							"in": [
								"urltable",
								"urltable_ports"
							]
						},
						"help": "How often the list is downloaded again."
					}
				]
			}
		],
		"resource": "firewall/aliases"
	};

	function ntpSchema() {
		return {
			"title": "NTP server",
			"order": [
				"general",
				"servers",
				"logging",
				"auth",
				"advanced"
			],
			"sections": [
				{
					"id": "general",
					"title": "General",
					"fields": [
						{
							"name": "enable",
							"type": "switch",
							"label": "NTP server",
							"text": "Serve time to clients"
						},
						{
							"name": "interface",
							"type": "checklist",
							"label": "Interfaces",
							"options": ntpInterfaces().map(function (i) { return { value: i[0], label: i[1] }; }),
							"help": "Listen on these interfaces. None selected: all interfaces."
						}
					]
				},
				{
					"id": "servers",
					"title": "Time servers",
					"description": "Up to 10 servers, pools or peers. Without any, pool.ntp.org is used.",
					"fields": [
						{
							"name": "servers",
							"type": "entry-grid",
							"label": "Time servers",
							"max": 10,
							"reorder": true,
							"errorMatch": [
								"time server",
								"time servers",
								"server names"
							],
							"addLabel": "Add server",
							"fields": [
								{
									"name": "server",
									"type": "text",
									"label": "Server",
									"mono": true,
									"required": true,
									"width": "lg"
								},
								{
									"name": "type",
									"type": "select",
									"label": "Type",
									"default": "server",
									"width": "sm",
									"options": [
										{
											"value": "server",
											"label": "Server"
										},
										{
											"value": "pool",
											"label": "Pool"
										},
										{
											"value": "peer",
											"label": "Peer"
										}
									]
								},
								{
									"name": "prefer",
									"type": "switch",
									"label": "Prefer",
									"width": "xs"
								},
								{
									"name": "noselect",
									"type": "switch",
									"label": "No select",
									"width": "xs"
								}
							]
						}
					]
				},
				{
					"id": "logging",
					"title": "Logging and graphs",
					"fields": [
						{
							"name": "statsgraph",
							"type": "switch",
							"label": "RRD graphs",
							"text": "Graph NTP statistics"
						},
						{
							"name": "logpeer",
							"type": "switch",
							"label": "Log peer messages"
						},
						{
							"name": "logsys",
							"type": "switch",
							"label": "Log system messages"
						},
						{
							"name": "clockstats",
							"type": "switch",
							"label": "Clock statistics"
						},
						{
							"name": "loopstats",
							"type": "switch",
							"label": "Loop statistics"
						},
						{
							"name": "peerstats",
							"type": "switch",
							"label": "Peer statistics"
						}
					]
				},
				{
					"id": "auth",
					"title": "Authentication",
					"advanced": true,
					"fields": [
						{
							"name": "serverauth",
							"type": "switch",
							"label": "Require authentication",
							"text": "Clients must use the key"
						},
						{
							"name": "serverauthkeyid",
							"type": "number",
							"label": "Key ID",
							"min": 1,
							"max": 65535,
							"width": "third",
							"visibleWhen": {
								"field": "serverauth",
								"truthy": true
							}
						},
						{
							"name": "serverauthalgo",
							"type": "select",
							"label": "Digest algorithm",
							"options": [
								{
									"value": "md5",
									"label": "MD5"
								},
								{
									"value": "sha1",
									"label": "SHA1"
								},
								{
									"value": "sha256",
									"label": "SHA256"
								}
							],
							"width": "third",
							"visibleWhen": {
								"field": "serverauth",
								"truthy": true
							}
						},
						{
							"name": "serverauthkey",
							"type": "secret",
							"label": "Key",
							"mono": true,
							"visibleWhen": {
								"field": "serverauth",
								"truthy": true
							},
							"help": "Shown as \"(set)\" when a key exists; leave it to keep the key."
						}
					]
				},
				{
					"id": "advanced",
					"title": "Advanced",
					"advanced": true,
					"fields": [
						{
							"name": "ntpmaxpeers",
							"type": "number",
							"label": "Maximum peers",
							"min": 4,
							"max": 25,
							"width": "third",
							"errorMatch": [
								"max peers",
								"maximum peers"
							]
						},
						{
							"name": "ntporphan",
							"type": "number",
							"label": "Orphan mode stratum",
							"min": 1,
							"max": 15,
							"width": "third",
							"errorMatch": [
								"orphan mode"
							]
						},
						{
							"name": "ntpminpoll",
							"type": "select",
							"label": "Minimum poll interval",
							"options": [
								{
									"value": "",
									"label": "Default"
								},
								{
									"value": "3",
									"label": "3: 8 seconds (00:00:08)"
								},
								{
									"value": "4",
									"label": "4: 16 seconds (00:00:16)"
								},
								{
									"value": "5",
									"label": "5: 32 seconds (00:00:32)"
								},
								{
									"value": "6",
									"label": "6: 64 seconds (00:01:04)"
								},
								{
									"value": "7",
									"label": "7: 128 seconds (00:02:08)"
								},
								{
									"value": "8",
									"label": "8: 256 seconds (00:04:16)"
								},
								{
									"value": "9",
									"label": "9: 512 seconds (00:08:32)"
								},
								{
									"value": "10",
									"label": "10: 1,024 seconds (00:17:04)"
								},
								{
									"value": "11",
									"label": "11: 2,048 seconds (00:34:08)"
								},
								{
									"value": "12",
									"label": "12: 4,096 seconds (01:08:16)"
								},
								{
									"value": "13",
									"label": "13: 8,192 seconds (02:16:32)"
								},
								{
									"value": "14",
									"label": "14: 16,384 seconds (04:33:04)"
								},
								{
									"value": "15",
									"label": "15: 32,768 seconds (09:06:08)"
								},
								{
									"value": "16",
									"label": "16: 65,536 seconds (18:12:16)"
								},
								{
									"value": "17",
									"label": "17: 131,072 seconds (1d 12:24:32)"
								},
								{
									"value": "omit",
									"label": "Omit (Do not set)"
								}
							],
							"width": "third",
							"errorMatch": [
								"minimum poll"
							]
						},
						{
							"name": "ntpmaxpoll",
							"type": "select",
							"label": "Maximum poll interval",
							"options": [
								{
									"value": "",
									"label": "Default"
								},
								{
									"value": "3",
									"label": "3: 8 seconds (00:00:08)"
								},
								{
									"value": "4",
									"label": "4: 16 seconds (00:00:16)"
								},
								{
									"value": "5",
									"label": "5: 32 seconds (00:00:32)"
								},
								{
									"value": "6",
									"label": "6: 64 seconds (00:01:04)"
								},
								{
									"value": "7",
									"label": "7: 128 seconds (00:02:08)"
								},
								{
									"value": "8",
									"label": "8: 256 seconds (00:04:16)"
								},
								{
									"value": "9",
									"label": "9: 512 seconds (00:08:32)"
								},
								{
									"value": "10",
									"label": "10: 1,024 seconds (00:17:04)"
								},
								{
									"value": "11",
									"label": "11: 2,048 seconds (00:34:08)"
								},
								{
									"value": "12",
									"label": "12: 4,096 seconds (01:08:16)"
								},
								{
									"value": "13",
									"label": "13: 8,192 seconds (02:16:32)"
								},
								{
									"value": "14",
									"label": "14: 16,384 seconds (04:33:04)"
								},
								{
									"value": "15",
									"label": "15: 32,768 seconds (09:06:08)"
								},
								{
									"value": "16",
									"label": "16: 65,536 seconds (18:12:16)"
								},
								{
									"value": "17",
									"label": "17: 131,072 seconds (1d 12:24:32)"
								},
								{
									"value": "omit",
									"label": "Omit (Do not set)"
								}
							],
							"width": "third",
							"errorMatch": [
								"maximum poll"
							]
						},
						{
							"name": "dnsresolv",
							"type": "segmented",
							"label": "DNS resolution",
							"options": [
								{
									"value": "auto",
									"label": "Auto"
								},
								{
									"value": "inet",
									"label": "IPv4"
								},
								{
									"value": "inet6",
									"label": "IPv6"
								}
							],
							"width": "two-thirds"
						},
						{
							"name": "leaptext",
							"type": "textarea",
							"label": "Leap seconds",
							"code": true,
							"rows": 6,
							"help": "A leap seconds file, usually not needed."
						}
					]
				}
			],
			"resource": "services/ntp"
		};
	}
	function ntpInterfaces() { return M.interfaces.map(function (i) { return [i.id, i.descr]; }).concat([['lo0', 'Localhost']]); }

	M.route('GET', '/api/v1/schema/firewall/rules', function () { return M.ok(RULE_SCHEMA); });
	M.route('GET', '/api/v1/schema/firewall/aliases', function () { return M.ok(ALIAS_SCHEMA); });
	M.route('GET', '/api/v1/schema/services/ntp', function () { return M.ok(ntpSchema()); });
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

	var URLTYPES = ['url', 'url_ports', 'urltable', 'urltable_ports'];
	function A(name, type, description, entries, extra) {
		return Object.assign({ name: name, type: type, description: description, entries: entries.map(function (x) { return { address: x[0], detail: x[1] || '' }; }) }, extra || {});
	}
	var ALIASES = [
		A('ADMIN_HOSTS', 'host', 'Workstations allowed to administer', [['192.168.1.31', 'admin-laptop'], ['192.168.1.32', 'office-pc'], ['10.99.0.2', 'site VPN jump host']]),
		A('DNS_SERVERS', 'host', 'Approved resolvers', [['192.168.1.1', 'this firewall'], ['9.9.9.9', 'Quad9']]),
		A('MAIL_PORTS', 'port', 'SMTP, Submission, IMAPS', [['25', 'SMTP'], ['587', 'Submission'], ['993', 'IMAPS']]),
		A('SSH_ADMIN', 'port', 'SSH on 22 and 2222', [['22', 'SSH'], ['2222', 'SSH (alternate)']]),
		A('RFC1918_ALL', 'network', 'All private ranges', [['10.0.0.0/8', ''], ['172.16.0.0/12', ''], ['192.168.0.0/16', '']]),
		A('CROWDSEC_BLOCKLIST', 'urltable', 'Community blocklist (auto)', [['https://blocklists.example.org/crowdsec.txt', 'Refreshed by the CrowdSec bouncer']], { update_frequency: 1 }),
		A('THREAT_FEEDS', 'urltable', 'ThreatShield merged feeds', [['https://feeds.example.org/merged.txt', '']], { update_frequency: 7 }),
		A('WEB_SERVERS', 'host', 'DMZ web tier', [['172.16.40.10', 'web01'], ['172.16.40.12', 'web02']]),
		A('IOT_DEVICES', 'host', 'Everything on the IOT VLAN that needs Home Assistant', [])
	];
	for (var n = 1; n <= 36; n++) ALIASES[8].entries.push({ address: '10.30.0.' + (10 + n), detail: ['thermostat', 'doorbell', 'plug', 'bulb', 'sensor', 'camera'][n % 6] + '-' + n });

	function aliasIndex(name) { for (var i = 0; i < ALIASES.length; i++) if (ALIASES[i].name === name) return i; return -1; }
	var INVALID = 'The request failed validation.';

	/* The checks of saveAlias(), keyed by schema field as the API maps them. */
	function aliasErrors(b, origName) {
		var e = {};
		var name = String(b.name || '');
		if (!name) e.name = 'An alias name must be specified.';
		else if (!/^[A-Za-z0-9_]{1,31}$/.test(name) || /^\d+$/.test(name) || /^_+$/.test(name)) e.name = 'The alias name must be less than 32 characters long, may not consist of only numbers, may not consist of only underscores, and may only contain the following characters: a-z, A-Z, 0-9, _';
		else if (name !== origName && aliasIndex(name) >= 0) e.name = 'An alias with this name already exists.';
		if (!/^(host|network|port|url|url_ports|urltable|urltable_ports)$/.test(b.type || '')) e.type = 'Alias type is invalid.';
		if (String(b.description || '').length > 200) e.description = 'The description must be at most 200 characters.';
		(b.entries || []).forEach(function (r, i) {
			var v = String((r && typeof r === 'object') ? (r.address || '') : r).trim();
			var ok = URLTYPES.indexOf(b.type) >= 0 ? /^https?:\/\/\S+$/.test(v)
				: b.type === 'port' ? (PORT.test(v) && v.split(':').every(function (x) { return +x >= 1 && +x <= 65535; })) || aliasIndex(v) >= 0
					: b.type === 'network' ? V4NET.test(v) || V4.test(v) || aliasIndex(v) >= 0
						: V4.test(v) || (HOST.test(v) && /[a-z]/i.test(v)) || /^[\d.]+-[\d.]+$/.test(v);
			if (!ok) e['entries.' + i + '.address'] = URLTYPES.indexOf(b.type) >= 0 ? 'You must provide a valid URL.' : b.type === 'port' ? v + ' is not a valid port or alias.' : v + ' is not a valid ' + b.type + ' alias.';
		});
		if (/^urltable/.test(b.type) && b.update_frequency != null && !(b.update_frequency >= 1 && b.update_frequency <= 365)) e.update_frequency = 'The update frequency must be 1 to 365 days.';
		return e;
	}
	function aliasStore(b) {
		var a = { name: String(b.name), type: b.type, description: String(b.description || ''),
			entries: (b.entries || []).map(function (r) { return typeof r === 'object' ? { address: String(r.address || ''), detail: String(r.detail || '') } : { address: String(r), detail: '' }; }) };
		if (/^urltable/.test(a.type)) a.update_frequency = +(b.update_frequency || 7);
		return a;
	}

	M.route('GET', '/api/v1/firewall/aliases', function () { return M.ok(clone(ALIASES)); });
	M.route('GET', '/api/v1/firewall/aliases/{name}', function (p) {
		var i = aliasIndex(p.name);
		return i < 0 ? M.err(404, 'No alias with that name.') : M.ok(clone(ALIASES[i]));
	});
	M.route('POST', '/api/v1/firewall/aliases', function (p, q, b) {
		b = b || {};
		if (b.entries != null && !Array.isArray(b.entries)) return M.err(400, '"entries" must be a list of {address, detail}.');
		var e = aliasErrors(b, null);
		if (Object.keys(e).length) return M.err(422, INVALID, e);
		ALIASES.push(aliasStore(b));
		M.markPending('aliases');
		return Object.assign(M.ok(clone(ALIASES[ALIASES.length - 1])), { status: 201 });
	});
	M.route('PUT', '/api/v1/firewall/aliases/{name}', function (p, q, b) {
		var i = aliasIndex(p.name);
		if (i < 0) return M.err(404, 'No alias with that name.');
		b = Object.assign(clone(ALIASES[i]), b || {});
		if (!Array.isArray(b.entries)) return M.err(400, '"entries" must be a list of {address, detail}.');
		var e = aliasErrors(b, p.name);
		if (Object.keys(e).length) return M.err(422, INVALID, e);
		ALIASES[i] = aliasStore(b);
		M.markPending('aliases');
		return M.ok(clone(ALIASES[i]));
	});
	M.route('DELETE', '/api/v1/firewall/aliases/{name}', function (p) {
		var i = aliasIndex(p.name);
		if (i < 0) return M.err(404, 'No alias with that name.');
		if (p.name === 'RFC1918_ALL') return M.err(409, 'Cannot delete alias. Currently in use by rules GUEST, IOT.');
		ALIASES.splice(i, 1);
		M.markPending('aliases');
		return M.ok({ deleted: p.name, pending: M.pending() });
	});

	/* ---------------------------------------------------------------- NTP */

	var POLL = { '': 'Default', omit: 'Omit (Do not set)' };
	[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].forEach(function (x) { POLL[x] = x + ': ' + Math.pow(2, x).toLocaleString('en') + ' seconds'; });
	var NTP = {
		enable: true, interface: ['lan', 'opt2'],
		servers: [{ server: '0.freesense.pool.ntp.org', prefer: false, noselect: false, auth: false, type: 'pool' },
			{ server: 'time.cloudflare.com', prefer: true, noselect: false, auth: false, type: 'server' },
			{ server: '192.0.2.123', prefer: false, noselect: true, auth: false, type: 'server' }],
		ntpmaxpeers: '', ntporphan: '12', ntpminpoll: '', ntpmaxpoll: '',
		statsgraph: false, logpeer: false, logsys: true, clockstats: false, loopstats: false, peerstats: false,
		leaptext: '', dnsresolv: 'auto', serverauth: false, serverauthkeyid: '', serverauthkey: '', serverauthalgo: 'md5'
	};
	function ntpOut() {
		var ifs = {};
		ntpInterfaces().forEach(function (i) { ifs[i[0]] = i[1]; });
		return Object.assign(clone(NTP), { serverauthkey: NTP.serverauthkey ? '(set)' : '', running: NTP.enable, interface_choices: ifs, poll_choices: POLL,
			dnsresolv_choices: { auto: 'Auto', inet: 'IPv4', inet6: 'IPv6' }, serverauthalgo_choices: { md5: 'MD5', sha1: 'SHA1', sha256: 'SHA256' } });
	}
	M.route('GET', '/api/v1/services/ntp', function () { return M.ok(ntpOut()); });
	M.route('PUT', '/api/v1/services/ntp', function (p, q, b) {
		b = Object.assign(clone(NTP), b || {});
		var e = {};
		var servers = Array.isArray(b.servers) ? b.servers : [];
		if (servers.length > 10) e.servers = 'Too many time servers: at most 10.';
		servers.forEach(function (s, i) {
			var v = String((s && s.server) || '');
			if (!(V4.test(v) || (HOST.test(v) && /[a-z]/i.test(v)))) e['servers.' + i + '.server'] = 'The following input is not a valid hostname or IP address: ' + v;
		});
		var num = function (k, lo, hi, msg) { if (b[k] !== '' && b[k] != null && !(+b[k] >= lo && +b[k] <= hi && Math.floor(+b[k]) === +b[k])) e[k] = msg; };
		num('ntporphan', 1, 15, 'The supplied value for NTP Orphan Mode is invalid.');
		num('ntpmaxpeers', 4, 25, 'Max Peers must be a number between 4 and 25.');
		if (b.ntpminpoll && b.ntpmaxpoll && b.ntpminpoll !== 'omit' && b.ntpmaxpoll !== 'omit' && +b.ntpminpoll > +b.ntpmaxpoll) e.ntpmaxpoll = 'The maximum poll value must be greater than or equal to the minimum poll value.';
		if (b.serverauth && !(b.serverauthkeyid >= 1 && b.serverauthkeyid <= 65535)) e.serverauthkeyid = 'The supplied value for NTP Authentication key ID is invalid.';
		if (Object.keys(e).length) return M.err(422, INVALID, e);
		if (b.serverauthkey === '(set)') b.serverauthkey = NTP.serverauthkey;
		['running', 'interface_choices', 'poll_choices', 'dnsresolv_choices', 'serverauthalgo_choices'].forEach(function (k) { delete b[k]; });
		Object.assign(NTP, b);
		return M.ok(ntpOut());
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
