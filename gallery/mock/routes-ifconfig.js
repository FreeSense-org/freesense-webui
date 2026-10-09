/*
 * routes-ifconfig.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Mock interface configuration, as the API serves it (freesense restapi/routes_ifconfig.inc):
 *   GET  /api/v1/schema/interfaces/config      the editor schema (captured from a firewall)
 *   GET  /api/v1/interfaces/config             [{name, descr, enable, port, ipv4_type, ipv4_address, ipv4_subnet, ipv6_type, …}]
 *   GET  /api/v1/interfaces/config/{name}      the editable fields, read-only facts and *_choices maps
 *   PUT  /api/v1/interfaces/config/{name}      partial update (422 with the page's messages); stages the change
 *   GET  /api/v1/interfaces/config/pending     {pending, interfaces}
 *   POST /api/v1/interfaces/config/apply       {confirm: true} → {applied, filter_reload_status}
 */
(function (M) {
	'use strict';

	var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
	var V4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
	var INVALID = 'The request failed validation.';
	var SCHEMA = {
		"title": "Interface",
		"order": [
			"general",
			"ipv4",
			"ipv6",
			"dhcp",
			"reserved"
		],
		"sections": [
			{
				"id": "general",
				"title": "General",
				"fields": [
					{
						"name": "enable",
						"type": "switch",
						"label": "Enable",
						"text": "Enable interface"
					},
					{
						"name": "description",
						"type": "text",
						"label": "Description",
						"required": true,
						"errorMatch": [
							"interface name",
							"interface descriptions",
							"interface description",
							"alias with the name",
							"interface group with the name"
						],
						"help": "A name for the interface: letters, digits and underscores (other characters are removed)."
					},
					{
						"name": "ipv4_type",
						"type": "select",
						"label": "IPv4 configuration type",
						"options": [
							{
								"value": "none",
								"label": "None"
							},
							{
								"value": "staticv4",
								"label": "Static IPv4"
							},
							{
								"value": "dhcp",
								"label": "DHCP"
							},
							{
								"value": "ppp",
								"label": "PPP"
							},
							{
								"value": "pppoe",
								"label": "PPPoE"
							},
							{
								"value": "pptp",
								"label": "PPTP"
							},
							{
								"value": "l2tp",
								"label": "L2TP"
							}
						],
						"width": "half",
						"errorMatch": [
							"static IP configuration",
							"IPv4 VIPs"
						],
						"help": "PPP, PPPoE, PPTP and L2TP are configured on the Interfaces page."
					},
					{
						"name": "ipv6_type",
						"type": "select",
						"label": "IPv6 configuration type",
						"options": [
							{
								"value": "none",
								"label": "None"
							},
							{
								"value": "staticv6",
								"label": "Static IPv6"
							},
							{
								"value": "dhcp6",
								"label": "DHCP6"
							},
							{
								"value": "slaac",
								"label": "SLAAC"
							},
							{
								"value": "6rd",
								"label": "6rd Tunnel"
							},
							{
								"value": "6to4",
								"label": "6to4 Tunnel"
							},
							{
								"value": "track6",
								"label": "Track Interface"
							}
						],
						"width": "half",
						"errorMatch": [
							"static IPv6 configuration",
							"IPv6 VIPs",
							"configured as 6to4",
							"must be reassigned"
						]
					},
					{
						"name": "spoof_mac",
						"type": "text",
						"label": "MAC address",
						"mono": true,
						"placeholder": "xx:xx:xx:xx:xx:xx",
						"help": "Change (\"spoof\") the MAC address of this interface; leave empty to use the hardware address."
					},
					{
						"name": "mtu",
						"type": "number",
						"label": "MTU",
						"min": 576,
						"max": 9000,
						"width": "third",
						"help": "Empty: the adapter's default (usually 1500)."
					},
					{
						"name": "mss",
						"type": "number",
						"label": "MSS",
						"min": 576,
						"max": 65535,
						"width": "third",
						"help": "Clamp the TCP MSS to this value minus 40 (IPv4) or 60 (IPv6)."
					},
					{
						"name": "media",
						"type": "select",
						"label": "Speed and duplex",
						"width": "third",
						"strict": false,
						"options": [
							{
								"value": "",
								"label": "Default (autoselect)"
							}
						],
						"optionsFrom": "media_choices",
						"help": "The choices are \"media_choices\" of the interface (GET /api/v1/interfaces/config/{name})."
					}
				]
			},
			{
				"id": "ipv4",
				"title": "IPv4",
				"visibleWhen": {
					"field": "ipv4_type",
					"in": [
						"staticv4"
					]
				},
				"fields": [
					{
						"name": "ipv4_address",
						"type": "text",
						"label": "IPv4 address",
						"mono": true,
						"required": true,
						"width": "two-thirds",
						"visibleWhen": {
							"field": "ipv4_type",
							"equals": "staticv4"
						}
					},
					{
						"name": "ipv4_subnet",
						"type": "number",
						"label": "Subnet bit count",
						"min": 1,
						"max": 32,
						"width": "third",
						"required": true,
						"visibleWhen": {
							"field": "ipv4_type",
							"equals": "staticv4"
						},
						"errorMatch": [
							"IPv4 subnet"
						]
					},
					{
						"name": "gateway",
						"type": "select",
						"label": "IPv4 upstream gateway",
						"strict": false,
						"options": [
							{
								"value": "none",
								"label": "None"
							}
						],
						"optionsFrom": "gateway_choices",
						"visibleWhen": {
							"field": "ipv4_type",
							"equals": "staticv4"
						},
						"errorMatch": [
							"Gateway",
							"IPv4 gateway"
						],
						"help": "An Internet connection needs its gateway; on a local network interface use \"None\". The choices are \"gateway_choices\" of the interface (GET /api/v1/interfaces/config/{name})."
					}
				]
			},
			{
				"id": "ipv6",
				"title": "IPv6",
				"visibleWhen": {
					"field": "ipv6_type",
					"in": [
						"staticv6",
						"dhcp6",
						"slaac",
						"6rd",
						"track6"
					]
				},
				"fields": [
					{
						"name": "ipv6_address",
						"type": "text",
						"label": "IPv6 address",
						"mono": true,
						"required": true,
						"width": "two-thirds",
						"visibleWhen": {
							"field": "ipv6_type",
							"equals": "staticv6"
						},
						"errorMatch": [
							"IPv6 link local addresses"
						]
					},
					{
						"name": "ipv6_subnet",
						"type": "number",
						"label": "IPv6 prefix length",
						"min": 1,
						"max": 128,
						"width": "third",
						"required": true,
						"visibleWhen": {
							"field": "ipv6_type",
							"equals": "staticv6"
						}
					},
					{
						"name": "gatewayv6",
						"type": "select",
						"label": "IPv6 upstream gateway",
						"strict": false,
						"options": [
							{
								"value": "none",
								"label": "None"
							}
						],
						"optionsFrom": "gatewayv6_choices",
						"visibleWhen": {
							"field": "ipv6_type",
							"equals": "staticv6"
						},
						"errorMatch": [
							"IPv6 gateway"
						],
						"help": "The choices are \"gatewayv6_choices\" of the interface (GET /api/v1/interfaces/config/{name})."
					},
					{
						"name": "ipv6_use_ipv4_link",
						"type": "switch",
						"label": "Use IPv4 connectivity as parent interface",
						"text": "IPv6 uses the IPv4 link (PPPoE)",
						"visibleWhen": {
							"field": "ipv6_type",
							"equals": "staticv6"
						}
					},
					{
						"name": "dhcp6_prefix_delegation_size",
						"type": "select",
						"label": "DHCPv6 prefix delegation size",
						"options": [
							{
								"value": "none",
								"label": "None"
							},
							{
								"value": "16",
								"label": "48"
							},
							{
								"value": "15",
								"label": "49"
							},
							{
								"value": "14",
								"label": "50"
							},
							{
								"value": "13",
								"label": "51"
							},
							{
								"value": "12",
								"label": "52"
							},
							{
								"value": "11",
								"label": "53"
							},
							{
								"value": "10",
								"label": "54"
							},
							{
								"value": "9",
								"label": "55"
							},
							{
								"value": "8",
								"label": "56"
							},
							{
								"value": "7",
								"label": "57"
							},
							{
								"value": "6",
								"label": "58"
							},
							{
								"value": "5",
								"label": "59"
							},
							{
								"value": "4",
								"label": "60"
							},
							{
								"value": "3",
								"label": "61"
							},
							{
								"value": "2",
								"label": "62"
							},
							{
								"value": "1",
								"label": "63"
							},
							{
								"value": "0",
								"label": "64"
							}
						],
						"width": "half",
						"visibleWhen": {
							"field": "ipv6_type",
							"equals": "dhcp6"
						},
						"help": "The delegated prefix length the ISP provides (the value is the number of bits below /64)."
					},
					{
						"name": "dhcp6_send_prefix_hint",
						"type": "switch",
						"label": "Send IPv6 prefix hint",
						"text": "Ask for the prefix delegation size above",
						"visibleWhen": {
							"field": "ipv6_type",
							"equals": "dhcp6"
						}
					},
					{
						"name": "dhcp6_use_ipv4",
						"type": "switch",
						"label": "Request over IPv4 connectivity",
						"text": "Request a prefix and information through the IPv4 link",
						"visibleWhen": {
							"field": "ipv6_type",
							"equals": "dhcp6"
						}
					},
					{
						"name": "dhcp6_prefix_only",
						"type": "switch",
						"label": "Request only an IPv6 prefix",
						"text": "Do not request an IPv6 address",
						"visibleWhen": {
							"field": "ipv6_type",
							"equals": "dhcp6"
						}
					},
					{
						"name": "dhcp6_without_ra",
						"type": "switch",
						"label": "Do not wait for a router advertisement",
						"text": "Required by some ISPs, especially without PPPoE",
						"visibleWhen": {
							"field": "ipv6_type",
							"equals": "dhcp6"
						}
					},
					{
						"name": "slaac_use_ipv4",
						"type": "switch",
						"label": "Use IPv4 link for SLAAC",
						"text": "IPv6 uses the IPv4 link (PPPoE)",
						"visibleWhen": {
							"field": "ipv6_type",
							"equals": "slaac"
						}
					},
					{
						"name": "prefix_6rd",
						"type": "text",
						"label": "6RD prefix",
						"mono": true,
						"placeholder": "2001:db8::/32",
						"visibleWhen": {
							"field": "ipv6_type",
							"equals": "6rd"
						}
					},
					{
						"name": "gateway_6rd",
						"type": "text",
						"label": "6RD border relay",
						"mono": true,
						"required": true,
						"width": "two-thirds",
						"visibleWhen": {
							"field": "ipv6_type",
							"equals": "6rd"
						}
					},
					{
						"name": "prefix_6rd_v4_length",
						"type": "select",
						"label": "6RD IPv4 prefix length",
						"options": [
							{
								"value": "0",
								"label": "0"
							},
							{
								"value": "1",
								"label": "1"
							},
							{
								"value": "2",
								"label": "2"
							},
							{
								"value": "3",
								"label": "3"
							},
							{
								"value": "4",
								"label": "4"
							},
							{
								"value": "5",
								"label": "5"
							},
							{
								"value": "6",
								"label": "6"
							},
							{
								"value": "7",
								"label": "7"
							},
							{
								"value": "8",
								"label": "8"
							},
							{
								"value": "9",
								"label": "9"
							},
							{
								"value": "10",
								"label": "10"
							},
							{
								"value": "11",
								"label": "11"
							},
							{
								"value": "12",
								"label": "12"
							},
							{
								"value": "13",
								"label": "13"
							},
							{
								"value": "14",
								"label": "14"
							},
							{
								"value": "15",
								"label": "15"
							},
							{
								"value": "16",
								"label": "16"
							},
							{
								"value": "17",
								"label": "17"
							},
							{
								"value": "18",
								"label": "18"
							},
							{
								"value": "19",
								"label": "19"
							},
							{
								"value": "20",
								"label": "20"
							},
							{
								"value": "21",
								"label": "21"
							},
							{
								"value": "22",
								"label": "22"
							},
							{
								"value": "23",
								"label": "23"
							},
							{
								"value": "24",
								"label": "24"
							},
							{
								"value": "25",
								"label": "25"
							},
							{
								"value": "26",
								"label": "26"
							},
							{
								"value": "27",
								"label": "27"
							},
							{
								"value": "28",
								"label": "28"
							},
							{
								"value": "29",
								"label": "29"
							},
							{
								"value": "30",
								"label": "30"
							},
							{
								"value": "31",
								"label": "31"
							},
							{
								"value": "32",
								"label": "32"
							}
						],
						"width": "third",
						"visibleWhen": {
							"field": "ipv6_type",
							"equals": "6rd"
						}
					},
					{
						"name": "track6_interface",
						"type": "select",
						"label": "Track IPv6 interface",
						"strict": false,
						"options": [],
						"optionsFrom": "track6_interface_choices",
						"required": true,
						"width": "half",
						"visibleWhen": {
							"field": "ipv6_type",
							"equals": "track6"
						},
						"errorMatch": [
							"interface to track"
						],
						"help": "The dynamic IPv6 interface (DHCP6, 6rd, 6to4) whose delegated prefix this interface uses. The choices are \"track6_interface_choices\" of the interface (GET /api/v1/interfaces/config/{name})."
					},
					{
						"name": "track6_prefix_id",
						"type": "text",
						"label": "IPv6 prefix ID",
						"mono": true,
						"width": "half",
						"visibleWhen": {
							"field": "ipv6_type",
							"equals": "track6"
						},
						"errorMatch": [
							"track6 prefix ID"
						],
						"help": "Hexadecimal, from 0 to \"track6_prefix_id_max\" of the tracked interface."
					}
				]
			},
			{
				"id": "dhcp",
				"title": "DHCP client",
				"advanced": true,
				"visibleWhen": {
					"field": "ipv4_type",
					"equals": "dhcp"
				},
				"fields": [
					{
						"name": "dhcp_hostname",
						"type": "text",
						"label": "Hostname",
						"width": "half",
						"help": "Sent as the DHCP client identifier and hostname (some ISPs require it)."
					},
					{
						"name": "dhcp_alias_address",
						"type": "text",
						"label": "Alias IPv4 address",
						"mono": true,
						"width": "third",
						"errorMatch": [
							"alias IP address"
						]
					},
					{
						"name": "dhcp_alias_subnet",
						"type": "number",
						"label": "Alias subnet bit count",
						"min": 1,
						"max": 32,
						"width": "third",
						"errorMatch": [
							"alias subnet bit count"
						]
					},
					{
						"name": "dhcp_reject_from",
						"type": "text",
						"label": "Reject leases from",
						"mono": true,
						"help": "DHCP servers whose offers are rejected, separated by commas (e.g. a cable modem)."
					}
				]
			},
			{
				"id": "reserved",
				"title": "Reserved networks",
				"fields": [
					{
						"name": "block_private",
						"type": "switch",
						"label": "Block private networks",
						"text": "Block RFC 1918, RFC 4193 and loopback sources (WAN interfaces)"
					},
					{
						"name": "block_bogons",
						"type": "switch",
						"label": "Block bogon networks",
						"text": "Block reserved and unassigned sources (WAN interfaces)"
					}
				]
			}
		],
		"resource": "interfaces/config"
	};
	/* One interface as GET /v1/interfaces/config/{name} returns it on a firewall (WAN of the test VM). */
	var TEMPLATE = {
		"name": "wan",
		"enable": true,
		"description": "WAN",
		"ipv4_type": "dhcp",
		"ipv4_address": "",
		"ipv4_subnet": "",
		"gateway": "none",
		"ipv6_type": "dhcp6",
		"ipv6_address": "",
		"ipv6_subnet": "",
		"gatewayv6": "none",
		"ipv6_use_ipv4_link": false,
		"track6_interface": "",
		"track6_prefix_id": "0",
		"prefix_6rd": "",
		"gateway_6rd": "",
		"prefix_6rd_v4_length": "0",
		"spoof_mac": "",
		"mtu": "",
		"mss": "",
		"media": "",
		"dhcp_hostname": "",
		"dhcp_alias_address": "",
		"dhcp_alias_subnet": "32",
		"dhcp_reject_from": "",
		"dhcp6_prefix_delegation_size": "none",
		"dhcp6_send_prefix_hint": false,
		"dhcp6_use_ipv4": false,
		"dhcp6_prefix_only": false,
		"dhcp6_without_ra": false,
		"slaac_use_ipv4": false,
		"block_private": false,
		"block_bogons": true,
		"port": "em0",
		"port_descr": "em0 (00:0c:29:1d:3b:51)",
		"real_interface": "em0",
		"kind": "ethernet",
		"bridge": null,
		"address_configurable": true,
		"pending": false,
		"ppp": null,
		"wireless": null,
		"ipv4_type_choices": {
			"none": "None",
			"staticv4": "Static IPv4",
			"dhcp": "DHCP",
			"ppp": "PPP",
			"pppoe": "PPPoE",
			"pptp": "PPTP",
			"l2tp": "L2TP"
		},
		"ipv6_type_choices": {
			"none": "None",
			"staticv6": "Static IPv6",
			"dhcp6": "DHCP6",
			"slaac": "SLAAC",
			"6rd": "6rd Tunnel",
			"6to4": "6to4 Tunnel",
			"track6": "Track Interface"
		},
		"gateway_choices": {
			"none": "None"
		},
		"gatewayv6_choices": {
			"none": "None"
		},
		"track6_interface_choices": {
			"wan": "WAN"
		},
		"track6_prefix_id_max": {
			"wan": "0"
		},
		"media_choices": {
			"": "Default (no preference, typically autoselect)",
			"autoselect": "autoselect",
			"1000baseT": "1000baseT",
			"1000baseT full-duplex": "1000baseT full-duplex",
			"100baseTX full-duplex": "100baseTX full-duplex",
			"100baseTX": "100baseTX",
			"10baseT/UTP full-duplex": "10baseT/UTP full-duplex",
			"10baseT/UTP": "10baseT/UTP"
		},
		"dhcp6_prefix_delegation_size_choices": {
			"none": "None",
			"16": "48",
			"15": "49",
			"14": "50",
			"13": "51",
			"12": "52",
			"11": "53",
			"10": "54",
			"9": "55",
			"8": "56",
			"7": "57",
			"6": "58",
			"5": "59",
			"4": "60",
			"3": "61",
			"2": "62",
			"1": "63",
			"0": "64"
		}
	};

	var CONFIG = {};
	M.interfaces.forEach(function (i) {
		var v4 = String(i.ipv4 || '').split('/');
		var c = clone(TEMPLATE);
		Object.assign(c, {
			name: i.id, description: i.descr, enable: i.status !== 'no carrier' || i.id !== 'opt4', port: i.if, port_descr: i.if + ' (' + (i.mac || '00:00:00:00:00:00') + ')', real_interface: i.if,
			kind: /\./.test(i.if) ? 'vlan' : /^(wg|tun|ovpn)/.test(i.if) ? 'tunnel' : 'ethernet',
			ipv4_type: i.id === 'wan' || i.id === 'opt4' ? 'dhcp' : (v4[0] ? 'staticv4' : 'none'),
			ipv4_address: i.id === 'wan' || i.id === 'opt4' ? '' : (v4[0] || ''), ipv4_subnet: i.id === 'wan' || i.id === 'opt4' ? '' : (v4[1] || ''),
			ipv6_type: i.id === 'wan' ? 'dhcp6' : i.id === 'lan' ? 'track6' : 'none', track6_interface: i.id === 'lan' ? 'wan' : '',
			gateway: 'none', gatewayv6: 'none', pending: false
		});
		CONFIG[i.id] = c;
	});
	var pending = [];

	function summary(c) {
		return { name: c.name, descr: c.description, enable: c.enable, port: c.port, ipv4_type: c.ipv4_type, ipv4_address: c.ipv4_address,
			ipv4_subnet: c.ipv4_subnet, ipv6_type: c.ipv6_type, ipv6_address: c.ipv6_address, ipv6_subnet: c.ipv6_subnet, gateway: c.gateway === 'none' ? '' : c.gateway,
			gatewayv6: c.gatewayv6 === 'none' ? '' : c.gatewayv6, mtu: c.mtu };
	}
	var READONLY = ['name', 'port', 'port_descr', 'real_interface', 'kind', 'bridge', 'address_configurable', 'pending', 'ppp', 'wireless', 'note'];

	M.route('GET', '/api/v1/schema/interfaces/config', function () { return M.ok(clone(SCHEMA)); });
	M.route('GET', '/api/v1/interfaces/config', function () { return M.ok(Object.keys(CONFIG).map(function (k) { return summary(CONFIG[k]); })); });
	M.route('GET', '/api/v1/interfaces/config/{name}', function (p) {
		var c = CONFIG[p.name];
		return c ? M.ok(Object.assign(clone(c), { pending: pending.indexOf(p.name) >= 0 })) : M.err(404, 'No such interface.');
	});
	M.route('PUT', '/api/v1/interfaces/config/{name}', function (p, q, b) {
		var c = CONFIG[p.name];
		if (!c) return M.err(404, 'No such interface.');
		b = b || {};
		var bad = Object.keys(b).filter(function (k) { return READONLY.indexOf(k) >= 0 || /_choices$/.test(k) ? false : !(k in c); });
		if (bad.length) return M.err(400, 'Unknown field "' + bad[0] + '".');
		var n = Object.assign(clone(c), b);
		var e = {};
		if (!n.description) e.description = 'An interface description is required.';
		n.description = String(n.description).replace(/[^A-Za-z0-9_]/g, '');
		if (n.mtu !== '' && n.mtu != null && !(+n.mtu >= 576 && +n.mtu <= 9000)) e.mtu = 'The MTU must be between 576 and 9000 bytes.';
		if (n.mss !== '' && n.mss != null && !(+n.mss >= 576 && +n.mss <= 65535)) e.mss = 'The MSS must be an integer between 576 and 65535 bytes.';
		if (n.ipv4_type === 'staticv4') {
			if (!V4.test(n.ipv4_address || '')) e.ipv4_address = 'A valid IPv4 address must be specified.';
			if (!(+n.ipv4_subnet >= 1 && +n.ipv4_subnet <= 32)) e.ipv4_subnet = 'A valid subnet bit count must be specified.';
		}
		if (n.spoof_mac && !/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(n.spoof_mac)) e.spoof_mac = 'A valid MAC address must be specified.';
		if (Object.keys(e).length) return M.err(422, INVALID, e);
		READONLY.forEach(function (k) { n[k] = c[k]; });
		CONFIG[p.name] = n;
		if (pending.indexOf(p.name) < 0) pending.push(p.name);
		return M.ok(Object.assign(clone(n), { pending: true, applied: false }));
	});
	M.route('GET', '/api/v1/interfaces/config/pending', function () { return M.ok({ pending: pending.length > 0, interfaces: pending.slice() }); });
	M.route('POST', '/api/v1/interfaces/config/apply', function (p, q, b) {
		if (!b || b.confirm !== true) return M.err(400, 'Applying interface changes reconfigures interfaces at once and requires {"confirm": true}.');
		if (!pending.length) return M.ok({ applied: false, message: 'There are no pending interface changes.' });
		pending = [];
		return Object.assign(M.ok({ applied: true, filter_reload_status: 0 }), { delay: 1500 });
	});
})(window.FSMock);
