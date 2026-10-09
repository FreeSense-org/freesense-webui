/*
 * routes-rules.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Mock filter rules, as the API serves them (freesense restapi/routes_firewall.inc):
 *   GET    /api/v1/schema/firewall/rules           rule editor schema (one interface)
 *   GET    /api/v1/schema/firewall/floating_rules  floating rule schema (interfaces, direction, quick, match)
 *   GET    /api/v1/firewall/rules?interface=        rules as stored (source/destination objects), id = position, plus "display"
 *   GET    /api/v1/firewall/rules/tabs             [{id, label, count}]: Floating, then the interfaces
 *   GET    /api/v1/firewall/rules/{id}             one rule plus "fields" (the edit form's fields)
 *   POST   /api/v1/firewall/rules                  create from form fields ("after": id or -1); 422 with the API's messages
 *   PUT    /api/v1/firewall/rules/{id}             partial update of the form fields; false clears a checkbox
 *   POST   /api/v1/firewall/rules/{id}/toggle      flip enabled/disabled
 *   DELETE /api/v1/firewall/rules/{id}             delete
 *   POST   /api/v1/firewall/rules/order            {interface, order: [every id of the tab]}
 *   POST   /api/v1/firewall/rules/apply            apply (as /firewall/apply)
 * Every write marks "rules" pending (GET /api/v1/firewall/pending).
 */
