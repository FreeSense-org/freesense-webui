/*
 * routes-nat.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Mock NAT, as the API serves it (freesense restapi/routes_nat.inc, routes_firewall.inc):
 *   GET    /api/v1/schema/firewall/nat_{port_forwards|outbound|one_to_one|npt}   editor schemas (captured; interface choices from the mock)
 *   GET    /api/v1/firewall/nat/{kind}                 [{id, …stored…, fields, display}], id = position
 *   GET    /api/v1/firewall/nat/{kind}/{id}            one mapping
 *   POST   /api/v1/firewall/nat/{kind}                 create from form fields ("after": id); 422 with the API's messages
 *   PUT    /api/v1/firewall/nat/{kind}/{id}            partial update; false clears a checkbox
 *   POST   /api/v1/firewall/nat/{kind}/{id}/toggle     enable / disable
 *   DELETE /api/v1/firewall/nat/{kind}/{id}            delete
 *   POST   /api/v1/firewall/nat/{kind}/order           {order: [every id]} → {changed, order, pending}
 *   GET    /api/v1/firewall/nat/outbound-mode          {mode, choices}; PUT {mode}
 *   GET    /api/v1/firewall/nat/outbound-automatic     the generated outbound mappings, with display
 *   POST   /api/v1/firewall/nat/apply                  apply
 * kind: port-forwards, outbound, one-to-one, npt. Every write marks "nat" pending.
 */
