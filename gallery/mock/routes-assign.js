/*
 * routes-assign.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Mock interface assignments and L2/tunnel interfaces, as the API serves them
 * (freesense restapi/routes_interfaces.inc):
 *   GET    /api/v1/interfaces/assignments            [{interface, description, port, port_descr, removable, display}], meta {available_ports, ports, reboot_needed, pending}
 *   POST   /api/v1/interfaces/assignments            {port, confirm: true} → the next OPTn (201)
 *   PUT    /api/v1/interfaces/assignments/{name}     {port, confirm: true}
 *   DELETE /api/v1/interfaces/assignments/{name}?confirm=true   409 when in use, 403 for WAN/LAN
 *   GET    /api/v1/interfaces/assignments/pending    {pending, reboot_needed, reload_pending, message}
 *   GET/POST/PUT/DELETE /api/v1/interfaces/{vlans|qinqs|bridges|laggs|gifs|gres|groups}[/{id}]   items with fields + display
 *   GET    /api/v1/schema/network/{vlans|qinq|bridges|laggs|gifs|gres|groups|assignments}   captured schemas (choices from the mock)
 */
(function (M) {
	'use strict';

	var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
	var INVALID = 'The request failed validation.';
	var V4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
	var SCHEMAS = {
		"vlans": {
			"title": "VLAN",
			"summary": "VLAN {tag} on {if}",
			"summaryIcon": "tags",
			"sections": [
				{
					"id": "vlan",
					"title": "VLAN configuration",
					"fields": [
						{
							"name": "if",
							"type": "select",
							"label": "Parent interface",
							"required": true,
							"width": "half",
							"options": [
								{
									"value": "em0",
									"label": "em0 (00:0c:29:1d:3b:51) - wan"
								},
								{
									"value": "em1",
									"label": "em1 (00:0c:29:1d:3b:5b) - lan"
								},
								{
									"value": "tun_wg0",
									"label": "tun_wg0 (tun_wg0)"
								}
							],
							"help": "Only VLAN capable interfaces are shown.",
							"errorMatch": [
								"supplied as parent"
							]
						},
						{
							"name": "tag_type",
							"type": "select",
							"label": "VLAN tag type",
							"required": true,
							"width": "half",
							"default": "ctag",
							"options": [
								{
									"value": "ctag",
									"label": "C-Tag (0x8100)"
								},
								{
									"value": "stag",
									"label": "S-Tag (0x88A8)"
								}
							],
							"help": "The type of VLAN tag to use (defaults to C-Tag)."
						},
						{
							"name": "tag",
							"type": "number",
							"label": "VLAN tag",
							"required": true,
							"min": 1,
							"max": 4094,
							"width": "half",
							"placeholder": "1",
							"help": "802.1Q VLAN tag (between 1 and 4094). It cannot change while the VLAN is assigned.",
							"errorMatch": [
								"a vlan with the tag",
								"qinq vlan exists"
							]
						},
						{
							"name": "pcp",
							"type": "number",
							"label": "VLAN priority",
							"min": 0,
							"max": 7,
							"width": "half",
							"placeholder": "0",
							"help": "802.1Q VLAN priority (between 0 and 7)."
						},
						{
							"name": "descr",
							"type": "text",
							"label": "Description",
							"help": "A description for administrative reference (not parsed)."
						}
					]
				}
			],
			"resource": "network/vlans"
		},
		"qinq": {
			"title": "QinQ",
			"summary": "QinQ {tag} on {if}",
			"summaryIcon": "layer-group",
			"sections": [
				{
					"id": "qinq",
					"title": "QinQ configuration",
					"fields": [
						{
							"name": "if",
							"type": "select",
							"label": "Parent interface",
							"required": true,
							"width": "half",
							"options": [
								{
									"value": "em0",
									"label": "em0 (00:0c:29:1d:3b:51)"
								},
								{
									"value": "em1",
									"label": "em1 (00:0c:29:1d:3b:5b)"
								},
								{
									"value": "tun_wg0",
									"label": "tun_wg0 (tun_wg0)"
								}
							],
							"help": "Only QinQ capable interfaces are shown. It cannot be changed later.",
							"errorMatch": [
								"supplied as parent",
								"modifying the interface"
							]
						},
						{
							"name": "tag_type",
							"type": "select",
							"label": "VLAN tag type",
							"required": true,
							"width": "half",
							"default": "stag",
							"options": [
								{
									"value": "ctag",
									"label": "C-Tag (0x8100)"
								},
								{
									"value": "stag",
									"label": "S-Tag (0x88A8)"
								}
							],
							"help": "The type of VLAN tag to use for the first level tag (defaults to S-Tag)."
						},
						{
							"name": "tag",
							"type": "number",
							"label": "First level tag",
							"required": true,
							"min": 1,
							"max": 4094,
							"width": "half",
							"help": "The outer VLAN tag; the member tags below are stacked on it. It cannot be changed later.",
							"errorMatch": [
								"qinq level already exists",
								"a normal vlan exists"
							]
						},
						{
							"name": "autogroup",
							"type": "switch",
							"label": "Interface group",
							"width": "half",
							"text": "Add the interfaces to the QinQ interface group",
							"help": "Allows rules to be written more easily."
						},
						{
							"name": "descr",
							"type": "text",
							"label": "Description",
							"help": "A description for administrative reference (not parsed)."
						},
						{
							"name": "members",
							"type": "entry-grid",
							"label": "Tags",
							"required": true,
							"min": 1,
							"addLabel": "Add tag",
							"help": "Member tags: a tag (2) or a range (2-3) per row.",
							"fields": [
								{
									"name": "tag",
									"type": "text",
									"label": "Tag or range",
									"mono": true,
									"placeholder": "10-20"
								}
							],
							"errorMatch": [
								"at least one tag",
								"qinq tag cannot be deleted"
							]
						}
					]
				}
			],
			"resource": "network/qinq"
		},
		"bridges": {
			"title": "Bridge",
			"summary": "Bridge of {members}",
			"summaryIcon": "bridge",
			"sections": [
				{
					"id": "bridge",
					"title": "Bridge configuration",
					"fields": [
						{
							"name": "members",
							"type": "checklist",
							"label": "Member interfaces",
							"options": [
								{
									"value": "wan",
									"label": "WAN"
								},
								{
									"value": "lan",
									"label": "LAN"
								}
							],
							"help": "Interfaces participating in the bridge.",
							"errorMatch": [
								"at least one member interface",
								"a member interface passed",
								"cannot be a member of a bridge",
								"bridging a wireless",
								"part of another bridge",
								"captive portal"
							],
							"required": true
						},
						{
							"name": "descr",
							"type": "text",
							"label": "Description",
							"help": "A description for administrative reference (not parsed)."
						}
					]
				},
				{
					"id": "advanced",
					"title": "Advanced configuration",
					"advanced": true,
					"fields": [
						{
							"name": "maxaddr",
							"type": "number",
							"label": "Cache size",
							"min": 0,
							"width": "half",
							"placeholder": "2000",
							"help": "Size of the bridge address cache. The default is 2000 entries.",
							"errorMatch": [
								"maxaddr"
							]
						},
						{
							"name": "timeout",
							"type": "number",
							"label": "Cache expire time",
							"min": 0,
							"unit": "seconds",
							"width": "half",
							"placeholder": "1200",
							"help": "Address cache entries expire after this many seconds; 0 never expires them. The default is 1200 seconds.",
							"errorMatch": [
								"timeout needs"
							]
						},
						{
							"name": "span",
							"type": "checklist",
							"label": "Span ports",
							"options": [
								{
									"value": "wan",
									"label": "WAN"
								},
								{
									"value": "lan",
									"label": "LAN"
								}
							],
							"help": "Span ports transmit a copy of every frame received by the bridge, for passively snooping a bridged network. A span port cannot be a bridge member.",
							"errorMatch": [
								"span interface"
							]
						},
						{
							"name": "edge",
							"type": "checklist",
							"label": "Edge ports",
							"options": [
								{
									"value": "wan",
									"label": "WAN"
								},
								{
									"value": "lan",
									"label": "LAN"
								}
							],
							"help": "An edge port connects directly to end stations and cannot create bridging loops; it transitions straight to forwarding.",
							"errorMatch": [
								"edge interface"
							]
						},
						{
							"name": "autoedge",
							"type": "checklist",
							"label": "Auto edge ports",
							"options": [
								{
									"value": "wan",
									"label": "WAN"
								},
								{
									"value": "lan",
									"label": "LAN"
								}
							],
							"help": "Automatically detect the edge status (the default for all members). Selecting an interface here disables its auto edge status.",
							"errorMatch": [
								"auto edge interface"
							]
						},
						{
							"name": "ptp",
							"type": "checklist",
							"label": "PTP ports",
							"options": [
								{
									"value": "wan",
									"label": "WAN"
								},
								{
									"value": "lan",
									"label": "LAN"
								}
							],
							"help": "Mark the interface as a point-to-point link, required for straight transitions to forwarding on a direct link to another RSTP-capable switch.",
							"errorMatch": [
								"ptp interface"
							]
						},
						{
							"name": "autoptp",
							"type": "checklist",
							"label": "Auto PTP ports",
							"options": [
								{
									"value": "wan",
									"label": "WAN"
								},
								{
									"value": "lan",
									"label": "LAN"
								}
							],
							"help": "Automatically detect the point-to-point status from the full duplex link status (the default for members). Selecting an interface here disables it.",
							"errorMatch": [
								"auto ptp interface"
							]
						},
						{
							"name": "static",
							"type": "checklist",
							"label": "Sticky ports",
							"options": [
								{
									"value": "wan",
									"label": "WAN"
								},
								{
									"value": "lan",
									"label": "LAN"
								}
							],
							"help": "Dynamically learned addresses on a sticky interface are treated as static: they never age out or move to another interface.",
							"errorMatch": [
								"sticky interface"
							]
						},
						{
							"name": "private",
							"type": "checklist",
							"label": "Private ports",
							"options": [
								{
									"value": "wan",
									"label": "WAN"
								},
								{
									"value": "lan",
									"label": "LAN"
								}
							],
							"help": "A private interface does not forward traffic to any other private interface.",
							"errorMatch": [
								"private interface"
							]
						},
						{
							"name": "ip6linklocal",
							"type": "switch",
							"label": "IPv6 auto link-local",
							"text": "Set AUTO_LINKLOCAL on the bridge and clear it on every member",
							"help": "Required when the bridge interface is used for stateless autoconfiguration."
						},
						{
							"name": "enablestp",
							"type": "switch",
							"label": "RSTP/STP",
							"text": "Enable RSTP/STP"
						}
					]
				},
				{
					"id": "stp",
					"title": "RSTP/STP",
					"advanced": true,
					"visibleWhen": {
						"field": "enablestp",
						"truthy": true
					},
					"fields": [
						{
							"name": "proto",
							"type": "segmented",
							"label": "Protocol",
							"default": "rstp",
							"options": [
								{
									"value": "rstp",
									"label": "RSTP"
								},
								{
									"value": "stp",
									"label": "STP"
								}
							],
							"help": "Protocol used for spanning tree."
						},
						{
							"name": "stp",
							"type": "checklist",
							"label": "STP interfaces",
							"options": [
								{
									"value": "wan",
									"label": "WAN"
								},
								{
									"value": "lan",
									"label": "LAN"
								}
							],
							"help": "Enable the Spanning Tree Protocol on these members to detect and remove loops.",
							"errorMatch": [
								"stp interface"
							]
						},
						{
							"name": "maxage",
							"type": "number",
							"label": "Valid time",
							"min": 6,
							"max": 40,
							"unit": "seconds",
							"placeholder": "20",
							"width": "third",
							"help": "How long an STP configuration is valid. Default 20 seconds.",
							"errorMatch": [
								"maxage"
							]
						},
						{
							"name": "fwdelay",
							"type": "number",
							"label": "Forward time",
							"min": 4,
							"max": 30,
							"unit": "seconds",
							"placeholder": "15",
							"width": "third",
							"help": "Time before an interface begins forwarding. Default 15 seconds.",
							"errorMatch": [
								"forward delay"
							]
						},
						{
							"name": "hellotime",
							"type": "number",
							"label": "Hello time",
							"min": 1,
							"max": 2,
							"unit": "seconds",
							"placeholder": "2",
							"width": "third",
							"help": "Time between STP configuration messages; only changes in legacy STP mode. Default 2 seconds."
						},
						{
							"name": "priority",
							"type": "number",
							"label": "Priority",
							"min": 0,
							"max": 61440,
							"placeholder": "32768",
							"width": "half",
							"help": "Bridge priority for spanning tree. Default 32768.",
							"errorMatch": [
								"priority for stp"
							]
						},
						{
							"name": "holdcnt",
							"type": "number",
							"label": "Hold count",
							"min": 1,
							"max": 10,
							"placeholder": "6",
							"width": "half",
							"help": "Packets transmitted before being rate limited. Default 6.",
							"errorMatch": [
								"transmit hold count"
							]
						}
					]
				},
				{
					"id": "stp_ports",
					"title": "Per-interface spanning tree",
					"advanced": true,
					"visibleWhen": {
						"field": "enablestp",
						"truthy": true
					},
					"description": "Priority 0-240 in steps of 16 (default 128); path cost 1-200000000, 0 or empty for automatic.",
					"fields": [
						{
							"name": "ifpriority.wan",
							"type": "number",
							"label": "WAN priority",
							"min": 0,
							"max": 240,
							"step": 16,
							"placeholder": "128",
							"width": "half",
							"errorMatch": [
								"wan interface priority"
							]
						},
						{
							"name": "ifpathcost.wan",
							"type": "number",
							"label": "WAN path cost",
							"min": 0,
							"max": 200000000,
							"placeholder": "0",
							"width": "half",
							"errorMatch": [
								"wan interface path cost"
							]
						},
						{
							"name": "ifpriority.lan",
							"type": "number",
							"label": "LAN priority",
							"min": 0,
							"max": 240,
							"step": 16,
							"placeholder": "128",
							"width": "half",
							"errorMatch": [
								"lan interface priority"
							]
						},
						{
							"name": "ifpathcost.lan",
							"type": "number",
							"label": "LAN path cost",
							"min": 0,
							"max": 200000000,
							"placeholder": "0",
							"width": "half",
							"errorMatch": [
								"lan interface path cost"
							]
						}
					]
				}
			],
			"resource": "network/bridges"
		},
		"laggs": {
			"title": "LAGG",
			"summary": "{proto} LAGG of {members}",
			"summaryIcon": "link",
			"sections": [
				{
					"id": "lagg",
					"title": "LAGG configuration",
					"fields": [
						{
							"name": "members",
							"type": "checklist",
							"label": "Member interfaces",
							"required": true,
							"options": [
								{
									"value": "ovpns1",
									"label": "ovpns1 (ovpns1)"
								},
								{
									"value": "tun_wg0",
									"label": "tun_wg0 (tun_wg0)"
								}
							],
							"optionsFrom": "member_choices",
							"help": "The ports aggregated by the LAGG. Assigned ports and members of other LAGGs are not offered.",
							"errorMatch": [
								"supplied as member"
							]
						},
						{
							"name": "proto",
							"type": "select",
							"label": "LAGG protocol",
							"required": true,
							"default": "none",
							"width": "half",
							"options": [
								{
									"value": "none",
									"label": "NONE",
									"detail": "Disables any traffic without disabling the LAGG interface itself."
								},
								{
									"value": "lacp",
									"label": "LACP",
									"detail": "IEEE 802.3ad Link Aggregation Control Protocol: negotiates aggregable links with the peer; ports must have the same speed and run full duplex."
								},
								{
									"value": "failover",
									"label": "FAILOVER",
									"detail": "Sends and receives only through the master port; the next active port takes over when it fails."
								},
								{
									"value": "loadbalance",
									"label": "LOADBALANCE",
									"detail": "Balances outgoing traffic by a hash of the protocol headers and accepts incoming traffic on any active port. Static: nothing is negotiated with the peer."
								},
								{
									"value": "roundrobin",
									"label": "ROUNDROBIN",
									"detail": "Distributes outgoing traffic round-robin over all active ports and accepts incoming traffic on any active port."
								}
							],
							"errorMatch": [
								"protocol supplied"
							]
						},
						{
							"name": "failovermaster",
							"type": "select",
							"label": "Failover master interface",
							"default": "auto",
							"width": "half",
							"options": [
								{
									"value": "auto",
									"label": "auto"
								},
								{
									"value": "ovpns1",
									"label": "ovpns1 (ovpns1)"
								},
								{
									"value": "tun_wg0",
									"label": "tun_wg0 (tun_wg0)"
								}
							],
							"optionsFrom": "failovermaster_choices",
							"visibleWhen": {
								"field": "proto",
								"equals": "failover"
							},
							"help": "With auto the first member is the master; the others are failover ports."
						},
						{
							"name": "lacptimeout",
							"type": "segmented",
							"label": "LACP timeout",
							"default": "slow",
							"options": [
								{
									"value": "slow",
									"label": "Slow (default)"
								},
								{
									"value": "fast",
									"label": "Fast"
								}
							],
							"visibleWhen": {
								"field": "proto",
								"equals": "lacp"
							},
							"help": "PDUs are sent every 30 seconds (slow) or every second (fast); the timeout is three missed PDUs."
						},
						{
							"name": "lagghash",
							"type": "select",
							"label": "Hash algorithm",
							"default": "l2,l3,l4",
							"width": "half",
							"options": [
								{
									"value": "l2,l3,l4",
									"label": "Layer 2/3/4 (default)"
								},
								{
									"value": "l2",
									"label": "Layer 2 (MAC Address)"
								},
								{
									"value": "l3",
									"label": "Layer 3 (IP Address)"
								},
								{
									"value": "l4",
									"label": "Layer 4 (Port Number)"
								},
								{
									"value": "l2,l3",
									"label": "Layer 2/3 (MAC + IP)"
								},
								{
									"value": "l3,l4",
									"label": "Layer 3/4 (IP + Port)"
								},
								{
									"value": "l2,l4",
									"label": "Layer 2/4 (MAC + Port)"
								}
							],
							"visibleWhen": {
								"field": "proto",
								"in": [
									"lacp",
									"loadbalance"
								]
							},
							"help": "Packet layers hashed to choose a port: 2 MAC address and VLAN, 3 IP address, 4 port."
						},
						{
							"name": "descr",
							"type": "text",
							"label": "Description",
							"help": "A description for administrative reference (not parsed)."
						}
					]
				}
			],
			"resource": "network/laggs"
		},
		"gifs": {
			"title": "GIF tunnel",
			"summary": "GIF tunnel to {remote-addr}",
			"summaryIcon": "route",
			"sections": [
				{
					"id": "gif",
					"title": "GIF configuration",
					"fields": [
						{
							"name": "if",
							"type": "select",
							"label": "Parent interface",
							"required": true,
							"width": "half",
							"strict": false,
							"options": [
								{
									"value": "wan",
									"label": "WAN"
								},
								{
									"value": "lan",
									"label": "LAN"
								},
								{
									"value": "lo0",
									"label": "Localhost"
								}
							],
							"help": "This interface serves as the local address of the tunnel."
						},
						{
							"name": "remote-addr",
							"type": "text",
							"label": "GIF remote address",
							"required": true,
							"mono": true,
							"width": "half",
							"help": "Peer address where encapsulated GIF packets are sent.",
							"errorMatch": [
								"remote peer address"
							]
						},
						{
							"name": "tunnel-local-addr",
							"type": "text",
							"label": "GIF tunnel local address",
							"required": true,
							"mono": true,
							"width": "third",
							"help": "Local GIF tunnel endpoint.",
							"errorMatch": [
								"tunnel local and tunnel remote"
							]
						},
						{
							"name": "tunnel-remote-addr",
							"type": "text",
							"label": "GIF tunnel remote address",
							"required": true,
							"mono": true,
							"width": "third",
							"help": "Remote GIF tunnel endpoint.",
							"errorMatch": [
								"a gif with the network"
							]
						},
						{
							"name": "tunnel-remote-net",
							"type": "select",
							"label": "GIF tunnel subnet",
							"required": true,
							"width": "third",
							"default": "128",
							"options": [
								{
									"value": "128",
									"label": "128"
								},
								{
									"value": "127",
									"label": "127"
								},
								{
									"value": "126",
									"label": "126"
								},
								{
									"value": "125",
									"label": "125"
								},
								{
									"value": "124",
									"label": "124"
								},
								{
									"value": "123",
									"label": "123"
								},
								{
									"value": "122",
									"label": "122"
								},
								{
									"value": "121",
									"label": "121"
								},
								{
									"value": "120",
									"label": "120"
								},
								{
									"value": "119",
									"label": "119"
								},
								{
									"value": "118",
									"label": "118"
								},
								{
									"value": "117",
									"label": "117"
								},
								{
									"value": "116",
									"label": "116"
								},
								{
									"value": "115",
									"label": "115"
								},
								{
									"value": "114",
									"label": "114"
								},
								{
									"value": "113",
									"label": "113"
								},
								{
									"value": "112",
									"label": "112"
								},
								{
									"value": "111",
									"label": "111"
								},
								{
									"value": "110",
									"label": "110"
								},
								{
									"value": "109",
									"label": "109"
								},
								{
									"value": "108",
									"label": "108"
								},
								{
									"value": "107",
									"label": "107"
								},
								{
									"value": "106",
									"label": "106"
								},
								{
									"value": "105",
									"label": "105"
								},
								{
									"value": "104",
									"label": "104"
								},
								{
									"value": "103",
									"label": "103"
								},
								{
									"value": "102",
									"label": "102"
								},
								{
									"value": "101",
									"label": "101"
								},
								{
									"value": "100",
									"label": "100"
								},
								{
									"value": "99",
									"label": "99"
								},
								{
									"value": "98",
									"label": "98"
								},
								{
									"value": "97",
									"label": "97"
								},
								{
									"value": "96",
									"label": "96"
								},
								{
									"value": "95",
									"label": "95"
								},
								{
									"value": "94",
									"label": "94"
								},
								{
									"value": "93",
									"label": "93"
								},
								{
									"value": "92",
									"label": "92"
								},
								{
									"value": "91",
									"label": "91"
								},
								{
									"value": "90",
									"label": "90"
								},
								{
									"value": "89",
									"label": "89"
								},
								{
									"value": "88",
									"label": "88"
								},
								{
									"value": "87",
									"label": "87"
								},
								{
									"value": "86",
									"label": "86"
								},
								{
									"value": "85",
									"label": "85"
								},
								{
									"value": "84",
									"label": "84"
								},
								{
									"value": "83",
									"label": "83"
								},
								{
									"value": "82",
									"label": "82"
								},
								{
									"value": "81",
									"label": "81"
								},
								{
									"value": "80",
									"label": "80"
								},
								{
									"value": "79",
									"label": "79"
								},
								{
									"value": "78",
									"label": "78"
								},
								{
									"value": "77",
									"label": "77"
								},
								{
									"value": "76",
									"label": "76"
								},
								{
									"value": "75",
									"label": "75"
								},
								{
									"value": "74",
									"label": "74"
								},
								{
									"value": "73",
									"label": "73"
								},
								{
									"value": "72",
									"label": "72"
								},
								{
									"value": "71",
									"label": "71"
								},
								{
									"value": "70",
									"label": "70"
								},
								{
									"value": "69",
									"label": "69"
								},
								{
									"value": "68",
									"label": "68"
								},
								{
									"value": "67",
									"label": "67"
								},
								{
									"value": "66",
									"label": "66"
								},
								{
									"value": "65",
									"label": "65"
								},
								{
									"value": "64",
									"label": "64"
								},
								{
									"value": "63",
									"label": "63"
								},
								{
									"value": "62",
									"label": "62"
								},
								{
									"value": "61",
									"label": "61"
								},
								{
									"value": "60",
									"label": "60"
								},
								{
									"value": "59",
									"label": "59"
								},
								{
									"value": "58",
									"label": "58"
								},
								{
									"value": "57",
									"label": "57"
								},
								{
									"value": "56",
									"label": "56"
								},
								{
									"value": "55",
									"label": "55"
								},
								{
									"value": "54",
									"label": "54"
								},
								{
									"value": "53",
									"label": "53"
								},
								{
									"value": "52",
									"label": "52"
								},
								{
									"value": "51",
									"label": "51"
								},
								{
									"value": "50",
									"label": "50"
								},
								{
									"value": "49",
									"label": "49"
								},
								{
									"value": "48",
									"label": "48"
								},
								{
									"value": "47",
									"label": "47"
								},
								{
									"value": "46",
									"label": "46"
								},
								{
									"value": "45",
									"label": "45"
								},
								{
									"value": "44",
									"label": "44"
								},
								{
									"value": "43",
									"label": "43"
								},
								{
									"value": "42",
									"label": "42"
								},
								{
									"value": "41",
									"label": "41"
								},
								{
									"value": "40",
									"label": "40"
								},
								{
									"value": "39",
									"label": "39"
								},
								{
									"value": "38",
									"label": "38"
								},
								{
									"value": "37",
									"label": "37"
								},
								{
									"value": "36",
									"label": "36"
								},
								{
									"value": "35",
									"label": "35"
								},
								{
									"value": "34",
									"label": "34"
								},
								{
									"value": "33",
									"label": "33"
								},
								{
									"value": "32",
									"label": "32"
								},
								{
									"value": "31",
									"label": "31"
								},
								{
									"value": "30",
									"label": "30"
								},
								{
									"value": "29",
									"label": "29"
								},
								{
									"value": "28",
									"label": "28"
								},
								{
									"value": "27",
									"label": "27"
								},
								{
									"value": "26",
									"label": "26"
								},
								{
									"value": "25",
									"label": "25"
								},
								{
									"value": "24",
									"label": "24"
								},
								{
									"value": "23",
									"label": "23"
								},
								{
									"value": "22",
									"label": "22"
								},
								{
									"value": "21",
									"label": "21"
								},
								{
									"value": "20",
									"label": "20"
								},
								{
									"value": "19",
									"label": "19"
								},
								{
									"value": "18",
									"label": "18"
								},
								{
									"value": "17",
									"label": "17"
								},
								{
									"value": "16",
									"label": "16"
								},
								{
									"value": "15",
									"label": "15"
								},
								{
									"value": "14",
									"label": "14"
								},
								{
									"value": "13",
									"label": "13"
								},
								{
									"value": "12",
									"label": "12"
								},
								{
									"value": "11",
									"label": "11"
								},
								{
									"value": "10",
									"label": "10"
								},
								{
									"value": "9",
									"label": "9"
								},
								{
									"value": "8",
									"label": "8"
								},
								{
									"value": "7",
									"label": "7"
								},
								{
									"value": "6",
									"label": "6"
								},
								{
									"value": "5",
									"label": "5"
								},
								{
									"value": "4",
									"label": "4"
								},
								{
									"value": "3",
									"label": "3"
								},
								{
									"value": "2",
									"label": "2"
								},
								{
									"value": "1",
									"label": "1"
								}
							],
							"help": "Prefix length of the tunnelled network (1-32 for IPv4).",
							"errorMatch": [
								"gif tunnel remote netmask"
							]
						},
						{
							"name": "link1",
							"type": "switch",
							"label": "ECN friendly behavior",
							"text": "ECN friendly behavior (violates RFC 2893; agree with the peer)"
						},
						{
							"name": "link2",
							"type": "switch",
							"label": "Outer source filtering",
							"text": "Disable automatic filtering of the outer GIF source",
							"help": "When disabled, martian and inbound filtering is not performed, which allows asymmetric routing of the outer traffic."
						},
						{
							"name": "descr",
							"type": "text",
							"label": "Description",
							"help": "A description for administrative reference (not parsed)."
						}
					]
				}
			],
			"resource": "network/gifs"
		},
		"gres": {
			"title": "GRE tunnel",
			"summary": "GRE tunnel to {remote-addr}",
			"summaryIcon": "route",
			"sections": [
				{
					"id": "gre",
					"title": "GRE configuration",
					"fields": [
						{
							"name": "if",
							"type": "select",
							"label": "Parent interface",
							"required": true,
							"width": "half",
							"strict": false,
							"options": [
								{
									"value": "wan",
									"label": "WAN"
								},
								{
									"value": "lan",
									"label": "LAN"
								},
								{
									"value": "lo0",
									"label": "Localhost"
								}
							],
							"help": "This interface serves as the local address of the tunnel."
						},
						{
							"name": "remote-addr",
							"type": "text",
							"label": "Remote address",
							"required": true,
							"mono": true,
							"width": "half",
							"help": "Peer address where encapsulated GRE packets are sent."
						}
					]
				},
				{
					"id": "ipv4",
					"title": "IPv4",
					"description": "Leave empty for an IPv6-only tunnel.",
					"fields": [
						{
							"name": "tunnel-local-addr",
							"type": "text",
							"label": "Local IPv4 tunnel address",
							"mono": true,
							"width": "third",
							"errorMatch": [
								"ipv4 local tunnel address",
								"needs either a valid ipv4 or ipv6"
							]
						},
						{
							"name": "tunnel-remote-addr",
							"type": "text",
							"label": "Remote IPv4 tunnel address",
							"mono": true,
							"width": "third",
							"errorMatch": [
								"ipv4 remote tunnel address",
								"same ipv4 tunnel network"
							]
						},
						{
							"name": "tunnel-remote-net",
							"type": "select",
							"label": "IPv4 tunnel subnet",
							"width": "third",
							"default": "32",
							"options": [
								{
									"value": "32",
									"label": "32"
								},
								{
									"value": "31",
									"label": "31"
								},
								{
									"value": "30",
									"label": "30"
								},
								{
									"value": "29",
									"label": "29"
								},
								{
									"value": "28",
									"label": "28"
								},
								{
									"value": "27",
									"label": "27"
								},
								{
									"value": "26",
									"label": "26"
								},
								{
									"value": "25",
									"label": "25"
								},
								{
									"value": "24",
									"label": "24"
								},
								{
									"value": "23",
									"label": "23"
								},
								{
									"value": "22",
									"label": "22"
								},
								{
									"value": "21",
									"label": "21"
								},
								{
									"value": "20",
									"label": "20"
								},
								{
									"value": "19",
									"label": "19"
								},
								{
									"value": "18",
									"label": "18"
								},
								{
									"value": "17",
									"label": "17"
								},
								{
									"value": "16",
									"label": "16"
								},
								{
									"value": "15",
									"label": "15"
								},
								{
									"value": "14",
									"label": "14"
								},
								{
									"value": "13",
									"label": "13"
								},
								{
									"value": "12",
									"label": "12"
								},
								{
									"value": "11",
									"label": "11"
								},
								{
									"value": "10",
									"label": "10"
								},
								{
									"value": "9",
									"label": "9"
								},
								{
									"value": "8",
									"label": "8"
								},
								{
									"value": "7",
									"label": "7"
								},
								{
									"value": "6",
									"label": "6"
								},
								{
									"value": "5",
									"label": "5"
								},
								{
									"value": "4",
									"label": "4"
								},
								{
									"value": "3",
									"label": "3"
								},
								{
									"value": "2",
									"label": "2"
								},
								{
									"value": "1",
									"label": "1"
								}
							],
							"help": "Prefix length of the tunnelled IPv4 network."
						}
					]
				},
				{
					"id": "ipv6",
					"title": "IPv6",
					"description": "Leave empty for an IPv4-only tunnel.",
					"fields": [
						{
							"name": "tunnel-local-addr6",
							"type": "text",
							"label": "Local IPv6 tunnel address",
							"mono": true,
							"width": "third",
							"errorMatch": [
								"ipv6 local tunnel address"
							]
						},
						{
							"name": "tunnel-remote-addr6",
							"type": "text",
							"label": "Remote IPv6 tunnel address",
							"mono": true,
							"width": "third",
							"errorMatch": [
								"ipv6 remote tunnel address",
								"same ipv6 tunnel network"
							]
						},
						{
							"name": "tunnel-remote-net6",
							"type": "select",
							"label": "IPv6 tunnel subnet",
							"width": "third",
							"default": "128",
							"options": [
								{
									"value": "128",
									"label": "128"
								},
								{
									"value": "127",
									"label": "127"
								},
								{
									"value": "126",
									"label": "126"
								},
								{
									"value": "125",
									"label": "125"
								},
								{
									"value": "124",
									"label": "124"
								},
								{
									"value": "123",
									"label": "123"
								},
								{
									"value": "122",
									"label": "122"
								},
								{
									"value": "121",
									"label": "121"
								},
								{
									"value": "120",
									"label": "120"
								},
								{
									"value": "119",
									"label": "119"
								},
								{
									"value": "118",
									"label": "118"
								},
								{
									"value": "117",
									"label": "117"
								},
								{
									"value": "116",
									"label": "116"
								},
								{
									"value": "115",
									"label": "115"
								},
								{
									"value": "114",
									"label": "114"
								},
								{
									"value": "113",
									"label": "113"
								},
								{
									"value": "112",
									"label": "112"
								},
								{
									"value": "111",
									"label": "111"
								},
								{
									"value": "110",
									"label": "110"
								},
								{
									"value": "109",
									"label": "109"
								},
								{
									"value": "108",
									"label": "108"
								},
								{
									"value": "107",
									"label": "107"
								},
								{
									"value": "106",
									"label": "106"
								},
								{
									"value": "105",
									"label": "105"
								},
								{
									"value": "104",
									"label": "104"
								},
								{
									"value": "103",
									"label": "103"
								},
								{
									"value": "102",
									"label": "102"
								},
								{
									"value": "101",
									"label": "101"
								},
								{
									"value": "100",
									"label": "100"
								},
								{
									"value": "99",
									"label": "99"
								},
								{
									"value": "98",
									"label": "98"
								},
								{
									"value": "97",
									"label": "97"
								},
								{
									"value": "96",
									"label": "96"
								},
								{
									"value": "95",
									"label": "95"
								},
								{
									"value": "94",
									"label": "94"
								},
								{
									"value": "93",
									"label": "93"
								},
								{
									"value": "92",
									"label": "92"
								},
								{
									"value": "91",
									"label": "91"
								},
								{
									"value": "90",
									"label": "90"
								},
								{
									"value": "89",
									"label": "89"
								},
								{
									"value": "88",
									"label": "88"
								},
								{
									"value": "87",
									"label": "87"
								},
								{
									"value": "86",
									"label": "86"
								},
								{
									"value": "85",
									"label": "85"
								},
								{
									"value": "84",
									"label": "84"
								},
								{
									"value": "83",
									"label": "83"
								},
								{
									"value": "82",
									"label": "82"
								},
								{
									"value": "81",
									"label": "81"
								},
								{
									"value": "80",
									"label": "80"
								},
								{
									"value": "79",
									"label": "79"
								},
								{
									"value": "78",
									"label": "78"
								},
								{
									"value": "77",
									"label": "77"
								},
								{
									"value": "76",
									"label": "76"
								},
								{
									"value": "75",
									"label": "75"
								},
								{
									"value": "74",
									"label": "74"
								},
								{
									"value": "73",
									"label": "73"
								},
								{
									"value": "72",
									"label": "72"
								},
								{
									"value": "71",
									"label": "71"
								},
								{
									"value": "70",
									"label": "70"
								},
								{
									"value": "69",
									"label": "69"
								},
								{
									"value": "68",
									"label": "68"
								},
								{
									"value": "67",
									"label": "67"
								},
								{
									"value": "66",
									"label": "66"
								},
								{
									"value": "65",
									"label": "65"
								},
								{
									"value": "64",
									"label": "64"
								},
								{
									"value": "63",
									"label": "63"
								},
								{
									"value": "62",
									"label": "62"
								},
								{
									"value": "61",
									"label": "61"
								},
								{
									"value": "60",
									"label": "60"
								},
								{
									"value": "59",
									"label": "59"
								},
								{
									"value": "58",
									"label": "58"
								},
								{
									"value": "57",
									"label": "57"
								},
								{
									"value": "56",
									"label": "56"
								},
								{
									"value": "55",
									"label": "55"
								},
								{
									"value": "54",
									"label": "54"
								},
								{
									"value": "53",
									"label": "53"
								},
								{
									"value": "52",
									"label": "52"
								},
								{
									"value": "51",
									"label": "51"
								},
								{
									"value": "50",
									"label": "50"
								},
								{
									"value": "49",
									"label": "49"
								},
								{
									"value": "48",
									"label": "48"
								},
								{
									"value": "47",
									"label": "47"
								},
								{
									"value": "46",
									"label": "46"
								},
								{
									"value": "45",
									"label": "45"
								},
								{
									"value": "44",
									"label": "44"
								},
								{
									"value": "43",
									"label": "43"
								},
								{
									"value": "42",
									"label": "42"
								},
								{
									"value": "41",
									"label": "41"
								},
								{
									"value": "40",
									"label": "40"
								},
								{
									"value": "39",
									"label": "39"
								},
								{
									"value": "38",
									"label": "38"
								},
								{
									"value": "37",
									"label": "37"
								},
								{
									"value": "36",
									"label": "36"
								},
								{
									"value": "35",
									"label": "35"
								},
								{
									"value": "34",
									"label": "34"
								},
								{
									"value": "33",
									"label": "33"
								},
								{
									"value": "32",
									"label": "32"
								},
								{
									"value": "31",
									"label": "31"
								},
								{
									"value": "30",
									"label": "30"
								},
								{
									"value": "29",
									"label": "29"
								},
								{
									"value": "28",
									"label": "28"
								},
								{
									"value": "27",
									"label": "27"
								},
								{
									"value": "26",
									"label": "26"
								},
								{
									"value": "25",
									"label": "25"
								},
								{
									"value": "24",
									"label": "24"
								},
								{
									"value": "23",
									"label": "23"
								},
								{
									"value": "22",
									"label": "22"
								},
								{
									"value": "21",
									"label": "21"
								},
								{
									"value": "20",
									"label": "20"
								},
								{
									"value": "19",
									"label": "19"
								},
								{
									"value": "18",
									"label": "18"
								},
								{
									"value": "17",
									"label": "17"
								},
								{
									"value": "16",
									"label": "16"
								},
								{
									"value": "15",
									"label": "15"
								},
								{
									"value": "14",
									"label": "14"
								},
								{
									"value": "13",
									"label": "13"
								},
								{
									"value": "12",
									"label": "12"
								},
								{
									"value": "11",
									"label": "11"
								},
								{
									"value": "10",
									"label": "10"
								},
								{
									"value": "9",
									"label": "9"
								},
								{
									"value": "8",
									"label": "8"
								},
								{
									"value": "7",
									"label": "7"
								},
								{
									"value": "6",
									"label": "6"
								},
								{
									"value": "5",
									"label": "5"
								},
								{
									"value": "4",
									"label": "4"
								},
								{
									"value": "3",
									"label": "3"
								},
								{
									"value": "2",
									"label": "2"
								},
								{
									"value": "1",
									"label": "1"
								}
							],
							"help": "Prefix length of the tunnelled IPv6 network."
						}
					]
				},
				{
					"id": "options",
					"title": "Options",
					"fields": [
						{
							"name": "link1",
							"type": "switch",
							"label": "Add static route",
							"text": "Add an explicit static route for the remote inner tunnel address/subnet via the local tunnel address"
						},
						{
							"name": "descr",
							"type": "text",
							"label": "Description",
							"help": "A description for administrative reference (not parsed)."
						}
					]
				}
			],
			"resource": "network/gres"
		},
		"groups": {
			"title": "Interface group",
			"summary": "Group {ifname} of {members}",
			"summaryIcon": "object-group",
			"sections": [
				{
					"id": "group",
					"title": "Interface group configuration",
					"fields": [
						{
							"name": "ifname",
							"type": "text",
							"label": "Group name",
							"required": true,
							"maxLength": 15,
							"mono": true,
							"width": "half",
							"pattern": "^[A-Za-z_]([A-Za-z0-9_]*[A-Za-z_])?$",
							"patternMessage": "Only letters (A-Z), digits (0-9) and '_' are allowed; the name cannot start or end with a digit.",
							"help": "Only letters (A-Z), digits (0-9) and '_' are allowed. The group name cannot start or end with a digit. Renaming a group also renames it in the firewall rules and port forwards that use it.",
							"errorMatch": [
								"reserved keyword",
								"only letters",
								"an alias with this name"
							]
						},
						{
							"name": "descr",
							"type": "text",
							"label": "Group description",
							"width": "half",
							"help": "A description for administrative reference (not parsed)."
						},
						{
							"name": "members",
							"type": "checklist",
							"label": "Group members",
							"options": [
								{
									"value": "wan",
									"label": "WAN"
								},
								{
									"value": "lan",
									"label": "LAN"
								}
							],
							"help": "Rules for WAN type interfaces in groups do not contain the reply-to mechanism upon which Multi-WAN typically relies.",
							"errorMatch": [
								"invalid interface"
							]
						}
					]
				}
			],
			"resource": "network/groups"
		},
		"assignments": {
			"title": "Interface assignment",
			"summary": "Port {port}",
			"summaryIcon": "ethernet",
			"sections": [
				{
					"id": "assignment",
					"title": "Network port",
					"fields": [
						{
							"name": "port",
							"type": "select",
							"label": "Network port",
							"required": true,
							"options": [
								{
									"value": "em0",
									"label": "em0 (00:0c:29:1d:3b:51)"
								},
								{
									"value": "em1",
									"label": "em1 (00:0c:29:1d:3b:5b)"
								},
								{
									"value": "ovpns1",
									"label": "ovpns1 (fs-test-ovpn)"
								},
								{
									"value": "tun_wg0",
									"label": "tun_wg0 (tun_wg0)"
								}
							],
							"help": "A new interface is named OPTn and starts disabled. Ports that are members of a LAGG are not listed.",
							"errorMatch": [
								"cannot add port",
								"is already assigned",
								"cannot set port",
								"was assigned to",
								"vlan parent interface"
							]
						}
					]
				}
			],
			"resource": "network/assignments"
		}
	};

	/* Physical ports of the mock firewall and what uses them. */
	var PORTS = [
		{ value: 'igc0', label: 'igc0 (00:e0:67:2a:10:01)' }, { value: 'igc1', label: 'igc1 (00:e0:67:2a:10:02)' },
		{ value: 'igc2', label: 'igc2 (00:e0:67:2a:10:03)' }, { value: 'igc3', label: 'igc3 (00:e0:67:2a:10:04)' },
		{ value: 'igc4', label: 'igc4 (00:e0:67:2a:10:05)' }, { value: 'igc5', label: 'igc5 (00:e0:67:2a:10:06)' }
	];
	var ASSIGNED = { wan: 'igc0', lan: 'igc1' };
	M.interfaces.forEach(function (i) { if (!ASSIGNED[i.id]) ASSIGNED[i.id] = i.if; });
	function label(id) { var i = M.interfaces.find(function (x) { return x.id === id; }); return i ? i.descr : id.toUpperCase(); }
	function portLabel(p) { var x = allPorts().find(function (o) { return o.value === p; }); return x ? x.label : p; }

	/* ---------------------------------------------------------------- L2 + tunnels */

	var STORE = {
		vlans: { key: 'vlanif', schema: 'vlans', items: [
			{ vlanif: 'igc3.30', if: 'igc3', tag: '30', tag_type: 'ctag', pcp: '', descr: 'IoT' },
			{ vlanif: 'igc3.40', if: 'igc3', tag: '40', tag_type: 'ctag', pcp: '5', descr: 'DMZ' },
			{ vlanif: 'igc3.100', if: 'igc3', tag: '100', tag_type: 'ctag', pcp: '', descr: 'Lab (unassigned)' }
		] },
		qinqs: { key: 'vlanif', schema: 'qinq', items: [
			{ vlanif: 'igc5.200', if: 'igc5', tag: '200', tag_type: 'stag', autogroup: true, members: [{ tag: '10' }, { tag: '11' }, { tag: '12' }, { tag: '20' }], descr: 'Carrier hand-off' }
		] },
		bridges: { key: 'bridgeif', schema: 'bridges', items: [
			{ bridgeif: 'bridge0', members: ['opt4', 'opt5'], descr: 'Lab bridge', enablestp: false }
		] },
		laggs: { key: 'laggif', schema: 'laggs', items: [] },
		gifs: { key: 'gifif', schema: 'gifs', items: [
			{ gifif: 'gif0', if: 'wan', 'remote-addr': '198.51.100.77', 'tunnel-local-addr': '2001:db8:77::2', 'tunnel-remote-addr': '2001:db8:77::1', 'tunnel-remote-net': '64', descr: 'IPv6 tunnel broker' }
		] },
		gres: { key: 'greif', schema: 'gres', items: [] },
		groups: { key: 'ifname', schema: 'groups', items: [
			{ ifname: 'HOME', members: ['lan', 'opt1'], descr: 'Trusted home networks' },
			{ ifname: 'UNTRUSTED', members: ['opt2', 'opt3'], descr: 'Guests and IoT' }
		] }
	};
	function assignedTo(ifname) { var a = Object.keys(ASSIGNED).find(function (k) { return ASSIGNED[k] === ifname; }); return a ? label(a) : ''; }
	function parent(p) { var a = Object.keys(ASSIGNED).find(function (k) { return ASSIGNED[k] === p; }); return p + (a ? ' (' + label(a) + ')' : ''); }
	function display(kind, x) {
		var id = x[STORE[kind].key];
		var d = { description: x.descr || '', assigned_to: kind === 'groups' ? '' : assignedTo(id) };
		if (kind === 'vlans' || kind === 'qinqs') Object.assign(d, { interface: id, parent: parent(x.if), tag: x.tag, tag_type: x.tag_type === 'stag' ? 'S-Tag (0x88a8)' : 'C-Tag (0x8100)', priority: x.pcp || '' });
		if (kind === 'qinqs') Object.assign(d, { members: (x.members || []).map(function (m) { return m.tag; }), autogroup: !!x.autogroup });
		if (kind === 'bridges') Object.assign(d, { interface: id.toUpperCase(), members: (x.members || []).map(label), stp: x.enablestp ? 'RSTP' : '' });
		if (kind === 'laggs') Object.assign(d, { interface: id.toUpperCase(), members: x.members || [], protocol: String(x.proto || '').toUpperCase() });
		if (kind === 'gifs' || kind === 'gres') Object.assign(d, { parent: label(x.if), remote: x['remote-addr'], tunnel: [x['tunnel-local-addr'] + ' → ' + x['tunnel-remote-addr'] + '/' + x['tunnel-remote-net']] });
		if (kind === 'groups') Object.assign(d, { name: x.ifname, members: (x.members || []).map(label) });
		d.in_use = !!d.assigned_to || (kind === 'groups' && x.ifname === 'HOME');
		d.in_use_reason = !d.in_use ? '' : (kind === 'groups' ? 'Interface group "' + x.ifname + '" cannot be deleted because it is in use by firewall rule "Allow home to all".'
			: 'This interface cannot be deleted because it is still being used as an interface.');
		return d;
	}
	function out(kind, x, i) {
		var f = clone(x); delete f[STORE[kind].key];
		return Object.assign({ id: i, interface: x[STORE[kind].key] }, clone(x), { fields: f, display: display(kind, x) });
	}
	function find(kind, id) {
		var items = STORE[kind].items, key = STORE[kind].key;
		var i = items.findIndex(function (x) { return x[key] === id; });
		if (i < 0 && /^\d+$/.test(id) && items[+id]) i = +id;
		return i;
	}
	function check(kind, x) {
		var e = {};
		if (kind === 'vlans' || kind === 'qinqs') {
			if (!x.if) e.if = 'The field Parent interface is required.';
			if (!(+x.tag >= 1 && +x.tag <= 4094)) e.tag = 'The VLAN tag must be an integer between 1 and 4094.';
			if (x.pcp !== '' && x.pcp != null && !(+x.pcp >= 0 && +x.pcp <= 7)) e.pcp = 'The VLAN priority must be an integer between 0 and 7.';
		}
		if ((kind === 'bridges' || kind === 'laggs') && !(x.members || []).length) e.members = 'At least one member interface must be selected.';
		if ((kind === 'gifs' || kind === 'gres')) {
			if (!V4.test(x['remote-addr'] || '')) e['remote-addr'] = 'The tunnel remote address must be a valid IP address.';
		}
		if (kind === 'groups' && !/^[A-Za-z_][A-Za-z0-9_]{0,14}$/.test(x.ifname || '')) e.ifname = 'The group name may only contain letters, digits and "_", start with a letter or "_" and be at most 15 characters long.';
		return Object.keys(e).length ? e : null;
	}
	function newId(kind, x) {
		if (kind === 'vlans' || kind === 'qinqs') return x.if + '.' + x.tag;
		if (kind === 'groups') return x.ifname;
		var pre = { bridges: 'bridge', laggs: 'lagg', gifs: 'gif', gres: 'gre' }[kind], n = 0;
		while (STORE[kind].items.some(function (y) { return y[STORE[kind].key] === pre + n; })) n++;
		return pre + n;
	}
	function memberOptions() { return M.interfaces.map(function (i) { return { value: i.id, label: i.descr }; }); }
	function schema(name) {
		var s = clone(SCHEMAS[name]);
		s.sections = s.sections.filter(function (sec) { return sec.id !== 'stp_ports'; });
		s.sections.forEach(function (sec) { sec.fields.forEach(function (f) {
			if (f.name === 'if') f.options = PORTS.map(function (p) { return { value: p.value, label: portLabel(p.value) }; });
			if (f.name === 'members' && f.type === 'checklist') f.options = name === 'laggs' ? PORTS.filter(function (x) { return used().indexOf(x.value) < 0; }) : memberOptions();
		}); });
		return s;
	}

	Object.keys(STORE).forEach(function (kind) {
		var St = STORE[kind], base = '/api/v1/interfaces/' + kind;
		M.route('GET', base, function () { return M.ok(St.items.map(function (x, i) { return out(kind, x, i); })); });
		M.route('GET', base + '/{id}', function (p) { var i = find(kind, p.id); return i < 0 ? M.err(404, 'Not found.') : M.ok(out(kind, St.items[i], i)); });
		M.route('POST', base, function (p, q, b) {
			var x = clone(b || {});
			var e = check(kind, x);
			if (e) return M.err(422, INVALID, e);
			x[St.key] = newId(kind, x);
			if (find(kind, x[St.key]) >= 0) return M.err(422, INVALID, kind === 'groups' ? { ifname: 'Group name already exists!' } : { tag: 'A VLAN with the tag ' + x.tag + ' is already defined on this interface.' });
			St.items.push(x);
			return Object.assign(M.ok(out(kind, x, St.items.length - 1)), { status: 201 });
		});
		M.route('PUT', base + '/{id}', function (p, q, b) {
			var i = find(kind, p.id);
			if (i < 0) return M.err(404, 'Not found.');
			var x = Object.assign(clone(St.items[i]), b || {});
			['fields', 'display', 'id', 'interface'].forEach(function (k) { delete x[k]; });
			var e = check(kind, x);
			if (e) return M.err(422, INVALID, e);
			St.items[i] = x;
			return M.ok(out(kind, x, i));
		});
		M.route('DELETE', base + '/{id}', function (p) {
			var i = find(kind, p.id);
			if (i < 0) return M.err(404, 'Not found.');
			var d = display(kind, St.items[i]);
			if (d.in_use) return M.err(409, d.in_use_reason);
			St.items.splice(i, 1);
			return M.ok({ deleted: p.id });
		});
		M.route('GET', '/api/v1/schema/network/' + St.schema, function () { return M.ok(schema(St.schema)); });
	});

	/* ---------------------------------------------------------------- assignments */

	function allPorts() {
		return PORTS.concat(STORE.vlans.items.map(function (v) { return { value: v.vlanif, label: 'VLAN ' + v.tag + ' on ' + v.if + ' - ' + (v.descr || '') }; }))
			.concat(STORE.bridges.items.map(function (b) { return { value: b.bridgeif, label: b.bridgeif.toUpperCase() + ' (' + (b.descr || '') + ')' }; }))
			.concat(STORE.gifs.items.map(function (g) { return { value: g.gifif, label: g.gifif.toUpperCase() + ' (' + (g.descr || '') + ')' }; }))
			.concat([{ value: 'tun_wg0', label: 'tun_wg0 (WireGuard)' }, { value: 'ovpns1', label: 'ovpns1 (Road warrior)' }]);
	}
	function used() { return Object.keys(ASSIGNED).map(function (k) { return ASSIGNED[k]; }); }
	function assignOut(id) {
		var i = M.interfaces.find(function (x) { return x.id === id; }) || { descr: id.toUpperCase(), status: 'up' };
		var v4 = i.id === 'wan' ? 'DHCP' : (i.ipv4 || '');
		var inUse = id === 'wan' || id === 'lan' ? '' : (id === 'opt1' ? 'The interface is part of the interface group HOME.' : '');
		return { interface: id, description: i.descr, port: ASSIGNED[id], port_descr: portLabel(ASSIGNED[id]), removable: id !== 'wan' && id !== 'lan',
			display: { interface: i.descr, port: portLabel(ASSIGNED[id]), addresses: [v4, i.id === 'wan' ? 'DHCPv6' : ''].filter(Boolean), enabled: i.status !== 'down',
				in_use: id === 'wan' || id === 'lan' || !!inUse, in_use_reason: id === 'wan' || id === 'lan' ? 'The ' + i.descr + ' interface cannot be deleted.' : inUse, assigned_to: i.descr } };
	}
	function meta() {
		return { available_ports: allPorts().filter(function (p) { return used().indexOf(p.value) < 0; }), ports: allPorts(), reboot_needed: false, pending: false };
	}
	M.route('GET', '/api/v1/schema/network/assignments', function () { return M.ok(clone(SCHEMAS.assignments)); });
	M.route('GET', '/api/v1/interfaces/assignments', function () { return M.ok(Object.keys(ASSIGNED).map(assignOut), meta()); });
	M.route('GET', '/api/v1/interfaces/assignments/{name}', function (p) { return ASSIGNED[p.name] ? M.ok(assignOut(p.name)) : M.err(404, 'Not found.'); });
	M.route('POST', '/api/v1/interfaces/assignments', function (p, q, b) {
		if (!b || b.confirm !== true) return M.err(400, 'Assigning a port reconfigures interfaces at once and requires {"confirm": true}.');
		if (!allPorts().some(function (x) { return x.value === b.port; })) return M.err(422, INVALID, { port: 'The port does not exist.' });
		if (used().indexOf(b.port) >= 0) return M.err(422, INVALID, { port: 'The port is already assigned.' });
		var n = 1;
		while (ASSIGNED['opt' + n]) n++;
		ASSIGNED['opt' + n] = b.port;
		M.interfaces.push({ id: 'opt' + n, if: b.port, descr: 'OPT' + n, status: 'down', ipv4: '' });
		return Object.assign(M.ok(assignOut('opt' + n)), { status: 201 });
	});
	M.route('PUT', '/api/v1/interfaces/assignments/{name}', function (p, q, b) {
		if (!ASSIGNED[p.name]) return M.err(404, 'Not found.');
		if (!b || b.confirm !== true) return M.err(400, 'Changing a port reconfigures the interface at once and requires {"confirm": true}.');
		if (b.port !== ASSIGNED[p.name] && used().indexOf(b.port) >= 0) return M.err(422, INVALID, { port: 'The port is already assigned to another interface.' });
		ASSIGNED[p.name] = b.port;
		return M.ok(assignOut(p.name));
	});
	M.route('DELETE', '/api/v1/interfaces/assignments/{name}', function (p, q) {
		if (!ASSIGNED[p.name]) return M.err(404, 'Not found.');
		if (p.name === 'wan' || p.name === 'lan') return M.err(403, 'The WAN and LAN interfaces cannot be removed.');
		if (q.get('confirm') !== 'true') return M.err(400, 'Removing an interface requires confirm=true.');
		var r = assignOut(p.name).display.in_use_reason;
		if (r) return M.err(409, r);
		delete ASSIGNED[p.name];
		return M.ok({ interface: p.name, deleted: true });
	});
	M.route('GET', '/api/v1/interfaces/assignments/pending', function () { return M.ok({ pending: false, reboot_needed: false, reload_pending: false, message: '' }); });
})(window.FSMock);