(function (M) {
	'use strict';

	/* The API's schemas (choices filled per request below). */
	var RULE_SCHEMA = {
		"title": "Firewall rule",
		"summary": "{type} {proto} from {srctype} to {dsttype}",
		"summaryIcon": "shield-halved",
		"sections": [
			{
				"id": "rule",
				"title": "Rule",
				"fields": [
					{
						"name": "type",
						"type": "segmented",
						"label": "Action",
						"required": true,
						"default": "pass",
						"options": [
							{
								"value": "pass",
								"label": "Pass",
								"tone": "pass"
							},
							{
								"value": "block",
								"label": "Block",
								"tone": "block"
							},
							{
								"value": "reject",
								"label": "Reject",
								"tone": "reject"
							}
						],
						"errorMatch": [
							"rule type"
						],
						"help": "Block drops packets silently; reject also tells the sender (TCP reset or ICMP unreachable)."
					},
					{
						"name": "disabled",
						"type": "switch",
						"label": "Disabled",
						"text": "Keep the rule without using it"
					},
					{
						"name": "interface",
						"type": "select",
						"label": "Interface",
						"required": true,
						"width": "half",
						"options": [],
						"help": "Packets arriving on this interface are matched."
					},
					{
						"name": "ipprotocol",
						"type": "segmented",
						"label": "Address family",
						"required": true,
						"default": "inet",
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
								"value": "inet46",
								"label": "IPv4+IPv6"
							}
						],
						"errorMatch": [
							"ip protocol",
							"ipv4 rules",
							"ipv6 rules",
							"both ipv4 and ipv6"
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
								"value": "etherip",
								"label": "EoIP"
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
						"errorMatch": [
							"only valid with protocol tcp",
							"only be specified for tcp protocol"
						]
					},
					{
						"name": "icmptype",
						"type": "checklist",
						"label": "ICMP subtypes",
						"options": [
							{
								"value": "any",
								"label": "any"
							},
							{
								"value": "althost",
								"label": "Alternate Host"
							},
							{
								"value": "dataconv",
								"label": "Datagram conversion error"
							},
							{
								"value": "echorep",
								"label": "Echo reply"
							},
							{
								"value": "echoreq",
								"label": "Echo request"
							},
							{
								"value": "inforep",
								"label": "Information reply"
							},
							{
								"value": "inforeq",
								"label": "Information request"
							},
							{
								"value": "ipv6-here",
								"label": "IPv6 I-am-here"
							},
							{
								"value": "ipv6-where",
								"label": "IPv6 where-are-you"
							},
							{
								"value": "maskrep",
								"label": "Address mask reply"
							},
							{
								"value": "maskreq",
								"label": "Address mask request"
							},
							{
								"value": "mobredir",
								"label": "Mobile host redirect"
							},
							{
								"value": "mobregrep",
								"label": "Mobile registration reply"
							},
							{
								"value": "mobregreq",
								"label": "Mobile registration request"
							},
							{
								"value": "paramprob",
								"label": "Parameter problem (invalid IP header)"
							},
							{
								"value": "photuris",
								"label": "Photuris"
							},
							{
								"value": "redir",
								"label": "Redirect"
							},
							{
								"value": "routeradv",
								"label": "Router advertisement"
							},
							{
								"value": "routersol",
								"label": "Router solicitation"
							},
							{
								"value": "skip",
								"label": "SKIP"
							},
							{
								"value": "squench",
								"label": "Source quench"
							},
							{
								"value": "timerep",
								"label": "Timestamp reply"
							},
							{
								"value": "timereq",
								"label": "Timestamp"
							},
							{
								"value": "timex",
								"label": "Time exceeded"
							},
							{
								"value": "trace",
								"label": "Traceroute"
							},
							{
								"value": "unreach",
								"label": "Destination unreachable"
							}
						],
						"visibleWhen": {
							"field": "proto",
							"equals": "icmp"
						},
						"help": "None or \"any\" matches every subtype.",
						"errorMatch": [
							"icmp subtype",
							"icmp types"
						]
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
						"options": []
					},
					{
						"name": "srcnot",
						"type": "switch",
						"label": "Invert match",
						"width": "half",
						"text": "Match everything except this source",
						"errorMatch": [
							"invert match"
						]
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
							"alias entries",
							"same family"
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
								"tcp/udp"
							]
						},
						"help": "A port, a port alias or \"any\".",
						"errorMatch": [
							"start source port",
							"Source port range from"
						]
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
								"tcp/udp"
							]
						},
						"help": "Leave empty for a single port.",
						"errorMatch": [
							"end source port",
							"Source port range to"
						]
					}
				]
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
						"options": []
					},
					{
						"name": "dstnot",
						"type": "switch",
						"label": "Invert match",
						"width": "half",
						"text": "Match everything except this destination",
						"errorMatch": [
							"invert match"
						]
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
							"alias entries",
							"same family"
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
								"tcp/udp"
							]
						},
						"help": "A port, a port alias or \"any\".",
						"errorMatch": [
							"start destination port",
							"Destination port range from"
						]
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
								"tcp/udp"
							]
						},
						"help": "Leave empty for a single port.",
						"errorMatch": [
							"end destination port",
							"Destination port range to"
						]
					}
				]
			},
			{
				"id": "extra",
				"title": "Description and logging",
				"fields": [
					{
						"name": "descr",
						"type": "text",
						"label": "Description",
						"maxLength": 52,
						"help": "Shown in the rule list and in the firewall log."
					},
					{
						"name": "log",
						"type": "switch",
						"label": "Log",
						"text": "Log packets matched by this rule"
					}
				]
			},
			{
				"id": "routing",
				"title": "Routing and schedule",
				"advanced": true,
				"fields": [
					{
						"name": "gateway",
						"type": "select",
						"label": "Gateway",
						"width": "half",
						"options": [],
						"help": "Default uses the routing table; a gateway or group routes matching traffic by policy (not for IPv4+IPv6).",
						"errorMatch": [
							"gateways can not",
							"gateway group",
							"an ipv4 gateway",
							"an ipv6 gateway"
						]
					},
					{
						"name": "sched",
						"type": "select",
						"label": "Schedule",
						"width": "half",
						"options": [],
						"help": "With a schedule the rule only applies in its time ranges."
					}
				]
			},
			{
				"id": "advanced",
				"title": "Advanced options",
				"advanced": true,
				"description": "State tracking, limits and tags. The defaults suit almost every rule.",
				"fields": [
					{
						"name": "statetype",
						"type": "select",
						"label": "State type",
						"width": "half",
						"default": "keep state",
						"options": [
							{
								"value": "keep state",
								"label": "Keep"
							},
							{
								"value": "sloppy state",
								"label": "Sloppy"
							},
							{
								"value": "synproxy state",
								"label": "Synproxy"
							},
							{
								"value": "none",
								"label": "None"
							}
						],
						"errorMatch": [
							"is only valid with protocol",
							"is only valid if the gateway"
						]
					},
					{
						"name": "statepolicy",
						"type": "select",
						"label": "State policy",
						"width": "half",
						"options": [
							{
								"value": "",
								"label": "Use global default"
							},
							{
								"value": "if-bound",
								"label": "Interface Bound States"
							},
							{
								"value": "floating",
								"label": "Floating States"
							}
						]
					},
					{
						"name": "max",
						"type": "number",
						"label": "Max. states",
						"min": 1,
						"width": "third",
						"errorMatch": [
							"maximum state entries (advanced"
						]
					},
					{
						"name": "max-src-nodes",
						"type": "number",
						"label": "Max. source hosts",
						"min": 1,
						"width": "third",
						"errorMatch": [
							"unique source hosts"
						]
					},
					{
						"name": "max-src-states",
						"type": "number",
						"label": "Max. states per host",
						"min": 1,
						"width": "third",
						"errorMatch": [
							"state entries per host"
						]
					},
					{
						"name": "max-src-conn",
						"type": "number",
						"label": "Max. connections per host",
						"min": 1,
						"width": "third",
						"errorMatch": [
							"established connections per host"
						]
					},
					{
						"name": "max-src-conn-rate",
						"type": "number",
						"label": "New connections",
						"min": 1,
						"width": "third",
						"errorMatch": [
							"new connections per host"
						]
					},
					{
						"name": "max-src-conn-rates",
						"type": "number",
						"label": "Per seconds",
						"min": 1,
						"width": "third"
					},
					{
						"name": "statetimeout",
						"type": "number",
						"label": "State timeout",
						"unit": "seconds",
						"min": 1,
						"width": "third"
					},
					{
						"name": "tag",
						"type": "text",
						"label": "Tag",
						"mono": true,
						"width": "third"
					},
					{
						"name": "tagged",
						"type": "text",
						"label": "Tagged",
						"mono": true,
						"width": "third"
					},
					{
						"name": "nottagged",
						"type": "switch",
						"label": "Invert tagged",
						"width": "third",
						"errorMatch": [
							"invert tagged"
						]
					},
					{
						"name": "os",
						"type": "select",
						"label": "Source OS",
						"width": "third",
						"options": [
							{
								"value": "",
								"label": "Any"
							},
							{
								"value": "FreeBSD",
								"label": "FreeBSD"
							},
							{
								"value": "Linux",
								"label": "Linux"
							},
							{
								"value": "MacOS",
								"label": "MacOS"
							},
							{
								"value": "NMAP",
								"label": "NMAP"
							},
							{
								"value": "OpenBSD",
								"label": "OpenBSD"
							},
							{
								"value": "Windows",
								"label": "Windows"
							},
							{
								"value": "Windows XP",
								"label": "Windows XP"
							}
						],
						"visibleWhen": {
							"field": "proto",
							"equals": "tcp"
						},
						"errorMatch": [
							"os detection"
						]
					},
					{
						"name": "dscp",
						"type": "select",
						"label": "Diffserv code point",
						"width": "third",
						"options": [
							{
								"value": "",
								"label": "Any"
							},
							{
								"value": "af11",
								"label": "af11"
							},
							{
								"value": "af12",
								"label": "af12"
							},
							{
								"value": "af13",
								"label": "af13"
							},
							{
								"value": "af21",
								"label": "af21"
							},
							{
								"value": "af22",
								"label": "af22"
							},
							{
								"value": "af23",
								"label": "af23"
							},
							{
								"value": "af31",
								"label": "af31"
							},
							{
								"value": "af32",
								"label": "af32"
							},
							{
								"value": "af33",
								"label": "af33"
							},
							{
								"value": "af41",
								"label": "af41"
							},
							{
								"value": "af42",
								"label": "af42"
							},
							{
								"value": "af43",
								"label": "af43"
							},
							{
								"value": "VA",
								"label": "VA"
							},
							{
								"value": "EF",
								"label": "EF"
							},
							{
								"value": "cs1",
								"label": "cs1"
							},
							{
								"value": "cs2",
								"label": "cs2"
							},
							{
								"value": "cs3",
								"label": "cs3"
							},
							{
								"value": "cs4",
								"label": "cs4"
							},
							{
								"value": "cs5",
								"label": "cs5"
							},
							{
								"value": "cs6",
								"label": "cs6"
							},
							{
								"value": "cs7",
								"label": "cs7"
							},
							{
								"value": "0x01",
								"label": "0x01"
							},
							{
								"value": "0x02",
								"label": "0x02"
							},
							{
								"value": "0x04",
								"label": "0x04"
							}
						]
					},
					{
						"name": "vlanprio",
						"type": "select",
						"label": "VLAN priority",
						"width": "third",
						"options": [
							{
								"value": "",
								"label": "none"
							},
							{
								"value": "bk",
								"label": "Background (BK, 0)"
							},
							{
								"value": "be",
								"label": "Best Effort (BE, 1)"
							},
							{
								"value": "ee",
								"label": "Excellent Effort (EE, 2)"
							},
							{
								"value": "ca",
								"label": "Critical Applications (CA, 3)"
							},
							{
								"value": "vi",
								"label": "Video (VI, 4)"
							},
							{
								"value": "vo",
								"label": "Voice (VO, 5)"
							},
							{
								"value": "ic",
								"label": "Internetwork Control (IC, 6)"
							},
							{
								"value": "nc",
								"label": "Network Control (NC, 7)"
							}
						]
					},
					{
						"name": "vlanprioset",
						"type": "select",
						"label": "Set VLAN priority",
						"width": "third",
						"options": [
							{
								"value": "",
								"label": "none"
							},
							{
								"value": "bk",
								"label": "Background (BK, 0)"
							},
							{
								"value": "be",
								"label": "Best Effort (BE, 1)"
							},
							{
								"value": "ee",
								"label": "Excellent Effort (EE, 2)"
							},
							{
								"value": "ca",
								"label": "Critical Applications (CA, 3)"
							},
							{
								"value": "vi",
								"label": "Video (VI, 4)"
							},
							{
								"value": "vo",
								"label": "Voice (VO, 5)"
							},
							{
								"value": "ic",
								"label": "Internetwork Control (IC, 6)"
							},
							{
								"value": "nc",
								"label": "Network Control (NC, 7)"
							}
						]
					},
					{
						"name": "allowopts",
						"type": "switch",
						"label": "IP options",
						"text": "Allow packets with IP options",
						"width": "half"
					},
					{
						"name": "disablereplyto",
						"type": "switch",
						"label": "Reply-to",
						"text": "Disable the automatic reply-to",
						"width": "half"
					},
					{
						"name": "nopfsync",
						"type": "switch",
						"label": "No pfsync",
						"text": "Do not sync this rule's states over pfsync",
						"width": "half"
					},
					{
						"name": "nosync",
						"type": "switch",
						"label": "No XMLRPC sync",
						"text": "Do not copy this rule to HA peers",
						"width": "half"
					}
				]
			}
		],
		"readonlyWhen": {
			"field": "associated-rule-id",
			"truthy": true
		},
		"readonlyText": "This rule belongs to a port forward. Edit the NAT rule instead.",
		"resource": "firewall/rules"
	};
	var FLOATING_SCHEMA = {
		"title": "Floating rule",
		"summary": "{type} {proto} from {srctype} to {dsttype}",
		"summaryIcon": "shield-halved",
		"sections": [
			{
				"id": "rule",
				"title": "Rule",
				"fields": [
					{
						"name": "type",
						"type": "segmented",
						"label": "Action",
						"required": true,
						"default": "pass",
						"options": [
							{
								"value": "pass",
								"label": "Pass",
								"tone": "pass"
							},
							{
								"value": "block",
								"label": "Block",
								"tone": "block"
							},
							{
								"value": "reject",
								"label": "Reject",
								"tone": "reject"
							},
							{
								"value": "match",
								"label": "Match",
								"tone": "match"
							}
						],
						"errorMatch": [
							"rule type"
						],
						"help": "Block drops packets silently; reject also tells the sender (TCP reset or ICMP unreachable)."
					},
					{
						"name": "disabled",
						"type": "switch",
						"label": "Disabled",
						"text": "Keep the rule without using it"
					},
					{
						"name": "quick",
						"type": "switch",
						"label": "Quick",
						"text": "Apply the action at once on match"
					},
					{
						"name": "interface",
						"type": "checklist",
						"label": "Interfaces",
						"required": true,
						"options": []
					},
					{
						"name": "direction",
						"type": "segmented",
						"label": "Direction",
						"default": "any",
						"options": [
							{
								"value": "any",
								"label": "any"
							},
							{
								"value": "in",
								"label": "in"
							},
							{
								"value": "out",
								"label": "out"
							}
						],
						"errorMatch": [
							"without choosing a direction"
						]
					},
					{
						"name": "ipprotocol",
						"type": "segmented",
						"label": "Address family",
						"required": true,
						"default": "inet",
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
								"value": "inet46",
								"label": "IPv4+IPv6"
							}
						],
						"errorMatch": [
							"ip protocol",
							"ipv4 rules",
							"ipv6 rules",
							"both ipv4 and ipv6"
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
								"value": "etherip",
								"label": "EoIP"
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
						"errorMatch": [
							"only valid with protocol tcp",
							"only be specified for tcp protocol"
						]
					},
					{
						"name": "icmptype",
						"type": "checklist",
						"label": "ICMP subtypes",
						"options": [
							{
								"value": "any",
								"label": "any"
							},
							{
								"value": "althost",
								"label": "Alternate Host"
							},
							{
								"value": "dataconv",
								"label": "Datagram conversion error"
							},
							{
								"value": "echorep",
								"label": "Echo reply"
							},
							{
								"value": "echoreq",
								"label": "Echo request"
							},
							{
								"value": "inforep",
								"label": "Information reply"
							},
							{
								"value": "inforeq",
								"label": "Information request"
							},
							{
								"value": "ipv6-here",
								"label": "IPv6 I-am-here"
							},
							{
								"value": "ipv6-where",
								"label": "IPv6 where-are-you"
							},
							{
								"value": "maskrep",
								"label": "Address mask reply"
							},
							{
								"value": "maskreq",
								"label": "Address mask request"
							},
							{
								"value": "mobredir",
								"label": "Mobile host redirect"
							},
							{
								"value": "mobregrep",
								"label": "Mobile registration reply"
							},
							{
								"value": "mobregreq",
								"label": "Mobile registration request"
							},
							{
								"value": "paramprob",
								"label": "Parameter problem (invalid IP header)"
							},
							{
								"value": "photuris",
								"label": "Photuris"
							},
							{
								"value": "redir",
								"label": "Redirect"
							},
							{
								"value": "routeradv",
								"label": "Router advertisement"
							},
							{
								"value": "routersol",
								"label": "Router solicitation"
							},
							{
								"value": "skip",
								"label": "SKIP"
							},
							{
								"value": "squench",
								"label": "Source quench"
							},
							{
								"value": "timerep",
								"label": "Timestamp reply"
							},
							{
								"value": "timereq",
								"label": "Timestamp"
							},
							{
								"value": "timex",
								"label": "Time exceeded"
							},
							{
								"value": "trace",
								"label": "Traceroute"
							},
							{
								"value": "unreach",
								"label": "Destination unreachable"
							}
						],
						"visibleWhen": {
							"field": "proto",
							"equals": "icmp"
						},
						"help": "None or \"any\" matches every subtype.",
						"errorMatch": [
							"icmp subtype",
							"icmp types"
						]
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
						"options": []
					},
					{
						"name": "srcnot",
						"type": "switch",
						"label": "Invert match",
						"width": "half",
						"text": "Match everything except this source",
						"errorMatch": [
							"invert match"
						]
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
							"alias entries",
							"same family"
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
								"tcp/udp"
							]
						},
						"help": "A port, a port alias or \"any\".",
						"errorMatch": [
							"start source port",
							"Source port range from"
						]
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
								"tcp/udp"
							]
						},
						"help": "Leave empty for a single port.",
						"errorMatch": [
							"end source port",
							"Source port range to"
						]
					}
				]
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
						"options": []
					},
					{
						"name": "dstnot",
						"type": "switch",
						"label": "Invert match",
						"width": "half",
						"text": "Match everything except this destination",
						"errorMatch": [
							"invert match"
						]
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
							"alias entries",
							"same family"
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
								"tcp/udp"
							]
						},
						"help": "A port, a port alias or \"any\".",
						"errorMatch": [
							"start destination port",
							"Destination port range from"
						]
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
								"tcp/udp"
							]
						},
						"help": "Leave empty for a single port.",
						"errorMatch": [
							"end destination port",
							"Destination port range to"
						]
					}
				]
			},
			{
				"id": "extra",
				"title": "Description and logging",
				"fields": [
					{
						"name": "descr",
						"type": "text",
						"label": "Description",
						"maxLength": 52,
						"help": "Shown in the rule list and in the firewall log."
					},
					{
						"name": "log",
						"type": "switch",
						"label": "Log",
						"text": "Log packets matched by this rule"
					}
				]
			},
			{
				"id": "routing",
				"title": "Routing and schedule",
				"advanced": true,
				"fields": [
					{
						"name": "gateway",
						"type": "select",
						"label": "Gateway",
						"width": "half",
						"options": [],
						"help": "Default uses the routing table; a gateway or group routes matching traffic by policy (not for IPv4+IPv6).",
						"errorMatch": [
							"gateways can not",
							"gateway group",
							"an ipv4 gateway",
							"an ipv6 gateway"
						]
					},
					{
						"name": "sched",
						"type": "select",
						"label": "Schedule",
						"width": "half",
						"options": [],
						"help": "With a schedule the rule only applies in its time ranges."
					}
				]
			},
			{
				"id": "advanced",
				"title": "Advanced options",
				"advanced": true,
				"description": "State tracking, limits and tags. The defaults suit almost every rule.",
				"fields": [
					{
						"name": "statetype",
						"type": "select",
						"label": "State type",
						"width": "half",
						"default": "keep state",
						"options": [
							{
								"value": "keep state",
								"label": "Keep"
							},
							{
								"value": "sloppy state",
								"label": "Sloppy"
							},
							{
								"value": "synproxy state",
								"label": "Synproxy"
							},
							{
								"value": "none",
								"label": "None"
							}
						],
						"errorMatch": [
							"is only valid with protocol",
							"is only valid if the gateway"
						]
					},
					{
						"name": "statepolicy",
						"type": "select",
						"label": "State policy",
						"width": "half",
						"options": [
							{
								"value": "",
								"label": "Use global default"
							},
							{
								"value": "if-bound",
								"label": "Interface Bound States"
							},
							{
								"value": "floating",
								"label": "Floating States"
							}
						]
					},
					{
						"name": "max",
						"type": "number",
						"label": "Max. states",
						"min": 1,
						"width": "third",
						"errorMatch": [
							"maximum state entries (advanced"
						]
					},
					{
						"name": "max-src-nodes",
						"type": "number",
						"label": "Max. source hosts",
						"min": 1,
						"width": "third",
						"errorMatch": [
							"unique source hosts"
						]
					},
					{
						"name": "max-src-states",
						"type": "number",
						"label": "Max. states per host",
						"min": 1,
						"width": "third",
						"errorMatch": [
							"state entries per host"
						]
					},
					{
						"name": "max-src-conn",
						"type": "number",
						"label": "Max. connections per host",
						"min": 1,
						"width": "third",
						"errorMatch": [
							"established connections per host"
						]
					},
					{
						"name": "max-src-conn-rate",
						"type": "number",
						"label": "New connections",
						"min": 1,
						"width": "third",
						"errorMatch": [
							"new connections per host"
						]
					},
					{
						"name": "max-src-conn-rates",
						"type": "number",
						"label": "Per seconds",
						"min": 1,
						"width": "third"
					},
					{
						"name": "statetimeout",
						"type": "number",
						"label": "State timeout",
						"unit": "seconds",
						"min": 1,
						"width": "third"
					},
					{
						"name": "tag",
						"type": "text",
						"label": "Tag",
						"mono": true,
						"width": "third"
					},
					{
						"name": "tagged",
						"type": "text",
						"label": "Tagged",
						"mono": true,
						"width": "third"
					},
					{
						"name": "nottagged",
						"type": "switch",
						"label": "Invert tagged",
						"width": "third",
						"errorMatch": [
							"invert tagged"
						]
					},
					{
						"name": "os",
						"type": "select",
						"label": "Source OS",
						"width": "third",
						"options": [
							{
								"value": "",
								"label": "Any"
							},
							{
								"value": "FreeBSD",
								"label": "FreeBSD"
							},
							{
								"value": "Linux",
								"label": "Linux"
							},
							{
								"value": "MacOS",
								"label": "MacOS"
							},
							{
								"value": "NMAP",
								"label": "NMAP"
							},
							{
								"value": "OpenBSD",
								"label": "OpenBSD"
							},
							{
								"value": "Windows",
								"label": "Windows"
							},
							{
								"value": "Windows XP",
								"label": "Windows XP"
							}
						],
						"visibleWhen": {
							"field": "proto",
							"equals": "tcp"
						},
						"errorMatch": [
							"os detection"
						]
					},
					{
						"name": "dscp",
						"type": "select",
						"label": "Diffserv code point",
						"width": "third",
						"options": [
							{
								"value": "",
								"label": "Any"
							},
							{
								"value": "af11",
								"label": "af11"
							},
							{
								"value": "af12",
								"label": "af12"
							},
							{
								"value": "af13",
								"label": "af13"
							},
							{
								"value": "af21",
								"label": "af21"
							},
							{
								"value": "af22",
								"label": "af22"
							},
							{
								"value": "af23",
								"label": "af23"
							},
							{
								"value": "af31",
								"label": "af31"
							},
							{
								"value": "af32",
								"label": "af32"
							},
							{
								"value": "af33",
								"label": "af33"
							},
							{
								"value": "af41",
								"label": "af41"
							},
							{
								"value": "af42",
								"label": "af42"
							},
							{
								"value": "af43",
								"label": "af43"
							},
							{
								"value": "VA",
								"label": "VA"
							},
							{
								"value": "EF",
								"label": "EF"
							},
							{
								"value": "cs1",
								"label": "cs1"
							},
							{
								"value": "cs2",
								"label": "cs2"
							},
							{
								"value": "cs3",
								"label": "cs3"
							},
							{
								"value": "cs4",
								"label": "cs4"
							},
							{
								"value": "cs5",
								"label": "cs5"
							},
							{
								"value": "cs6",
								"label": "cs6"
							},
							{
								"value": "cs7",
								"label": "cs7"
							},
							{
								"value": "0x01",
								"label": "0x01"
							},
							{
								"value": "0x02",
								"label": "0x02"
							},
							{
								"value": "0x04",
								"label": "0x04"
							}
						]
					},
					{
						"name": "vlanprio",
						"type": "select",
						"label": "VLAN priority",
						"width": "third",
						"options": [
							{
								"value": "",
								"label": "none"
							},
							{
								"value": "bk",
								"label": "Background (BK, 0)"
							},
							{
								"value": "be",
								"label": "Best Effort (BE, 1)"
							},
							{
								"value": "ee",
								"label": "Excellent Effort (EE, 2)"
							},
							{
								"value": "ca",
								"label": "Critical Applications (CA, 3)"
							},
							{
								"value": "vi",
								"label": "Video (VI, 4)"
							},
							{
								"value": "vo",
								"label": "Voice (VO, 5)"
							},
							{
								"value": "ic",
								"label": "Internetwork Control (IC, 6)"
							},
							{
								"value": "nc",
								"label": "Network Control (NC, 7)"
							}
						]
					},
					{
						"name": "vlanprioset",
						"type": "select",
						"label": "Set VLAN priority",
						"width": "third",
						"options": [
							{
								"value": "",
								"label": "none"
							},
							{
								"value": "bk",
								"label": "Background (BK, 0)"
							},
							{
								"value": "be",
								"label": "Best Effort (BE, 1)"
							},
							{
								"value": "ee",
								"label": "Excellent Effort (EE, 2)"
							},
							{
								"value": "ca",
								"label": "Critical Applications (CA, 3)"
							},
							{
								"value": "vi",
								"label": "Video (VI, 4)"
							},
							{
								"value": "vo",
								"label": "Voice (VO, 5)"
							},
							{
								"value": "ic",
								"label": "Internetwork Control (IC, 6)"
							},
							{
								"value": "nc",
								"label": "Network Control (NC, 7)"
							}
						]
					},
					{
						"name": "allowopts",
						"type": "switch",
						"label": "IP options",
						"text": "Allow packets with IP options",
						"width": "half"
					},
					{
						"name": "disablereplyto",
						"type": "switch",
						"label": "Reply-to",
						"text": "Disable the automatic reply-to",
						"width": "half"
					},
					{
						"name": "nopfsync",
						"type": "switch",
						"label": "No pfsync",
						"text": "Do not sync this rule's states over pfsync",
						"width": "half"
					},
					{
						"name": "nosync",
						"type": "switch",
						"label": "No XMLRPC sync",
						"text": "Do not copy this rule to HA peers",
						"width": "half"
					}
				]
			}
		],
		"readonlyWhen": {
			"field": "associated-rule-id",
			"truthy": true
		},
		"readonlyText": "This rule belongs to a port forward. Edit the NAT rule instead.",
		"resource": "firewall/floating_rules"
	};

	var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
	var V4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
	var INVALID = 'The request failed validation.';
	var WKPORTS = { 22: 'SSH', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 123: 'NTP', 443: 'HTTPS', 587: 'SMTP/S', 993: 'IMAP/S', 1194: 'OpenVPN', 3389: 'MS RDP', 51820: 'WireGuard' };

	/* ------------------------------------------------------------- names */

	var GROUPS = [['WireGuard', 'WireGuard'], ['enc0', 'IPsec'], ['openvpn', 'OpenVPN']];
	/* filter_get_interface_list(): groups and VPNs first, as on a firewall. */
	function ifList() {
		return [GROUPS[0]].concat(M.interfaces.map(function (i) { return [i.id, i.descr]; }), GROUPS.slice(1));
	}
	function ifName(id) {
		var hit = ifList().find(function (x) { return x[0] === id; });
		return id === 'any' ? 'Any' : hit ? hit[1] : id.toUpperCase();
	}
	/* get_specialnet() for rule sources and destinations. */
	function specialnets(self) {
		var out = [['any', 'Any'], ['single', 'Address or Alias'], ['network', 'Network']];
		if (self) out.push(['(self)', 'This Firewall (self)']);
		M.interfaces.forEach(function (i) { out.push([i.id + 'ip', i.descr + ' address']); });
		M.interfaces.forEach(function (i) { out.push([i.id, i.descr + ' subnets']); });
		return out;
	}
	var GATEWAYS = [['', 'Default'], ['WAN_DHCP', 'WAN_DHCP - 203.0.113.1 - Interface WAN_DHCP Gateway'], ['WAN_DHCP6', 'WAN_DHCP6 - fe80::1 - Interface WAN_DHCP6 Gateway'],
		['WG_SITE_GW', 'WG_SITE_GW - 10.99.0.1 - Office tunnel'], ['FAILOVER', 'FAILOVER - WAN first, then WAN2']];
	var SCHEDULES = [['', 'none'], ['WorkHours', 'WorkHours'], ['KidsBedtime', 'KidsBedtime']];
	var opts = function (pairs) { return pairs.map(function (p) { return { value: p[0], label: p[1] }; }); };

	/* The schema exactly as the API builds it (restapi/schemas/firewall_rules.inc), options from the mock. */
	function schema(floating) {
		var s = clone(floating ? FLOATING_SCHEMA : RULE_SCHEMA);
		s.sections.forEach(function (sec) {
			sec.fields.forEach(function (f) {
				if (f.name === 'interface') f.options = opts((floating ? [['any', 'Any']] : []).concat(ifList()));
				if (f.name === 'srctype') f.options = opts(specialnets(floating));
				if (f.name === 'dsttype') f.options = opts(specialnets(true));
				if (f.name === 'gateway') f.options = opts(GATEWAYS);
				if (f.name === 'sched') f.options = opts(SCHEDULES);
			});
		});
		return s;
	}

	/* -------------------------------------------------------------- store */

	/* Rules as config.xml stores them (filter/rule), in evaluation order: floating first. */
	var seq = 1700000100;
	function R(o) { return Object.assign({ type: 'pass', interface: 'lan', ipprotocol: 'inet', source: { any: '' }, destination: { any: '' }, tracker: String(++seq) }, o); }
	var STORE = [
		R({ type: 'match', interface: 'wan,lan', floating: 'yes', direction: 'any', descr: 'Shaper: tag VoIP' }),
		R({ type: 'block', interface: 'wan', floating: 'yes', direction: 'in', quick: 'yes', source: { address: 'THREAT_FEEDS' }, descr: 'ThreatShield feeds (all interfaces)', log: '' }),
		R({ type: 'pass', interface: 'WireGuard', descr: 'Site tunnel peers' }),
		R({ type: 'block', interface: 'wan', source: { address: 'CROWDSEC_BLOCKLIST' }, descr: 'CrowdSec community blocklist', log: '' }),
		R({ type: 'pass', interface: 'wan', protocol: 'udp', destination: { network: 'wanip', port: '1194' }, descr: 'OpenVPN RoadWarrior' }),
		R({ type: 'pass', interface: 'wan', protocol: 'icmp', icmptype: 'echoreq', ipprotocol: 'inet46', destination: { network: 'wanip' }, descr: 'Allow ICMP echo' }),
		R({ type: 'reject', interface: 'wan', protocol: 'tcp', destination: { network: 'wanip', port: '22' }, descr: 'Old SSH access', disabled: '' }),
		R({ type: 'pass', interface: 'wan', protocol: 'tcp', destination: { address: '172.16.40.10', port: '443' }, descr: 'NAT HTTPS to web01', 'associated-rule-id': 'nat_5f2a' }),
		R({ type: 'block', interface: 'lan', protocol: 'tcp/udp', source: { network: 'lan' }, destination: { address: 'DNS_SERVERS', not: '', port: '53' }, descr: 'Force local DNS resolver', log: '' }),
		R({ type: 'pass', interface: 'lan', source: { network: 'lan' }, descr: 'Default allow LAN to any rule', tracker: '0100000101' }),
		R({ type: 'pass', interface: 'lan', ipprotocol: 'inet6', source: { network: 'lan' }, descr: 'Default allow LAN IPv6 to any rule', tracker: '0100000102' }),
		R({ type: 'pass', interface: 'lan', source: { network: 'lan' }, destination: { address: '10.50.0.0/16' }, gateway: 'WG_SITE_GW', descr: 'Office subnet via WireGuard' }),
		R({ type: 'pass', interface: 'lan', protocol: 'tcp', source: { address: 'ADMIN_HOSTS' }, destination: { network: 'opt3', port: 'SSH_ADMIN' }, descr: 'Admin to DMZ', sched: 'WorkHours' }),
		R({ type: 'block', interface: 'opt1', source: { network: 'opt1' }, destination: { address: 'RFC1918_ALL' }, descr: 'Isolate guests from private nets', log: '' }),
		R({ type: 'pass', interface: 'opt1', protocol: 'tcp/udp', source: { network: 'opt1' }, destination: { network: 'opt1ip', port: '53' }, descr: 'Guest DNS' }),
		R({ type: 'pass', interface: 'opt1', source: { network: 'opt1' }, gateway: 'WAN_DHCP', descr: 'Guest internet', sched: 'KidsBedtime' }),
		R({ type: 'pass', interface: 'opt2', protocol: 'tcp', source: { network: 'opt2' }, destination: { address: '192.168.1.70', port: '8123' }, descr: 'IoT to Home Assistant' }),
		R({ type: 'block', interface: 'opt2', source: { network: 'opt2' }, descr: 'IoT default deny', log: '' })
	];
	var tabOf = function (r) { return r.floating !== undefined ? 'floating' : r.interface; };

	function display(r) {
		var nets = {};
		specialnets(true).forEach(function (n) { nets[n[0]] = n[1]; });
		var addr = function (a) {
			a = a || {};
			var t = a.any !== undefined || a.network === 'any' ? '*' : a.network ? (nets[a.network] || a.network) : String(a.address || '');
			return (a.not !== undefined ? '! ' : '') + t;
		};
		var port = function (a) {
			var p = String((a && a.port) || '');
			if (!p) return '*';
			var b = p.split('-');
			return (b.length < 2 || b[0] === b[1]) ? b[0] + (WKPORTS[b[0]] ? ' (' + WKPORTS[b[0]] + ')' : '') : b[0] + ' - ' + b[1];
		};
		return {
			tab: tabOf(r), interfaces: String(r.interface || '').split(',').filter(Boolean).map(ifName).join(', '),
			protocol: ({ inet: 'IPv4', inet6: 'IPv6', inet46: 'IPv4+6' }[r.ipprotocol] || 'IPv4') + ' ' + (r.protocol ? r.protocol.toUpperCase() : '*'),
			source: addr(r.source), source_port: port(r.source), destination: addr(r.destination), destination_port: port(r.destination),
			gateway: r.gateway || '', schedule: r.sched || '', enabled: r.disabled === undefined, log: r.log !== undefined, nat: r['associated-rule-id'] !== undefined
		};
	}
	function out(i) { return Object.assign({ id: i }, clone(STORE[i]), { display: display(STORE[i]) }); }

	/* filter_rule_form_fields(): the stored rule as the edit form's fields. */
	var CHECKBOXES = ['disabled', 'log', 'srcnot', 'dstnot', 'allowopts', 'disablereplyto', 'nottagged', 'nopfsync', 'nosync', 'quick'];
	function formFields(r) {
		var f = {};
		Object.keys(r).forEach(function (k) {
			var v = r[k];
			if (CHECKBOXES.indexOf(k) >= 0) f[k] = 'yes';
			else if (typeof v !== 'object') f[k] = String(v);
		});
		f.interface = r.floating !== undefined ? String(r.interface).split(',') : r.interface;
		if (r.floating === undefined) delete f.floating;
		f.proto = r.protocol || 'any';
		delete f.protocol;
		['src', 'dst'].forEach(function (t) {
			var a = r[t === 'src' ? 'source' : 'destination'] || {};
			if (a.not !== undefined) f[t + 'not'] = 'yes';
			var ports = String(a.port || '').split('-');
			f[t + 'beginport'] = ports[0] || 'any';
			f[t + 'endport'] = ports[1] || ports[0] || 'any';
			if (a.any !== undefined) { f[t + 'type'] = 'any'; f[t] = 'any'; }
			else if (a.network) { f[t + 'type'] = a.network; f[t] = a.network; }
			else {
				var m = /^(.+)\/(\d+)$/.exec(a.address || '');
				f[t] = m ? m[1] : a.address;
				f[t + 'mask'] = m ? m[2] : (V4.test(a.address) ? '32' : '');
				f[t + 'type'] = m ? 'network' : 'single';
				if (!f[t + 'mask']) delete f[t + 'mask'];
			}
		});
		if (r.icmptype) f.icmptype = r.icmptype.split(',');
		delete f['associated-rule-id'];
		return f;
	}

	/* restapi_body_as_post() + a partial update: true → "yes", false removes a checkbox. */
	function overPost(body, current) {
		var post = Object.assign({}, current);
		Object.keys(body || {}).forEach(function (k) {
			var v = body[k];
			if (v === false) delete post[k];
			else if (v === true) post[k] = 'yes';
			else if (Array.isArray(v)) post[k] = v.map(String);
			else post[k] = v == null ? '' : String(v);
		});
		return post;
	}

	/* saveFilterRule(): the checks the gallery needs, with the API's messages and field mapping. */
	function check(p, floating) {
		var e = {};
		var ifs = ifList().map(function (x) { return x[0]; });
		if (floating ? !(p.interface || []).length : ifs.indexOf(p.interface) < 0) e.interface = 'At least one interface must be selected.';
		if (['pass', 'block', 'reject'].concat(floating ? ['match'] : []).indexOf(p.type) < 0) e.type = 'A valid rule type is not selected.';
		var known = {};
		specialnets(true).forEach(function (n) { known[n[0]] = true; });
		[['src', 'source'], ['dst', 'destination']].forEach(function (x) {
			var t = x[0], name = x[1];
			var type = p[t + 'type'] || 'any';
			if (!known[type]) e[t + 'type'] = 'Unknown ' + name + ' type.';
			if (type === 'single' || type === 'network') {
				var v = String(p[t] || '');
				if (!(V4.test(v) || /^[A-Za-z][A-Za-z0-9_]{0,30}$/.test(v))) e[t] = v + ' is not a valid ' + name + ' IP address or alias.';
				if (type === 'network' && !(+p[t + 'mask'] >= 1 && +p[t + 'mask'] <= 32)) e[t + 'mask'] = 'A valid ' + name + ' bit count must be specified.';
			}
			if (p[t + 'not'] && type === 'any') e[t + 'not'] = 'Invert match cannot be selected with \'any\'.';
			if (['tcp', 'udp', 'tcp/udp'].indexOf(p.proto) >= 0) {
				['begin', 'end'].forEach(function (b) {
					var v = String(p[t + b + 'port'] || '');
					if (v && v !== 'any' && !((/^\d+$/.test(v) && +v >= 1 && +v <= 65535) || /^[A-Za-z][A-Za-z0-9_]*$/.test(v)))
						e[t + b + 'port'] = v + ' is not a valid ' + (b === 'begin' ? 'start ' : 'end ') + name + ' port. It must be a port alias or integer between 1 and 65535.';
				});
			}
		});
		if (p.gateway && p.ipprotocol === 'inet46') e.gateway = 'Gateways can not be assigned in a rule that applies to both IPv4 and IPv6.';
		if (/\\/.test(p.descr || '')) e.descr = 'The \'\\\' character is not allowed in the Description field.';
		if (p.statetype && p.statetype !== 'keep state' && p.statetype !== 'none' && p.proto !== 'tcp') e.statetype = p.statetype + ' is only valid with protocol TCP.';
		return e;
	}

	/* The edit form's fields back into the stored rule. */
	function fromPost(p, old) {
		var floating = p.floating !== undefined;
		var r = { type: p.type, interface: floating ? [].concat(p.interface || []).join(',') : p.interface, ipprotocol: p.ipprotocol || 'inet', tracker: (old && old.tracker) || String(++seq) };
		if (floating) { r.floating = 'yes'; r.direction = p.direction || 'any'; }
		if (p.proto && p.proto !== 'any') r.protocol = p.proto;
		if (p.proto === 'icmp' && p.icmptype && [].concat(p.icmptype).filter(function (x) { return x !== 'any'; }).length) r.icmptype = [].concat(p.icmptype).join(',');
		[['src', 'source'], ['dst', 'destination']].forEach(function (x) {
			var t = x[0], a = {};
			var type = p[t + 'type'] || 'any';
			if (type === 'any') a.any = '';
			else if (type === 'single') a.address = p[t];
			else if (type === 'network') a.address = p[t] + '/' + p[t + 'mask'];
			else a.network = type;
			if (p[t + 'not']) a.not = '';
			if (['tcp', 'udp', 'tcp/udp'].indexOf(p.proto) >= 0) {
				var b = p[t + 'beginport'], en = p[t + 'endport'];
				if (b && b !== 'any') a.port = (en && en !== 'any' && en !== b) ? b + '-' + en : b;
			}
			r[x[1]] = a;
		});
		['descr', 'gateway', 'sched', 'statetype', 'statepolicy', 'max', 'max-src-nodes', 'max-src-states', 'max-src-conn', 'max-src-conn-rate', 'max-src-conn-rates',
			'statetimeout', 'tag', 'tagged', 'os', 'dscp', 'vlanprio', 'vlanprioset'].forEach(function (k) { if (p[k]) r[k] = p[k]; });
		CHECKBOXES.forEach(function (k) { if (p[k] && k !== 'srcnot' && k !== 'dstnot') r[k] = ''; });
		if (old && old['associated-rule-id']) r['associated-rule-id'] = old['associated-rule-id'];
		return r;
	}
	function index(id) { var i = Number(id); return (Number.isInteger(i) && i >= 0 && i < STORE.length) ? i : -1; }
	function saved(i, status) { M.markRulesPending(); return Object.assign(M.ok(out(i)), status ? { status: status } : {}); }

	/* ------------------------------------------------------------- routes */

	M.route('GET', '/api/v1/schema/firewall/rules', function () { return M.ok(schema(false)); });
	M.route('GET', '/api/v1/schema/firewall/floating_rules', function () { return M.ok(schema(true)); });
	M.route('GET', '/api/v1/firewall/rules', function (p, q) {
		var want = String(q.get('interface') || '').toLowerCase();
		return M.ok(STORE.map(function (r, i) { return i; }).filter(function (i) {
			return !want || tabOf(STORE[i]).toLowerCase() === want;
		}).map(out));
	});
	M.route('GET', '/api/v1/firewall/rules/{id}', function (p) {
		var i = index(p.id);
		return i < 0 ? M.err(404, 'No filter rule with that id.') : M.ok(Object.assign(out(i), { fields: formFields(STORE[i]) }));
	});
	M.route('POST', '/api/v1/firewall/rules', function (p, q, b) {
		var post = overPost(b || {}, {});
		var after = post.after;
		delete post.after;
		var e = check(post, post.floating !== undefined);
		if (Object.keys(e).length) return M.err(422, INVALID, e);
		var r = fromPost(post, null);
		var tab = tabOf(r);
		var at = (after !== undefined && after !== '') ? (after === '-1' ? STORE.findIndex(function (x) { return tabOf(x) === tab; }) : +after + 1) : -1;
		if (at < 0) { var last = -1; STORE.forEach(function (x, j) { if (tabOf(x) === tab) last = j; }); at = last < 0 ? STORE.length : last + 1; }
		STORE.splice(at, 0, r);
		return saved(at, 201);
	});
	M.route('PUT', '/api/v1/firewall/rules/{id}', function (p, q, b) {
		var i = index(p.id);
		if (i < 0) return M.err(404, 'No filter rule with that id.');
		var post = overPost(b || {}, formFields(STORE[i]));
		delete post.after;
		var e = check(post, post.floating !== undefined);
		if (Object.keys(e).length) return M.err(422, INVALID, e);
		STORE[i] = fromPost(post, STORE[i]);
		return saved(i);
	});
	M.route('POST', '/api/v1/firewall/rules/{id}/toggle', function (p) {
		var i = index(p.id);
		if (i < 0) return M.err(404, 'No filter rule with that id.');
		if (STORE[i].disabled !== undefined) delete STORE[i].disabled; else STORE[i].disabled = '';
		M.markRulesPending();
		return M.ok({ id: i, state: STORE[i].disabled === undefined, pending: M.pending() });
	});
	M.route('DELETE', '/api/v1/firewall/rules/{id}', function (p) {
		var i = index(p.id);
		if (i < 0) return M.err(404, 'No filter rule with that id.');
		STORE.splice(i, 1);
		M.markRulesPending();
		return M.ok({ deleted: i, pending: M.pending() });
	});
	M.route('POST', '/api/v1/firewall/rules/order', function (p, q, b) {
		b = b || {};
		var tab = String(b.interface || '').toLowerCase();
		if (!Array.isArray(b.order)) return M.err(400, '"order" must be a list of rule ids.');
		var ids = STORE.map(function (r, i) { return i; }).filter(function (i) { return tabOf(STORE[i]).toLowerCase() === tab; });
		var given = b.order.map(Number);
		if (!ids.length || given.slice().sort(function (x, y) { return x - y; }).join() !== ids.join())
			return M.err(422, INVALID, null, ['"order" must list every rule id of interface "' + b.interface + '" exactly once: ' + ids.join(', ')]);
		var rules = given.map(function (i) { return STORE[i]; });
		ids.forEach(function (slot, n) { STORE[slot] = rules[n]; });
		M.markRulesPending();
		return M.ok({ changed: true, pending: M.pending() });
	});
	/* After {id}: later routes win in the mock. */
	M.route('GET', '/api/v1/firewall/rules/tabs', function () {
		var count = function (id) { return STORE.filter(function (r) { return tabOf(r) === id; }).length; };
		return M.ok([{ id: 'floating', label: 'Floating', count: count('floating') }].concat(ifList().map(function (x) { return { id: x[0], label: x[1], count: count(x[0]) }; })));
	});
	M.route('POST', '/api/v1/firewall/rules/apply', function () { return M.dispatch('POST', '/api/v1/firewall/apply', new URLSearchParams(), {}); });

	/* For the firewall log mock: a rule of an interface. */
	M.ruleFor = function (iface) {
		var list = STORE.filter(function (r) { return tabOf(r) === iface; });
		return list.length ? list[Math.floor(Math.random() * list.length)] : STORE[0];
	};
})(window.FSMock);