(function (M) {
	'use strict';

	var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
	var INVALID = 'The request failed validation.';
	var V4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
	var V6 = /^[0-9a-f:]+$/i;
	var PORT = /^(any|[A-Za-z_][A-Za-z0-9_]*|\d{1,5})$/;
	var SCHEMAS = {
		'port-forwards': {
			"title": "Port forward",
			"summary": "{proto} on {interface} to {dsttype}[ port {dstbeginport}] → {localtype}[ {localip}][ port {localbeginport}]",
			"summaryIcon": "right-to-bracket",
			"sections": [
				{
					"id": "rule",
					"title": "Port forward",
					"fields": [
						{
							"name": "disabled",
							"type": "switch",
							"label": "Disabled",
							"text": "Keep the rule without using it",
							"width": "half"
						},
						{
							"name": "nordr",
							"type": "switch",
							"label": "No RDR (NOT)",
							"width": "half",
							"text": "Disable redirection for traffic matching this rule",
							"help": "This option is rarely needed. Don't use this without thorough knowledge of the implications."
						},
						{
							"name": "interface",
							"type": "select",
							"label": "Interface",
							"required": true,
							"default": "wan",
							"width": "half",
							"options": [
								{
									"value": "WireGuard",
									"label": "WireGuard"
								},
								{
									"value": "wan",
									"label": "WAN"
								},
								{
									"value": "lan",
									"label": "LAN"
								},
								{
									"value": "enc0",
									"label": "IPsec"
								},
								{
									"value": "openvpn",
									"label": "OpenVPN"
								}
							],
							"help": "Choose which interface this rule applies to. In most cases \"WAN\" is specified.",
							"errorMatch": [
								"submitted interface does not exist"
							]
						},
						{
							"name": "ipprotocol",
							"type": "segmented",
							"label": "Address family",
							"required": true,
							"default": "inet",
							"width": "half",
							"options": [
								{
									"value": "inet",
									"label": "IPv4"
								},
								{
									"value": "inet6",
									"label": "IPv6"
								}
							]
						},
						{
							"name": "proto",
							"type": "select",
							"label": "Protocol",
							"required": true,
							"default": "tcp",
							"width": "half",
							"options": [
								{
									"value": "any",
									"label": "Any"
								},
								{
									"value": "tcp",
									"label": "TCP"
								},
								{
									"value": "udp",
									"label": "UDP"
								},
								{
									"value": "tcp/udp",
									"label": "TCP/UDP"
								},
								{
									"value": "icmp",
									"label": "ICMP"
								},
								{
									"value": "esp",
									"label": "ESP"
								},
								{
									"value": "ah",
									"label": "AH"
								},
								{
									"value": "gre",
									"label": "GRE"
								},
								{
									"value": "ipencap",
									"label": "IPIP"
								},
								{
									"value": "ipv6",
									"label": "IPV6"
								},
								{
									"value": "igmp",
									"label": "IGMP"
								},
								{
									"value": "pim",
									"label": "PIM"
								},
								{
									"value": "ospf",
									"label": "OSPF"
								},
								{
									"value": "sctp",
									"label": "SCTP"
								}
							],
							"help": "Choose which protocol this rule should match. In most cases \"TCP\" is specified."
						}
					]
				},
				{
					"id": "source",
					"title": "Source",
					"fields": [
						{
							"name": "srctype",
							"type": "select",
							"label": "Source type",
							"width": "half",
							"default": "any",
							"options": [
								{
									"value": "any",
									"label": "Any"
								},
								{
									"value": "single",
									"label": "Address or Alias"
								},
								{
									"value": "network",
									"label": "Network"
								},
								{
									"value": "pptp",
									"label": "PPTP clients"
								},
								{
									"value": "pppoe",
									"label": "PPPoE clients"
								},
								{
									"value": "l2tp",
									"label": "L2TP clients"
								},
								{
									"value": "wanip",
									"label": "WAN address"
								},
								{
									"value": "lanip",
									"label": "LAN address"
								},
								{
									"value": "wan",
									"label": "WAN subnets"
								},
								{
									"value": "lan",
									"label": "LAN subnets"
								}
							],
							"errorMatch": []
						},
						{
							"name": "srcnot",
							"type": "switch",
							"label": "Invert match",
							"width": "half",
							"text": "Match everything except this source"
						},
						{
							"name": "src",
							"type": "typeahead",
							"label": "Source address",
							"mono": true,
							"width": "half",
							"placeholder": "Address or alias",
							"visibleWhen": {
								"field": "srctype",
								"in": [
									"single",
									"network"
								]
							},
							"source": {
								"path": "/v1/firewall/aliases",
								"value": "name",
								"detail": "description"
							},
							"errorMatch": [
								"source ip address",
								"source must be",
								"alias entries"
							]
						},
						{
							"name": "srcmask",
							"type": "number",
							"label": "Prefix length",
							"min": 1,
							"max": 128,
							"width": "third",
							"visibleWhen": {
								"field": "srctype",
								"equals": "network"
							},
							"errorMatch": [
								"source bit count"
							]
						},
						{
							"name": "srcbeginport",
							"type": "typeahead",
							"label": "Source port from",
							"mono": true,
							"width": "third",
							"placeholder": "any",
							"suggestions": [
								{
									"value": "any",
									"label": "any"
								}
							],
							"visibleWhen": {
								"field": "proto",
								"in": [
									"tcp",
									"udp",
									"tcp/udp",
									"sctp"
								]
							},
							"help": "A port, a port alias or \"any\".",
							"errorMatch": [
								"start source port",
								"source port range"
							],
							"default": "any"
						},
						{
							"name": "srcendport",
							"type": "typeahead",
							"label": "Source port to",
							"mono": true,
							"width": "third",
							"placeholder": "same",
							"suggestions": [
								{
									"value": "any",
									"label": "any"
								}
							],
							"visibleWhen": {
								"field": "proto",
								"in": [
									"tcp",
									"udp",
									"tcp/udp",
									"sctp"
								]
							},
							"help": "Leave empty for a single port.",
							"errorMatch": [
								"end source port"
							]
						}
					],
					"advanced": true,
					"description": "Usually any: clients connect from random ports."
				},
				{
					"id": "destination",
					"title": "Destination",
					"fields": [
						{
							"name": "dsttype",
							"type": "select",
							"label": "Destination type",
							"width": "half",
							"default": "any",
							"options": [
								{
									"value": "any",
									"label": "Any"
								},
								{
									"value": "single",
									"label": "Address or Alias"
								},
								{
									"value": "network",
									"label": "Network"
								},
								{
									"value": "(self)",
									"label": "This Firewall (self)"
								},
								{
									"value": "pptp",
									"label": "PPTP clients"
								},
								{
									"value": "pppoe",
									"label": "PPPoE clients"
								},
								{
									"value": "l2tp",
									"label": "L2TP clients"
								},
								{
									"value": "wanip",
									"label": "WAN address"
								},
								{
									"value": "lanip",
									"label": "LAN address"
								},
								{
									"value": "wan",
									"label": "WAN subnets"
								},
								{
									"value": "lan",
									"label": "LAN subnets"
								}
							],
							"errorMatch": [
								"does not support the 'any' destination type"
							]
						},
						{
							"name": "dstnot",
							"type": "switch",
							"label": "Invert match",
							"width": "half",
							"text": "Match everything except this destination"
						},
						{
							"name": "dst",
							"type": "typeahead",
							"label": "Destination address",
							"mono": true,
							"width": "half",
							"placeholder": "Address or alias",
							"visibleWhen": {
								"field": "dsttype",
								"in": [
									"single",
									"network"
								]
							},
							"source": {
								"path": "/v1/firewall/aliases",
								"value": "name",
								"detail": "description"
							},
							"errorMatch": [
								"destination ip address",
								"destination must be"
							]
						},
						{
							"name": "dstmask",
							"type": "number",
							"label": "Prefix length",
							"min": 1,
							"max": 128,
							"width": "third",
							"visibleWhen": {
								"field": "dsttype",
								"equals": "network"
							},
							"errorMatch": [
								"destination bit count"
							]
						},
						{
							"name": "dstbeginport",
							"type": "typeahead",
							"label": "Destination port from",
							"mono": true,
							"width": "third",
							"placeholder": "any",
							"suggestions": [
								{
									"value": "any",
									"label": "any"
								}
							],
							"visibleWhen": {
								"field": "proto",
								"in": [
									"tcp",
									"udp",
									"tcp/udp",
									"sctp"
								]
							},
							"help": "The port or first port of the range on the firewall that is forwarded, a port alias or \"any\".",
							"errorMatch": [
								"start destination port",
								"destination port range",
								"overlaps with an existing entry"
							],
							"required": true
						},
						{
							"name": "dstendport",
							"type": "typeahead",
							"label": "Destination port to",
							"mono": true,
							"width": "third",
							"placeholder": "same",
							"suggestions": [
								{
									"value": "any",
									"label": "any"
								}
							],
							"visibleWhen": {
								"field": "proto",
								"in": [
									"tcp",
									"udp",
									"tcp/udp",
									"sctp"
								]
							},
							"help": "Leave empty for a single port.",
							"errorMatch": [
								"end destination port"
							]
						}
					]
				},
				{
					"id": "target",
					"title": "Redirect target",
					"visibleWhen": {
						"field": "nordr",
						"truthy": false
					},
					"description": "The internal server the ports are forwarded to.",
					"fields": [
						{
							"name": "localtype",
							"type": "select",
							"label": "Redirect target type",
							"default": "single",
							"width": "half",
							"options": [
								{
									"value": "single",
									"label": "Address or Alias"
								},
								{
									"value": "wanip",
									"label": "WAN address"
								},
								{
									"value": "lanip",
									"label": "LAN address"
								}
							],
							"errorMatch": [
								"redirect interface must have"
							]
						},
						{
							"name": "localip",
							"type": "typeahead",
							"label": "Redirect target IP",
							"mono": true,
							"width": "half",
							"placeholder": "Address or alias",
							"visibleWhen": {
								"field": "localtype",
								"equals": "single"
							},
							"source": {
								"path": "/v1/firewall/aliases",
								"value": "name",
								"detail": "description"
							},
							"help": "The internal IP address of the server, e.g. 192.168.1.12. An IPv6 target must be in the same scope as the destination."
						},
						{
							"name": "localbeginport",
							"type": "typeahead",
							"label": "Redirect target port",
							"mono": true,
							"width": "half",
							"suggestions": [],
							"visibleWhen": [
								{
									"field": "proto",
									"in": [
										"tcp",
										"udp",
										"tcp/udp",
										"sctp"
									]
								},
								{
									"field": "dstbeginport",
									"notEquals": "any"
								}
							],
							"help": "The port on the server; for a range, its first port (the end is calculated). Usually the same as the destination port.",
							"errorMatch": [
								"target port range"
							]
						}
					]
				},
				{
					"id": "options",
					"title": "Description and filter rule",
					"fields": [
						{
							"name": "descr",
							"type": "text",
							"label": "Description",
							"help": "A description for administrative reference (not parsed)."
						},
						{
							"name": "filter-rule-association",
							"type": "select",
							"label": "Filter rule association",
							"width": "half",
							"default": "add-associated",
							"visibleWhen": {
								"field": "nordr",
								"truthy": false
							},
							"options": [
								{
									"value": "",
									"label": "None"
								},
								{
									"value": "add-associated",
									"label": "Add associated filter rule"
								},
								{
									"value": "add-unassociated",
									"label": "Add unassociated filter rule"
								},
								{
									"value": "pass",
									"label": "Pass"
								}
							],
							"help": "An associated rule follows this port forward. \"Pass\" needs no rule but does not work properly with Multi-WAN: it only works on an interface with the default gateway."
						},
						{
							"name": "natreflection",
							"type": "select",
							"label": "NAT reflection",
							"width": "half",
							"default": "default",
							"options": [
								{
									"value": "default",
									"label": "Use system default"
								},
								{
									"value": "enable",
									"label": "Enable (NAT + Proxy)"
								},
								{
									"value": "purenat",
									"label": "Enable (Pure NAT)"
								},
								{
									"value": "disable",
									"label": "Disable"
								}
							],
							"errorMatch": [
								"nat + proxy reflection"
							]
						}
					]
				},
				{
					"id": "advanced",
					"title": "Advanced options",
					"advanced": true,
					"fields": [
						{
							"name": "nosync",
							"type": "switch",
							"label": "No XMLRPC Sync",
							"text": "Do not automatically sync to other CARP members",
							"help": "This does NOT prevent the rule from being overwritten on the secondary."
						}
					]
				}
			],
			"resource": "firewall/nat_port_forwards"
		},
		'outbound': {
			"title": "Outbound NAT mapping",
			"summary": "{protocol} on {interface} from {source_type}[ {source}] to {destination_type}[ {destination}] → {target_type}[ {target}]",
			"summaryIcon": "right-from-bracket",
			"sections": [
				{
					"id": "mapping",
					"title": "Mapping",
					"fields": [
						{
							"name": "disabled",
							"type": "switch",
							"label": "Disabled",
							"text": "Keep the mapping without using it",
							"width": "half"
						},
						{
							"name": "nonat",
							"type": "switch",
							"label": "Do not NAT",
							"width": "half",
							"text": "Do not translate matching traffic and stop processing outbound NAT rules",
							"help": "In most cases this option is not required."
						},
						{
							"name": "interface",
							"type": "select",
							"label": "Interface",
							"required": true,
							"default": "wan",
							"width": "half",
							"options": [
								{
									"value": "WireGuard",
									"label": "WireGuard"
								},
								{
									"value": "wan",
									"label": "WAN"
								},
								{
									"value": "lan",
									"label": "LAN"
								},
								{
									"value": "enc0",
									"label": "IPsec"
								},
								{
									"value": "openvpn",
									"label": "OpenVPN"
								}
							],
							"help": "The interface on which traffic is matched as it exits the firewall, usually \"WAN\"."
						},
						{
							"name": "ipprotocol",
							"type": "segmented",
							"label": "Address family",
							"default": "",
							"width": "half",
							"options": [
								{
									"value": "inet",
									"label": "IPv4"
								},
								{
									"value": "inet6",
									"label": "IPv6"
								},
								{
									"value": "",
									"label": "IPv4+IPv6"
								}
							]
						},
						{
							"name": "protocol",
							"type": "select",
							"label": "Protocol",
							"required": true,
							"default": "any",
							"width": "half",
							"options": [
								{
									"value": "any",
									"label": "Any"
								},
								{
									"value": "tcp",
									"label": "TCP"
								},
								{
									"value": "udp",
									"label": "UDP"
								},
								{
									"value": "tcp/udp",
									"label": "TCP/UDP"
								},
								{
									"value": "icmp",
									"label": "ICMP"
								},
								{
									"value": "esp",
									"label": "ESP"
								},
								{
									"value": "ah",
									"label": "AH"
								},
								{
									"value": "gre",
									"label": "GRE"
								},
								{
									"value": "ipencap",
									"label": "IPIP"
								},
								{
									"value": "ipv6",
									"label": "IPV6"
								},
								{
									"value": "igmp",
									"label": "IGMP"
								},
								{
									"value": "sctp",
									"label": "SCTP"
								},
								{
									"value": "carp",
									"label": "CARP"
								},
								{
									"value": "pfsync",
									"label": "PFSYNC"
								}
							],
							"help": "In most cases \"any\" is specified."
						}
					]
				},
				{
					"id": "source",
					"title": "Source",
					"fields": [
						{
							"name": "source_type",
							"type": "select",
							"label": "Source type",
							"default": "any",
							"width": "half",
							"options": [
								{
									"value": "any",
									"label": "Any"
								},
								{
									"value": "(self)",
									"label": "This Firewall (self)"
								},
								{
									"value": "network",
									"label": "Network or Alias"
								},
								{
									"value": "wan",
									"label": "WAN subnets"
								},
								{
									"value": "lan",
									"label": "LAN subnets"
								}
							]
						},
						{
							"name": "source",
							"type": "typeahead",
							"label": "Source",
							"mono": true,
							"width": "half",
							"placeholder": "Network or alias",
							"visibleWhen": {
								"field": "source_type",
								"equals": "network"
							},
							"source": {
								"path": "/v1/firewall/aliases",
								"value": "name",
								"detail": "description"
							}
						},
						{
							"name": "source_subnet",
							"type": "number",
							"label": "Source bit count",
							"min": 0,
							"max": 128,
							"width": "third",
							"default": 24,
							"visibleWhen": {
								"field": "source_type",
								"equals": "network"
							}
						},
						{
							"name": "sourceport",
							"type": "text",
							"label": "Source port",
							"mono": true,
							"width": "third",
							"placeholder": "any",
							"visibleWhen": {
								"field": "protocol",
								"in": [
									"any",
									"tcp",
									"udp",
									"tcp/udp",
									"sctp"
								]
							},
							"help": "A port, a range or a port alias.",
							"errorMatch": [
								"source port entry"
							]
						}
					]
				},
				{
					"id": "destination",
					"title": "Destination",
					"fields": [
						{
							"name": "destination_type",
							"type": "select",
							"label": "Destination type",
							"default": "any",
							"width": "half",
							"options": [
								{
									"value": "any",
									"label": "Any"
								},
								{
									"value": "network",
									"label": "Network or Alias"
								},
								{
									"value": "wan",
									"label": "WAN subnets"
								},
								{
									"value": "lan",
									"label": "LAN subnets"
								}
							]
						},
						{
							"name": "destination_not",
							"type": "switch",
							"label": "Invert match",
							"width": "half",
							"text": "Match everything except this destination",
							"errorMatch": [
								"negating destination address"
							]
						},
						{
							"name": "destination",
							"type": "typeahead",
							"label": "Destination",
							"mono": true,
							"width": "half",
							"placeholder": "Network or alias",
							"visibleWhen": {
								"field": "destination_type",
								"equals": "network"
							},
							"source": {
								"path": "/v1/firewall/aliases",
								"value": "name",
								"detail": "description"
							}
						},
						{
							"name": "destination_subnet",
							"type": "number",
							"label": "Destination bit count",
							"min": 0,
							"max": 128,
							"width": "third",
							"default": 24,
							"visibleWhen": {
								"field": "destination_type",
								"equals": "network"
							}
						},
						{
							"name": "dstport",
							"type": "text",
							"label": "Destination port",
							"mono": true,
							"width": "third",
							"placeholder": "any",
							"visibleWhen": {
								"field": "protocol",
								"in": [
									"any",
									"tcp",
									"udp",
									"tcp/udp",
									"sctp"
								]
							},
							"help": "A port, a range or a port alias.",
							"errorMatch": [
								"destination port entry"
							]
						}
					]
				},
				{
					"id": "translation",
					"title": "Translation",
					"visibleWhen": {
						"field": "nonat",
						"truthy": false
					},
					"description": "Connections matching this mapping are translated to this address. A custom network or alias must be routed to the firewall.",
					"fields": [
						{
							"name": "target_type",
							"type": "select",
							"label": "Translation address",
							"width": "half",
							"options": [
								{
									"value": "network",
									"label": "Network or Alias"
								},
								{
									"value": "wanip",
									"label": "WAN address"
								},
								{
									"value": "lanip",
									"label": "LAN address"
								}
							],
							"errorMatch": [
								"target type"
							]
						},
						{
							"name": "target",
							"type": "typeahead",
							"label": "Target address",
							"mono": true,
							"width": "third",
							"placeholder": "Network or alias",
							"visibleWhen": {
								"field": "target_type",
								"equals": "network"
							},
							"source": {
								"path": "/v1/firewall/aliases",
								"value": "name",
								"detail": "description"
							},
							"errorMatch": [
								"target ip address or alias"
							]
						},
						{
							"name": "target_subnet",
							"type": "number",
							"label": "Target bit count",
							"min": 0,
							"max": 128,
							"width": "third",
							"visibleWhen": {
								"field": "target_type",
								"equals": "network"
							}
						},
						{
							"name": "poolopts",
							"type": "select",
							"label": "Pool options",
							"width": "half",
							"visibleWhen": {
								"field": "target_type",
								"in": [
									"network"
								]
							},
							"options": [
								{
									"value": "",
									"label": "Default"
								},
								{
									"value": "round-robin",
									"label": "Round Robin"
								},
								{
									"value": "round-robin sticky-address",
									"label": "Round Robin with Sticky Address"
								},
								{
									"value": "random",
									"label": "Random"
								},
								{
									"value": "random sticky-address",
									"label": "Random with Sticky Address"
								},
								{
									"value": "source-hash",
									"label": "Source hash"
								},
								{
									"value": "bitmask",
									"label": "Bit mask"
								}
							],
							"help": "Only Round Robin types work with host aliases. Any type can be used with a subnet.",
							"errorMatch": [
								"round robin pool options"
							]
						},
						{
							"name": "source_hash_key",
							"type": "text",
							"label": "Source hash key",
							"mono": true,
							"width": "half",
							"visibleWhen": [
								{
									"field": "target_type",
									"in": [
										"network"
									]
								},
								{
									"field": "poolopts",
									"equals": "source-hash"
								}
							],
							"help": "A hex key preceded by \"0x\", or any string (hashed with md5). Defaults to a random value.",
							"errorMatch": [
								"source-hash key"
							]
						},
						{
							"name": "natport",
							"type": "text",
							"label": "NAT port",
							"mono": true,
							"width": "half",
							"visibleWhen": [
								{
									"field": "protocol",
									"in": [
										"any",
										"tcp",
										"udp",
										"tcp/udp",
										"sctp"
									]
								},
								{
									"field": "staticnatport",
									"truthy": false
								}
							],
							"help": "The external source port or range (low:high) used for remapping. Leave empty for a random port.",
							"errorMatch": [
								"nat port entry"
							]
						},
						{
							"name": "staticnatport",
							"type": "switch",
							"label": "Static port",
							"width": "half",
							"text": "Keep the source port",
							"visibleWhen": {
								"field": "protocol",
								"in": [
									"any",
									"tcp",
									"udp",
									"tcp/udp",
									"sctp"
								]
							}
						},
						{
							"name": "eimnat",
							"type": "switch",
							"label": "Endpoint-Independent Mapping",
							"text": "Enable EIM-NAT for UDP connections",
							"visibleWhen": {
								"field": "protocol",
								"in": [
									"any",
									"udp",
									"tcp/udp"
								]
							},
							"help": "Experimental. A consistent external IP:port mapping across destinations for the same client IP:port."
						}
					]
				},
				{
					"id": "misc",
					"title": "Description",
					"fields": [
						{
							"name": "descr",
							"type": "text",
							"label": "Description",
							"help": "A description for administrative reference (not parsed)."
						},
						{
							"name": "nosync",
							"type": "switch",
							"label": "No XMLRPC Sync",
							"text": "Do not automatically sync to other CARP members"
						}
					]
				}
			],
			"resource": "firewall/nat_outbound"
		},
		'one-to-one': {
			"title": "1:1 NAT mapping",
			"summary": "{exttype}[ {external}] ↔ {srctype}[ {src}] on {interface}",
			"summaryIcon": "arrows-left-right",
			"sections": [
				{
					"id": "mapping",
					"title": "Mapping",
					"fields": [
						{
							"name": "disabled",
							"type": "switch",
							"label": "Disabled",
							"text": "Keep the mapping without using it",
							"width": "half"
						},
						{
							"name": "nobinat",
							"type": "switch",
							"label": "No BINAT (NOT)",
							"width": "half",
							"text": "Do not perform binat for the specified address",
							"help": "Excludes the address from a later, more general, rule."
						},
						{
							"name": "interface",
							"type": "select",
							"label": "Interface",
							"required": true,
							"default": "wan",
							"width": "half",
							"options": [
								{
									"value": "WireGuard",
									"label": "WireGuard"
								},
								{
									"value": "wan",
									"label": "WAN"
								},
								{
									"value": "lan",
									"label": "LAN"
								},
								{
									"value": "enc0",
									"label": "IPsec"
								},
								{
									"value": "openvpn",
									"label": "OpenVPN"
								}
							],
							"help": "Choose which interface this rule applies to. In most cases \"WAN\" is specified.",
							"errorMatch": [
								"interface does not have an address"
							]
						},
						{
							"name": "ipprotocol",
							"type": "segmented",
							"label": "Address family",
							"required": true,
							"default": "inet",
							"width": "half",
							"options": [
								{
									"value": "inet",
									"label": "IPv4"
								},
								{
									"value": "inet6",
									"label": "IPv6"
								}
							]
						}
					]
				},
				{
					"id": "external",
					"title": "External",
					"fields": [
						{
							"name": "exttype",
							"type": "select",
							"label": "External type",
							"default": "single",
							"width": "half",
							"options": [
								{
									"value": "single",
									"label": "Address"
								},
								{
									"value": "wanip",
									"label": "WAN address"
								},
								{
									"value": "lanip",
									"label": "LAN address"
								}
							]
						},
						{
							"name": "external",
							"type": "text",
							"label": "External subnet IP",
							"mono": true,
							"width": "half",
							"visibleWhen": {
								"field": "exttype",
								"equals": "single"
							},
							"errorMatch": [
								"external subnet"
							],
							"help": "The starting address of the external (usually WAN) subnet."
						}
					]
				},
				{
					"id": "internal",
					"title": "Internal",
					"description": "The internal (LAN) subnet. Its size also applies to the external subnet.",
					"fields": [
						{
							"name": "srctype",
							"type": "select",
							"label": "Internal type",
							"default": "single",
							"width": "half",
							"options": [
								{
									"value": "any",
									"label": "Any"
								},
								{
									"value": "single",
									"label": "Address"
								},
								{
									"value": "network",
									"label": "Network"
								},
								{
									"value": "pptp",
									"label": "PPTP clients"
								},
								{
									"value": "pppoe",
									"label": "PPPoE clients"
								},
								{
									"value": "l2tp",
									"label": "L2TP clients"
								},
								{
									"value": "wanip",
									"label": "WAN address"
								},
								{
									"value": "lanip",
									"label": "LAN address"
								},
								{
									"value": "wan",
									"label": "WAN subnet"
								},
								{
									"value": "lan",
									"label": "LAN subnet"
								}
							]
						},
						{
							"name": "srcnot",
							"type": "switch",
							"label": "Invert match",
							"width": "half",
							"text": "Match everything except this address"
						},
						{
							"name": "src",
							"type": "text",
							"label": "Internal IP",
							"mono": true,
							"width": "half",
							"visibleWhen": {
								"field": "srctype",
								"in": [
									"single",
									"network"
								]
							},
							"errorMatch": [
								"source address",
								"internal ip is not from"
							]
						},
						{
							"name": "srcmask",
							"type": "number",
							"label": "Internal prefix length",
							"min": 1,
							"max": 128,
							"width": "third",
							"visibleWhen": {
								"field": "srctype",
								"equals": "network"
							},
							"errorMatch": [
								"internal bit count"
							]
						}
					]
				},
				{
					"id": "destination",
					"title": "Destination",
					"description": "The mapping is only used for connections to or from this destination, usually any.",
					"fields": [
						{
							"name": "dsttype",
							"type": "select",
							"label": "Destination type",
							"default": "any",
							"width": "half",
							"options": [
								{
									"value": "any",
									"label": "Any"
								},
								{
									"value": "single",
									"label": "Address or Alias"
								},
								{
									"value": "network",
									"label": "Network"
								},
								{
									"value": "pptp",
									"label": "PPTP clients"
								},
								{
									"value": "pppoe",
									"label": "PPPoE clients"
								},
								{
									"value": "l2tp",
									"label": "L2TP clients"
								},
								{
									"value": "wanip",
									"label": "WAN address"
								},
								{
									"value": "lanip",
									"label": "LAN address"
								},
								{
									"value": "wan",
									"label": "WAN subnet"
								},
								{
									"value": "lan",
									"label": "LAN subnet"
								}
							]
						},
						{
							"name": "dstnot",
							"type": "switch",
							"label": "Invert match",
							"width": "half",
							"text": "Match everything except this destination"
						},
						{
							"name": "dst",
							"type": "typeahead",
							"label": "Destination address",
							"mono": true,
							"width": "half",
							"placeholder": "Address or alias",
							"visibleWhen": {
								"field": "dsttype",
								"in": [
									"single",
									"network"
								]
							},
							"source": {
								"path": "/v1/firewall/aliases",
								"value": "name",
								"detail": "description"
							},
							"errorMatch": [
								"alias entries"
							]
						},
						{
							"name": "dstmask",
							"type": "number",
							"label": "Destination prefix length",
							"min": 1,
							"max": 128,
							"width": "third",
							"visibleWhen": {
								"field": "dsttype",
								"equals": "network"
							},
							"errorMatch": [
								"destination bit count"
							]
						}
					]
				},
				{
					"id": "options",
					"title": "Description",
					"fields": [
						{
							"name": "descr",
							"type": "text",
							"label": "Description",
							"help": "A description for administrative reference (not parsed)."
						},
						{
							"name": "natreflection",
							"type": "select",
							"label": "NAT reflection",
							"width": "half",
							"default": "default",
							"options": [
								{
									"value": "default",
									"label": "Use system default"
								},
								{
									"value": "enable",
									"label": "Enable"
								},
								{
									"value": "disable",
									"label": "Disable"
								}
							]
						}
					]
				}
			],
			"resource": "firewall/nat_one_to_one"
		},
		'npt': {
			"title": "NPt mapping",
			"summary": "{src}/{srcmask} ↔ {dsttype}[ {dst}/{dstmask}] on {interface}",
			"summaryIcon": "arrows-left-right",
			"sections": [
				{
					"id": "mapping",
					"title": "Mapping",
					"fields": [
						{
							"name": "disabled",
							"type": "switch",
							"label": "Disabled",
							"text": "Keep the mapping without using it"
						},
						{
							"name": "interface",
							"type": "select",
							"label": "Interface",
							"required": true,
							"default": "wan",
							"width": "half",
							"options": [
								{
									"value": "WireGuard",
									"label": "WireGuard"
								},
								{
									"value": "wan",
									"label": "WAN"
								},
								{
									"value": "lan",
									"label": "LAN"
								},
								{
									"value": "enc0",
									"label": "IPsec"
								},
								{
									"value": "openvpn",
									"label": "OpenVPN"
								}
							],
							"help": "Typically the \"WAN\" is used here."
						}
					]
				},
				{
					"id": "internal",
					"title": "Internal IPv6 prefix",
					"description": "The internal (LAN) ULA prefix. Its size also applies to the external prefix.",
					"fields": [
						{
							"name": "srcnot",
							"type": "switch",
							"label": "Invert match",
							"text": "Match everything except this prefix"
						},
						{
							"name": "src",
							"type": "text",
							"label": "Source prefix",
							"required": true,
							"mono": true,
							"width": "two-thirds",
							"errorMatch": [
								"source address"
							]
						},
						{
							"name": "srcmask",
							"type": "number",
							"label": "Source prefix length",
							"min": 1,
							"max": 128,
							"default": 64,
							"width": "third",
							"errorMatch": [
								"source prefix size must be equal"
							]
						}
					]
				},
				{
					"id": "external",
					"title": "Destination IPv6 prefix",
					"description": "The global unicast routable IPv6 prefix.",
					"fields": [
						{
							"name": "dstnot",
							"type": "switch",
							"label": "Invert match",
							"width": "half",
							"text": "Match everything except this prefix"
						},
						{
							"name": "dsttype",
							"type": "select",
							"label": "Destination type",
							"default": "network",
							"width": "half",
							"options": [
								{
									"value": "network",
									"label": "Prefix"
								}
							]
						},
						{
							"name": "dst",
							"type": "text",
							"label": "Destination prefix",
							"mono": true,
							"width": "two-thirds",
							"visibleWhen": {
								"field": "dsttype",
								"equals": "network"
							},
							"errorMatch": [
								"destination address"
							]
						},
						{
							"name": "dstmask",
							"type": "number",
							"label": "Destination prefix length",
							"min": 1,
							"max": 128,
							"default": 64,
							"width": "third",
							"visibleWhen": {
								"field": "dsttype",
								"equals": "network"
							}
						}
					]
				},
				{
					"id": "options",
					"title": "Description",
					"fields": [
						{
							"name": "descr",
							"type": "text",
							"label": "Description",
							"help": "A description for administrative reference (not parsed)."
						}
					]
				}
			],
			"resource": "firewall/nat_npt"
		}
	};
	var NAME = { 'port-forwards': 'port_forwards', 'outbound': 'outbound', 'one-to-one': 'one_to_one', 'npt': 'npt' };
	var MODE_CHOICES = [
		{
			"value": "automatic",
			"label": "Automatic outbound NAT rule generation",
			"help": "IPsec passthrough included"
		},
		{
			"value": "hybrid",
			"label": "Hybrid Outbound NAT rule generation",
			"help": "Automatic Outbound NAT + rules below"
		},
		{
			"value": "advanced",
			"label": "Manual Outbound NAT rule generation",
			"help": "AON - Advanced Outbound NAT"
		},
		{
			"value": "disabled",
			"label": "Disable Outbound NAT rule generation",
			"help": "No Outbound NAT rules"
		}
	];
	var outboundMode = 'hybrid';

	function ifLabel(id) {
		var i = M.interfaces.find(function (x) { return x.id === id; });
		return i ? i.descr : id;
	}
	function schemaFor(kind) {
		var s = clone(SCHEMAS[kind]);
		var opts = M.interfaces.map(function (i) { return { value: i.id, label: i.descr }; });
		s.sections.forEach(function (sec) { sec.fields.forEach(function (f) { if (f.name === 'interface') f.options = opts; }); });
		return s;
	}
	/* Special address types as the display shows them. */
	function special(v) {
		if (!v || v === 'any') return '*';
		var m = /^(\w+?)(ip)?$/.exec(v), i = M.interfaces.find(function (x) { return x.id === (m && m[1]); });
		if (i && m[2]) return i.descr + ' address';
		if (i) return i.descr + ' subnets';
		return null;
	}
	function addr(type, a, mask, not) {
		var s = special(type);
		if (s === null || type === 'single' || type === 'network') s = a + ((type === 'network' && mask) ? '/' + mask : '');
		return (not ? '! ' : '') + s;
	}
	function ports(b, e) {
		if (!b || b === 'any') return '*';
		return (e && e !== b && e !== 'any') ? b + ' - ' + e : String(b);
	}
	var FAMILY = { inet: 'IPv4', inet6: 'IPv6', inet46: 'IPv4+6' };
	function proto(fam, p) { return (FAMILY[fam] || 'IPv4') + ' ' + (!p || p === 'any' ? '*' : String(p).toUpperCase()); }
	var on = function (v) { return v === true || v === 'yes' || v === 'on'; };

	var DISPLAY = {
		'port-forwards': function (f) {
			return { interface: ifLabel(f.interface), protocol: proto(f.ipprotocol, f.proto), source: addr(f.srctype, f.src, f.srcmask, on(f.srcnot)),
				source_ports: ports(f.srcbeginport, f.srcendport), destination: addr(f.dsttype, f.dst, f.dstmask, on(f.dstnot)),
				destination_ports: ports(f.dstbeginport, f.dstendport), target: on(f.nordr) ? '' : (special(f.localtype) || f.localip || ''),
				target_ports: on(f.nordr) ? '' : ports(f.localbeginport, ''), enabled: !on(f.disabled), no_rdr: on(f.nordr),
				filter_rule: f['filter-rule-association'] === 'pass' ? 'pass' : (f['filter-rule-association'] ? 'associated' : 'none'), description: f.descr || '' };
		},
		'outbound': function (f) {
			var src = f.source_type === 'any' ? '*' : (special(f.source_type) || (f.source + (f.source_subnet ? '/' + f.source_subnet : '')));
			var dst = f.destination_type === 'any' ? '*' : (f.destination + (f.destination_subnet ? '/' + f.destination_subnet : ''));
			var tr = on(f.nonat) ? 'No NAT' : (!f.target_type || f.target_type === 'interface' ? 'Interface address' :
				(special(f.target_type) || (f.target + (f.target_subnet ? '/' + f.target_subnet : ''))));
			return { interface: ifLabel(f.interface), protocol: proto(f.ipprotocol, f.protocol), source: src, source_ports: f.sourceport || '*',
				destination: (on(f.destination_not) ? '! ' : '') + dst, destination_ports: f.dstport || '*', translation: tr, translation_port: f.natport || '*',
				static_port: on(f.staticnatport), eim: on(f.eimnat), no_nat: on(f.nonat), enabled: !on(f.disabled), description: f.descr || '' };
		},
		'one-to-one': function (f) {
			return { interface: ifLabel(f.interface), external: special(f.exttype) || f.external || '', internal: addr(f.srctype, f.src, f.srcmask, on(f.srcnot)),
				destination: addr(f.dsttype, f.dst, f.dstmask, on(f.dstnot)), enabled: !on(f.disabled), no_binat: on(f.nobinat), description: f.descr || '' };
		},
		'npt': function (f) {
			return { interface: ifLabel(f.interface), internal: (on(f.srcnot) ? '! ' : '') + f.src + '/' + f.srcmask,
				external: (on(f.dstnot) ? '! ' : '') + (special(f.dsttype) || (f.dst + '/' + f.dstmask)), enabled: !on(f.disabled), description: f.descr || '' };
		}
	};

	/* The form fields of each mapping (what "fields" returns and the editor posts). */
	var STORE = {
		'port-forwards': [
			{ interface: 'wan', ipprotocol: 'inet', proto: 'tcp', srctype: 'any', srcbeginport: 'any', srcendport: 'any', dsttype: 'wanip', dstbeginport: '443', dstendport: '443', localtype: 'single', localip: '172.16.40.10', localbeginport: '443', descr: 'NAT HTTPS to web01', 'filter-rule-association': 'add-associated', natreflection: 'default' },
			{ interface: 'wan', ipprotocol: 'inet', proto: 'tcp/udp', srctype: 'any', srcbeginport: 'any', srcendport: 'any', dsttype: 'wanip', dstbeginport: '25565', dstendport: '25565', localtype: 'single', localip: '192.168.1.40', localbeginport: '25565', descr: 'Minecraft server', 'filter-rule-association': 'pass', natreflection: 'default' },
			{ interface: 'wan', ipprotocol: 'inet', proto: 'tcp', srctype: 'single', src: 'OFFICE_IPS', srcbeginport: 'any', srcendport: 'any', dsttype: 'wanip', dstbeginport: '3389', dstendport: '3389', localtype: 'single', localip: '192.168.1.20', localbeginport: '3389', descr: 'Remote desktop from the office', disabled: 'yes', 'filter-rule-association': 'add-associated', natreflection: 'default' }
		],
		'outbound': [
			{ interface: 'wan', ipprotocol: 'inet', protocol: 'udp', source_type: 'network', source: '192.168.1.0', source_subnet: '24', sourceport: '', destination_type: 'any', dstport: '5060', target_type: 'interface', natport: '', staticnatport: 'yes', descr: 'SIP phones keep their port' },
			{ interface: 'wan', ipprotocol: 'inet', protocol: 'any', source_type: 'network', source: '172.16.40.0', source_subnet: '24', sourceport: '', destination_type: 'any', target_type: 'network', target: '198.51.100.8', target_subnet: '29', poolopts: 'round-robin', descr: 'DMZ via the public block' }
		],
		'one-to-one': [
			{ interface: 'wan', ipprotocol: 'inet', exttype: 'single', external: '198.51.100.10', srctype: 'single', src: '172.16.40.25', srcmask: '32', dsttype: 'any', descr: 'Mail server', natreflection: 'default' }
		],
		'npt': [
			{ interface: 'wan', src: 'fd00:10::', srcmask: '64', dsttype: 'network', dst: '2001:db8:10::', dstmask: '64', descr: 'LAN ULA to public prefix' }
		]
	};

	function out(kind, id) {
		var f = STORE[kind][id];
		return Object.assign({ id: id }, clone(f), { fields: clone(f), display: DISPLAY[kind](f) });
	}
	function check(kind, f) {
		var e = {};
		if (kind === 'port-forwards') {
			['dstbeginport', 'dstendport', 'localbeginport'].forEach(function (k) {
				var v = f[k];
				if (v && (!PORT.test(String(v)) || (/^\d+$/.test(v) && (+v < 1 || +v > 65535))))
					e[k] = v + ' is not a valid ' + (k === 'localbeginport' ? 'redirect target port' : (k === 'dstbeginport' ? 'start' : 'end') + ' destination port') + '. It must be a port alias or integer between 1 and 65535.';
			});
			if (!on(f.nordr) && (f.localtype || 'single') === 'single' && !V4.test(f.localip || '') && !/^[A-Za-z_]\w*$/.test(f.localip || ''))
				e.localip = '"' + (f.localip || '') + '" is not a valid redirect target IP address or host alias.';
			if (['tcp', 'udp', 'tcp/udp'].indexOf(f.proto) >= 0 && !on(f.nordr) && !f.localbeginport) e.localbeginport = 'Redirect target port  is not valid. It must be a port alias or integer between 1 and 65535.';
		} else if (kind === 'outbound') {
			if (f.source_type === 'network' && !V4.test(f.source || '')) e.source = 'A valid source must be specified.';
			if (f.target_type === 'network' && !V4.test(f.target || '')) e.target = 'A valid target IP address must be specified.';
			if (f.natport && !/^\d{1,5}(:\d{1,5})?$/.test(f.natport)) e.natport = 'A valid port number must be specified in Translation port.';
		} else if (kind === 'one-to-one') {
			if (f.exttype === 'single' && !V4.test(f.external || '')) e.external = 'A valid external subnet must be specified.';
			if (f.srctype === 'single' && !V4.test(f.src || '')) e.src = 'A valid internal subnet must be specified.';
		} else if (kind === 'npt') {
			if (!V6.test(f.src || '') || String(f.src).indexOf(':') < 0) e.src = 'The specified source address is not a valid IPv6 prefix.';
			if (f.dsttype === 'network' && (!V6.test(f.dst || '') || String(f.dst).indexOf(':') < 0)) e.dst = 'The specified destination address is not a valid IPv6 prefix.';
			if (f.srcmask && f.dstmask && f.srcmask !== f.dstmask) e.dstmask = 'The source and destination prefixes must be the same size.';
		}
		if (!f.interface) e.interface = 'The field Interface is required.';
		return Object.keys(e).length ? e : null;
	}
	function merge(old, b) {
		var n = clone(old || {});
		Object.keys(b || {}).forEach(function (k) {
			if (k === 'after') return;
			if (b[k] === false) delete n[k]; else n[k] = b[k] === true ? 'yes' : b[k];
		});
		return n;
	}

	Object.keys(STORE).forEach(function (kind) {
		var base = '/api/v1/firewall/nat/' + kind;
		M.route('GET', '/api/v1/schema/firewall/nat_' + NAME[kind], function () { return M.ok(schemaFor(kind)); });
		M.route('GET', base, function () { return M.ok(STORE[kind].map(function (f, i) { return out(kind, i); })); });
		M.route('GET', base + '/{id}', function (p) {
			return STORE[kind][+p.id] ? M.ok(out(kind, +p.id)) : M.err(404, 'No such NAT mapping.');
		});
		M.route('POST', base, function (p, q, b) {
			var n = merge(null, b);
			var e = check(kind, n);
			if (e) return M.err(422, INVALID, e);
			var after = (b && b.after != null && b.after !== '') ? +b.after + 1 : STORE[kind].length;
			STORE[kind].splice(after, 0, n);
			M.markPending('nat');
			return Object.assign(M.ok(out(kind, after)), { status: 201 });
		});
		M.route('PUT', base + '/{id}', function (p, q, b) {
			var id = +p.id;
			if (!STORE[kind][id]) return M.err(404, 'No such NAT mapping.');
			var n = merge(STORE[kind][id], b);
			var e = check(kind, n);
			if (e) return M.err(422, INVALID, e);
			STORE[kind][id] = n;
			M.markPending('nat');
			return M.ok(out(kind, id));
		});
		M.route('POST', base + '/{id}/toggle', function (p) {
			var f = STORE[kind][+p.id];
			if (!f) return M.err(404, 'No such NAT mapping.');
			if (on(f.disabled)) delete f.disabled; else f.disabled = 'yes';
			M.markPending('nat');
			return M.ok({ id: +p.id, state: on(f.disabled) ? 'disabled' : 'enabled', pending: M.pending() });
		});
		M.route('DELETE', base + '/{id}', function (p) {
			if (!STORE[kind][+p.id]) return M.err(404, 'No such NAT mapping.');
			STORE[kind].splice(+p.id, 1);
			M.markPending('nat');
			return M.ok({ deleted: +p.id });
		});
		/* After {id}: later registrations win, so "order" is not taken for an id. */
		M.route('POST', base + '/order', function (p, q, b) {
			var order = (b && b.order) || null, n = STORE[kind].length;
			if (!Array.isArray(order)) return M.err(400, '"order" must be a list of ids.');
			var ids = order.map(Number);
			var ok = ids.length === n && ids.slice().sort(function (a, c) { return a - c; }).every(function (v, i) { return v === i; });
			if (!ok) return M.err(422, INVALID, null, ['"order" must list every id exactly once: ' + STORE[kind].map(function (x, i) { return i; }).join(', ')]);
			var changed = ids.some(function (v, i) { return v !== i; });
			STORE[kind] = ids.map(function (i) { return STORE[kind][i]; });
			if (changed) M.markPending('nat');
			return M.ok({ changed: changed, order: ids, pending: M.pending() });
		});
	});

	M.route('GET', '/api/v1/firewall/nat/outbound-mode', function () { return M.ok({ mode: outboundMode, choices: clone(MODE_CHOICES) }); });
	M.route('PUT', '/api/v1/firewall/nat/outbound-mode', function (p, q, b) {
		var m = b && b.mode;
		if (['automatic', 'hybrid', 'advanced', 'disabled'].indexOf(m) < 0) return M.err(422, INVALID, null, ['"mode" must be automatic, hybrid, advanced or disabled.']);
		if (m === 'advanced' && outboundMode !== 'advanced') {
			/* Switching to manual copies the automatic mappings into the list, as the firewall does. */
			AUTO().forEach(function (a) {
				STORE.outbound.push({ interface: a.interface, ipprotocol: 'inet46', protocol: 'any', source_type: 'network', source: (a.source.network.split(' ')[2] || '').split('/')[0], source_subnet: (a.source.network.split(' ')[2] || '').split('/')[1] || '24',
					destination_type: 'any', dstport: a.dstport || '', target_type: 'interface', staticnatport: a.staticnatport ? 'yes' : undefined, descr: a.descr });
			});
		}
		outboundMode = m;
		M.markPending('nat');
		return M.ok({ mode: outboundMode, choices: clone(MODE_CHOICES), pending: M.pending() });
	});
	function AUTO() {
		if (outboundMode === 'advanced' || outboundMode === 'disabled') return [];
		var nets = '127.0.0.0/8 ::1/128 ' + M.interfaces.filter(function (i) { return i.id !== 'wan' && i.ipv4; }).map(function (i) {
			var p = String(i.ipv4).split('/'), o = p[0].split('.'); o[3] = '0'; return o.join('.') + '/' + (p[1] || '24');
		}).join(' ');
		return [
			{ interface: 'wan', source: { network: nets }, dstport: '500', target: 'wanip', destination: { any: true }, staticnatport: true, descr: 'Auto created rule for ISAKMP' },
			{ interface: 'wan', source: { network: nets }, sourceport: '', target: 'wanip', destination: { any: true }, natport: '', descr: 'Auto created rule' }
		];
	}
	M.route('GET', '/api/v1/firewall/nat/outbound-automatic', function () {
		return M.ok(AUTO().map(function (a) {
			return Object.assign(a, { display: { interface: ifLabel(a.interface), protocol: 'IPv4+6 *', source: a.source.network.split(' '), source_ports: '*',
				destination: '*', destination_ports: a.dstport || '*', translation: ifLabel(a.interface) + ' address', translation_port: '*',
				static_port: !!a.staticnatport, eim: false, no_nat: false, enabled: true, description: a.descr } });
		}));
	});
	M.route('POST', '/api/v1/firewall/nat/apply', function () {
		M.clearPending('nat');
		return M.ok({ applied: true, pending: M.pending() });
	});
})(window.FSMock);
