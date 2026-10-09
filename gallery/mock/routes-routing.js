/*
 * routes-routing.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Mock routing, dynamic DNS and router advertisements, as the API serves them
 * (freesense restapi/routes_routing.inc, routes_ddns.inc, routes_dhcp.inc):
 *   /api/v1/routing/gateways[/{name}]            name-keyed, fields + display (with monitoring status)
 *   /api/v1/routing/gateway-groups[/{name}]      name-keyed
 *   /api/v1/routing/static-routes[/{id}]         position-keyed
 *   /api/v1/routing/default-gateways             GET/PUT {defaultgw4, defaultgw6, choices, fields}
 *   GET /api/v1/routing/pending, POST /api/v1/routing/apply   gateway/group/route changes wait for Apply
 *   /api/v1/services/dyndns/clients[/{id}], …/{id}/update     position-keyed; passwords never returned
 *   /api/v1/services/rfc2136/clients[/{id}], …/{id}/update    position-keyed; keys never returned
 *   /api/v1/services/router-advertisements[/{interface}]      one entry per interface (GET list, GET/PUT one)
 *   GET /api/v1/schema/{routing/…, services/dyndns, services/rfc2136, services/router_advertisements}   captured schemas
 */
(function (M) {
	'use strict';

	var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
	var INVALID = 'The request failed validation.';
	var V4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
	var SCHEMAS = {
		"routing/gateways": {
			"title": "Gateway",
			"summary": "{name} on {interface}[ via {gateway}]",
			"summaryIcon": "route",
			"sections": [
				{
					"id": "gateway",
					"title": "Gateway",
					"fields": [
						{
							"name": "disabled",
							"type": "switch",
							"label": "Disabled",
							"text": "Disable this gateway",
							"help": "Keep the gateway without using it. A gateway a group, static route or DNS server uses cannot be disabled.",
							"errorMatch": [
								"cannot be disabled"
							]
						},
						{
							"name": "interface",
							"type": "select",
							"label": "Interface",
							"required": true,
							"width": "half",
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
							"help": "The interface the gateway is reached through."
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
							"name": "name",
							"type": "text",
							"label": "Name",
							"required": true,
							"mono": true,
							"width": "half",
							"maxLength": 31,
							"help": "Letters, digits and underscores. The name of an existing gateway cannot change.",
							"errorMatch": [
								"gateway name",
								"changing name"
							]
						},
						{
							"name": "gateway",
							"type": "text",
							"label": "Gateway",
							"mono": true,
							"width": "half",
							"placeholder": "192.0.2.1",
							"help": "The gateway's IP address; \"dynamic\" for a gateway the interface learns (DHCP, PPP...).",
							"errorMatch": [
								"gateway ip address",
								"gateway address",
								"dynamic gateway values"
							]
						},
						{
							"name": "descr",
							"type": "text",
							"label": "Description",
							"help": "For your reference (not parsed)."
						}
					]
				},
				{
					"id": "monitoring",
					"title": "Monitoring",
					"fields": [
						{
							"name": "monitor_disable",
							"type": "switch",
							"label": "Gateway monitoring",
							"text": "Disable gateway monitoring",
							"help": "The gateway is then always considered up.",
							"width": "half"
						},
						{
							"name": "action_disable",
							"type": "switch",
							"label": "Gateway action",
							"text": "Disable the monitoring action",
							"help": "No action is taken on gateway events; the gateway is always considered up.",
							"width": "half"
						},
						{
							"name": "monitor",
							"type": "text",
							"label": "Monitor IP",
							"mono": true,
							"width": "half",
							"visibleWhen": {
								"field": "monitor_disable",
								"truthy": false
							},
							"help": "An address to ping instead of the gateway, e.g. when the gateway does not answer ICMP echo requests. Empty: the gateway itself.",
							"errorMatch": [
								"monitor address",
								"monitor ip address"
							]
						},
						{
							"name": "force_down",
							"type": "switch",
							"label": "Force state",
							"text": "Mark the gateway as down",
							"width": "half"
						},
						{
							"name": "dpinger_dont_add_static_route",
							"type": "switch",
							"label": "Static route",
							"text": "Do not add a static route for the monitor IP",
							"help": "By default traffic to the monitor IP is routed through the chosen interface."
						},
						{
							"name": "gw_down_kill_states",
							"type": "select",
							"label": "State killing on gateway failure",
							"default": "",
							"options": [
								{
									"value": "",
									"label": "Use global behavior (default)"
								},
								{
									"value": "none",
									"label": "Do not kill states on gateway failure"
								},
								{
									"value": "down",
									"label": "Kill states using this gateway when it is down"
								}
							],
							"help": "Only states of policy routing rules and reply-to; no effect while monitoring or its action is off or the gateway is forced down."
						}
					]
				},
				{
					"id": "advanced",
					"title": "Advanced",
					"advanced": true,
					"description": "Weight in gateway groups and the monitoring thresholds. The time period must exceed twice the probe interval plus the loss interval; the alert interval must be at least the probe interval and the loss interval at least the high latency threshold.",
					"fields": [
						{
							"name": "weight",
							"type": "select",
							"label": "Weight",
							"default": "1",
							"width": "third",
							"options": [
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
								}
							],
							"help": "Share of the connections in a gateway group."
						},
						{
							"name": "data_payload",
							"type": "number",
							"label": "Data payload",
							"min": 0,
							"width": "third",
							"placeholder": "1",
							"unit": "bytes"
						},
						{
							"name": "nonlocalgateway",
							"type": "switch",
							"label": "Use non-local gateway",
							"width": "third",
							"text": "Through an interface route",
							"help": "Allows a gateway outside the interface's subnets; usually a configuration error."
						},
						{
							"name": "latencylow",
							"type": "number",
							"label": "Low latency threshold",
							"min": 0,
							"unit": "ms",
							"width": "half",
							"placeholder": "200"
						},
						{
							"name": "latencyhigh",
							"type": "number",
							"label": "High latency threshold",
							"min": 0,
							"unit": "ms",
							"width": "half",
							"placeholder": "500"
						},
						{
							"name": "losslow",
							"type": "number",
							"label": "Low packet loss threshold",
							"min": 0,
							"max": 100,
							"unit": "%",
							"width": "half",
							"placeholder": "10"
						},
						{
							"name": "losshigh",
							"type": "number",
							"label": "High packet loss threshold",
							"min": 0,
							"max": 100,
							"unit": "%",
							"width": "half",
							"placeholder": "20"
						},
						{
							"name": "interval",
							"type": "number",
							"label": "Probe interval",
							"min": 1,
							"max": 3600000,
							"unit": "ms",
							"width": "half",
							"placeholder": "500"
						},
						{
							"name": "loss_interval",
							"type": "number",
							"label": "Loss interval",
							"min": 1,
							"unit": "ms",
							"width": "half",
							"placeholder": "2000",
							"errorMatch": [
								"loss interval needs to be greater"
							]
						},
						{
							"name": "time_period",
							"type": "number",
							"label": "Time period",
							"min": 1,
							"unit": "ms",
							"width": "half",
							"placeholder": "60000",
							"help": "Results are averaged over this period.",
							"errorMatch": [
								"time period needs to be greater"
							]
						},
						{
							"name": "alert_interval",
							"type": "number",
							"label": "Alert interval",
							"min": 1,
							"unit": "ms",
							"width": "half",
							"placeholder": "1000",
							"errorMatch": [
								"alert interval needs to be greater"
							]
						}
					]
				}
			],
			"resource": "routing/gateways"
		},
		"routing/gateway_groups": {
			"title": "Gateway group",
			"summary": "{name}: {items}",
			"summaryIcon": "route",
			"sections": [
				{
					"id": "group",
					"title": "Gateway group",
					"fields": [
						{
							"name": "name",
							"type": "text",
							"label": "Group name",
							"required": true,
							"mono": true,
							"width": "half",
							"maxLength": 31,
							"help": "Letters, digits and underscores; not the name of a gateway. It cannot change later.",
							"errorMatch": [
								"field name",
								"changing name",
								"with this name",
								"same name as a gateway"
							]
						},
						{
							"name": "descr",
							"type": "text",
							"label": "Description",
							"width": "half"
						}
					]
				},
				{
					"id": "members",
					"title": "Gateway priority",
					"description": "Members of the same tier share the load; a lower tier is used only when every member of the tiers above is down. All members have the same address family. The virtual IP is the source when the group is the interface of a local Dynamic DNS, IPsec or OpenVPN endpoint.",
					"fields": [
						{
							"name": "items",
							"type": "entry-grid",
							"label": "Members",
							"required": true,
							"min": 1,
							"addLabel": "Add gateway",
							"emptyText": "No gateways in this group yet.",
							"errorMatch": [
								"gateway(s)"
							],
							"fields": [
								{
									"name": "gateway",
									"type": "select",
									"label": "Gateway",
									"required": true,
									"width": "lg",
									"options": [
										{
											"value": "WAN_DHCP",
											"label": "WAN_DHCP",
											"detail": "192.168.27.2 Interface WAN_DHCP Gateway",
											"group": "IPv4"
										}
									]
								},
								{
									"name": "tier",
									"type": "select",
									"label": "Tier",
									"required": true,
									"default": "1",
									"width": "sm",
									"options": [
										{
											"value": "1",
											"label": "Tier 1"
										},
										{
											"value": "2",
											"label": "Tier 2"
										},
										{
											"value": "3",
											"label": "Tier 3"
										},
										{
											"value": "4",
											"label": "Tier 4"
										},
										{
											"value": "5",
											"label": "Tier 5"
										}
									]
								},
								{
									"name": "vip",
									"type": "select",
									"label": "Virtual IP",
									"default": "address",
									"width": "md",
									"strict": false,
									"options": [
										{
											"value": "address",
											"label": "Interface Address"
										}
									]
								}
							]
						}
					]
				},
				{
					"id": "behaviour",
					"title": "Failover",
					"fields": [
						{
							"name": "trigger",
							"type": "select",
							"label": "Trigger level",
							"required": true,
							"default": "down",
							"width": "half",
							"options": [
								{
									"value": "down",
									"label": "Member Down"
								},
								{
									"value": "downloss",
									"label": "Packet Loss"
								},
								{
									"value": "downlatency",
									"label": "High Latency"
								},
								{
									"value": "downlosslatency",
									"label": "Packet Loss or High Latency"
								}
							],
							"help": "When a member is excluded."
						},
						{
							"name": "keep_failover_states",
							"type": "select",
							"label": "Keep failover states",
							"default": "",
							"width": "half",
							"options": [
								{
									"value": "",
									"label": "Use global behavior (default)"
								},
								{
									"value": "keep",
									"label": "Keep states on gateway recovery"
								},
								{
									"value": "kill",
									"label": "Kill states on gateway recovery"
								}
							],
							"help": "Kill: when a gateway recovers, states policy routing created on lower-priority gateways are killed."
						}
					]
				}
			],
			"resource": "routing/gateway_groups"
		},
		"routing/static_routes": {
			"title": "Static route",
			"summary": "{network}[/{network_subnet}] via {gateway}",
			"summaryIcon": "route",
			"sections": [
				{
					"id": "route",
					"title": "Static route",
					"fields": [
						{
							"name": "network",
							"type": "typeahead",
							"label": "Destination network",
							"required": true,
							"mono": true,
							"width": "two-thirds",
							"placeholder": "Address or alias",
							"source": {
								"path": "/v1/firewall/aliases",
								"value": "name",
								"detail": "description"
							},
							"help": "A network address, or a host, network or URL alias.",
							"errorMatch": [
								"destination networks",
								"network conflicts"
							]
						},
						{
							"name": "network_subnet",
							"type": "number",
							"label": "Prefix length",
							"min": 0,
							"max": 128,
							"width": "third",
							"errorMatch": [
								"destination network bit count",
								"subnet can not be over"
							]
						},
						{
							"name": "gateway",
							"type": "select",
							"label": "Gateway",
							"required": true,
							"options": [
								{
									"value": "WAN_DHCP",
									"label": "WAN_DHCP - 192.168.27.2"
								},
								{
									"value": "Null4",
									"label": "Null4 - 127.0.0.1"
								},
								{
									"value": "Null6",
									"label": "Null6 - ::1"
								}
							],
							"help": "A disabled gateway can only be chosen for a disabled route.",
							"errorMatch": [
								"gateway is disabled",
								"different address family"
							]
						},
						{
							"name": "disabled",
							"type": "switch",
							"label": "Disabled",
							"text": "Disable this static route"
						},
						{
							"name": "descr",
							"type": "text",
							"label": "Description",
							"help": "For your reference (not parsed)."
						}
					]
				}
			],
			"resource": "routing/static_routes"
		},
		"routing/default_gateways": {
			"title": "Default gateway",
			"sections": [
				{
					"id": "default",
					"title": "Default gateway",
					"fields": [
						{
							"name": "defaultgw4",
							"type": "select",
							"label": "Default gateway IPv4",
							"default": "",
							"width": "half",
							"options": [
								{
									"value": "",
									"label": "Automatic"
								},
								{
									"value": "WAN_DHCP",
									"label": "WAN_DHCP"
								},
								{
									"value": "PPPOETEST_PPPOE",
									"label": "PPPOETEST_PPPOE"
								},
								{
									"value": "-",
									"label": "None"
								}
							],
							"help": "A gateway or failover gateway group to use as the default gateway. Automatic lets the system choose; None sets no default route.",
							"errorMatch": [
								"defaultgw4"
							]
						},
						{
							"name": "defaultgw6",
							"type": "select",
							"label": "Default gateway IPv6",
							"default": "",
							"width": "half",
							"options": [
								{
									"value": "",
									"label": "Automatic"
								},
								{
									"value": "-",
									"label": "None"
								}
							],
							"help": "A gateway or failover gateway group to use as the default gateway. Automatic lets the system choose; None sets no default route.",
							"errorMatch": [
								"defaultgw6"
							]
						}
					]
				}
			],
			"resource": "routing/default_gateways"
		},
		"services/dyndns": {
			"title": "Dynamic DNS client",
			"summary": "{type}[ {host}][ on {interface}]",
			"summaryIcon": "globe",
			"sections": [
				{
					"id": "client",
					"title": "Client",
					"fields": [
						{
							"name": "enable",
							"type": "switch",
							"label": "Enabled",
							"default": true,
							"text": "Keep this client's host name updated"
						},
						{
							"name": "type",
							"type": "select",
							"label": "Service type",
							"required": true,
							"options": [
								{
									"value": "all-inkl",
									"label": "All-Inkl.com"
								},
								{
									"value": "azure",
									"label": "Azure DNS"
								},
								{
									"value": "azurev6",
									"label": "Azure DNS (v6)"
								},
								{
									"value": "citynetwork",
									"label": "City Network"
								},
								{
									"value": "cloudflare",
									"label": "Cloudflare"
								},
								{
									"value": "cloudflare-v6",
									"label": "Cloudflare (v6)"
								},
								{
									"value": "cloudns",
									"label": "ClouDNS"
								},
								{
									"value": "custom",
									"label": "Custom"
								},
								{
									"value": "custom-v6",
									"label": "Custom (v6)"
								},
								{
									"value": "desec",
									"label": "deSEC"
								},
								{
									"value": "desec-v6",
									"label": "deSEC (v6)"
								},
								{
									"value": "digitalocean",
									"label": "DigitalOcean"
								},
								{
									"value": "digitalocean-v6",
									"label": "DigitalOcean (v6)"
								},
								{
									"value": "dnsexit",
									"label": "DNSexit"
								},
								{
									"value": "dnsimple",
									"label": "DNSimple"
								},
								{
									"value": "dnsimple-v6",
									"label": "DNSimple (v6)"
								},
								{
									"value": "dnsmadeeasy",
									"label": "DNS Made Easy"
								},
								{
									"value": "dnsomatic",
									"label": "DNS-O-Matic"
								},
								{
									"value": "domeneshop",
									"label": "Domeneshop"
								},
								{
									"value": "domeneshop-v6",
									"label": "Domeneshop (v6)"
								},
								{
									"value": "dreamhost",
									"label": "DreamHost"
								},
								{
									"value": "dreamhost-v6",
									"label": "Dreamhost (v6)"
								},
								{
									"value": "duiadns",
									"label": "DuiaDns.net"
								},
								{
									"value": "duiadns-v6",
									"label": "DuiaDns.net (v6)"
								},
								{
									"value": "dyfi",
									"label": "DY.fi"
								},
								{
									"value": "dyndns",
									"label": "DynDNS (dynamic)"
								},
								{
									"value": "dyndns-custom",
									"label": "DynDNS (custom)"
								},
								{
									"value": "dyndns-static",
									"label": "DynDNS (static)"
								},
								{
									"value": "dyns",
									"label": "DyNS"
								},
								{
									"value": "dynv6",
									"label": "Dynv6"
								},
								{
									"value": "dynv6-v6",
									"label": "Dynv6 (v6)"
								},
								{
									"value": "easydns",
									"label": "easyDNS"
								},
								{
									"value": "easydns-v6",
									"label": "easyDNS (v6)"
								},
								{
									"value": "eurodns",
									"label": "Euro Dns"
								},
								{
									"value": "freedns",
									"label": "freeDNS"
								},
								{
									"value": "freedns-v6",
									"label": "freeDNS (v6)"
								},
								{
									"value": "freedns2",
									"label": "freeDNS API Version 2"
								},
								{
									"value": "freedns2-v6",
									"label": " freeDNS API Version 2 (v6)"
								},
								{
									"value": "glesys",
									"label": "GleSYS"
								},
								{
									"value": "gandi-livedns",
									"label": "Gandi LiveDNS"
								},
								{
									"value": "gandi-livedns-v6",
									"label": "Gandi LiveDNS (v6)"
								},
								{
									"value": "godaddy",
									"label": "GoDaddy"
								},
								{
									"value": "godaddy-v6",
									"label": "GoDaddy (v6)"
								},
								{
									"value": "googledomains",
									"label": "Google Domains"
								},
								{
									"value": "gratisdns",
									"label": "GratisDNS"
								},
								{
									"value": "he-net",
									"label": "HE.net"
								},
								{
									"value": "he-net-v6",
									"label": "HE.net (v6)"
								},
								{
									"value": "he-net-tunnelbroker",
									"label": "HE.net Tunnelbroker"
								},
								{
									"value": "hover",
									"label": "Hover"
								},
								{
									"value": "linode",
									"label": "Linode"
								},
								{
									"value": "linode-v6",
									"label": "Linode (v6)"
								},
								{
									"value": "loopia",
									"label": "Loopia"
								},
								{
									"value": "luadns",
									"label": "LuaDNS"
								},
								{
									"value": "luadns-v6",
									"label": "LuaDNS (v6)"
								},
								{
									"value": "mythicbeasts",
									"label": "Mythic Beasts"
								},
								{
									"value": "mythicbeasts-v6",
									"label": "Mythic Beasts (v6)"
								},
								{
									"value": "name.com",
									"label": "Name.com"
								},
								{
									"value": "name.com-v6",
									"label": "Name.com (v6)"
								},
								{
									"value": "namecheap",
									"label": "Namecheap"
								},
								{
									"value": "nicru",
									"label": "NIC.RU"
								},
								{
									"value": "nicru-v6",
									"label": "NIC.RU (v6)"
								},
								{
									"value": "noip",
									"label": "No-IP"
								},
								{
									"value": "noip-v6",
									"label": "No-IP (v6)"
								},
								{
									"value": "noip-free",
									"label": "No-IP (free)"
								},
								{
									"value": "noip-free-v6",
									"label": "No-IP (free-v6)"
								},
								{
									"value": "onecom",
									"label": "One.com"
								},
								{
									"value": "onecom-v6",
									"label": "One.com (v6)"
								},
								{
									"value": "ods",
									"label": "ODS.org"
								},
								{
									"value": "opendns",
									"label": "OpenDNS"
								},
								{
									"value": "ovh-dynhost",
									"label": "OVH DynHOST"
								},
								{
									"value": "route53",
									"label": "Route 53"
								},
								{
									"value": "route53-v6",
									"label": "Route 53 (v6)"
								},
								{
									"value": "selfhost",
									"label": "SelfHost"
								},
								{
									"value": "spdyn",
									"label": "SPDYN"
								},
								{
									"value": "spdyn-v6",
									"label": "SPDYN (v6)"
								},
								{
									"value": "strato",
									"label": "Strato"
								},
								{
									"value": "yandex",
									"label": "Yandex"
								},
								{
									"value": "yandex-v6",
									"label": "Yandex (v6)"
								},
								{
									"value": "zoneedit",
									"label": "ZoneEdit"
								},
								{
									"value": "porkbun",
									"label": "Porkbun"
								},
								{
									"value": "porkbun-v6",
									"label": "Porkbun (v6)"
								}
							],
							"errorMatch": [
								"service type"
							]
						},
						{
							"name": "interface",
							"type": "select",
							"label": "Interface to monitor",
							"required": true,
							"width": "half",
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
							"help": "Its address is published. When it is private, the public address is fetched from the check IP service."
						},
						{
							"name": "requestif",
							"type": "select",
							"label": "Interface to send update from",
							"required": true,
							"width": "half",
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
							"help": "Almost always the interface to monitor.",
							"errorMatch": [
								"interface to send the update from"
							],
							"visibleWhen": {
								"field": "type",
								"in": [
									"custom",
									"custom-v6"
								]
							}
						},
						{
							"name": "check_ip_mode",
							"type": "select",
							"label": "Check IP mode",
							"default": "default",
							"width": "half",
							"options": [
								{
									"value": "default",
									"label": "Automatic (default)"
								},
								{
									"value": "always",
									"label": "Always use the Check IP service"
								},
								{
									"value": "never",
									"label": "Never use the Check IP service"
								}
							],
							"help": "By default the check IP service is only used for a private interface address."
						},
						{
							"name": "descr",
							"type": "text",
							"label": "Description",
							"width": "half",
							"help": "Also shown in the Dynamic DNS widget for custom services."
						}
					]
				},
				{
					"id": "record",
					"title": "Record",
					"fields": [
						{
							"name": "host",
							"type": "text",
							"label": "Hostname",
							"mono": true,
							"width": "half",
							"placeholder": "myhost.example.org",
							"help": "The fully qualified name, or the host part when the service has a separate domain name (\"@\" for the domain itself where the provider allows it). Some services want an ID instead (DNS Made Easy, GleSYS, he.net); DNSimple wants only the domain.",
							"errorMatch": [
								"hostname contains"
							],
							"visibleWhen": {
								"field": "type",
								"in": [
									"all-inkl",
									"azure",
									"azurev6",
									"citynetwork",
									"cloudflare",
									"cloudflare-v6",
									"cloudns",
									"desec",
									"desec-v6",
									"digitalocean",
									"digitalocean-v6",
									"dnsexit",
									"dnsimple",
									"dnsimple-v6",
									"dnsmadeeasy",
									"dnsomatic",
									"domeneshop",
									"domeneshop-v6",
									"dreamhost",
									"dreamhost-v6",
									"duiadns",
									"duiadns-v6",
									"dyfi",
									"dyndns",
									"dyndns-custom",
									"dyndns-static",
									"dyns",
									"dynv6",
									"dynv6-v6",
									"easydns",
									"easydns-v6",
									"eurodns",
									"freedns",
									"freedns-v6",
									"freedns2",
									"freedns2-v6",
									"glesys",
									"gandi-livedns",
									"gandi-livedns-v6",
									"godaddy",
									"godaddy-v6",
									"googledomains",
									"gratisdns",
									"he-net",
									"he-net-v6",
									"he-net-tunnelbroker",
									"hover",
									"linode",
									"linode-v6",
									"loopia",
									"luadns",
									"luadns-v6",
									"mythicbeasts",
									"mythicbeasts-v6",
									"name.com",
									"name.com-v6",
									"namecheap",
									"nicru",
									"nicru-v6",
									"noip",
									"noip-v6",
									"noip-free",
									"noip-free-v6",
									"onecom",
									"onecom-v6",
									"ods",
									"opendns",
									"ovh-dynhost",
									"route53",
									"route53-v6",
									"selfhost",
									"spdyn",
									"spdyn-v6",
									"strato",
									"yandex",
									"yandex-v6",
									"zoneedit",
									"porkbun",
									"porkbun-v6"
								]
							}
						},
						{
							"name": "domainname",
							"type": "text",
							"label": "Domain name",
							"mono": true,
							"width": "half",
							"help": "The zone the provider handles.",
							"visibleWhen": {
								"field": "type",
								"in": [
									"cloudflare",
									"cloudflare-v6",
									"cloudns",
									"digitalocean",
									"digitalocean-v6",
									"gandi-livedns",
									"gandi-livedns-v6",
									"godaddy",
									"godaddy-v6",
									"gratisdns",
									"hover",
									"linode",
									"linode-v6",
									"luadns",
									"luadns-v6",
									"mythicbeasts",
									"mythicbeasts-v6",
									"name.com",
									"name.com-v6",
									"namecheap",
									"onecom",
									"onecom-v6",
									"yandex",
									"yandex-v6",
									"porkbun",
									"porkbun-v6"
								]
							}
						},
						{
							"name": "mx",
							"type": "text",
							"label": "MX",
							"mono": true,
							"width": "half",
							"help": "Only when a special MX record is needed (a host name, not an address). Not all services support it.",
							"visibleWhen": {
								"field": "type",
								"in": [
									"all-inkl",
									"citynetwork",
									"cloudns",
									"dnsexit",
									"dnsimple",
									"dnsimple-v6",
									"dnsomatic",
									"duiadns",
									"duiadns-v6",
									"dyndns",
									"dyndns-custom",
									"dyndns-static",
									"dyns",
									"dynv6",
									"dynv6-v6",
									"easydns",
									"easydns-v6",
									"eurodns",
									"freedns",
									"freedns-v6",
									"freedns2",
									"freedns2-v6",
									"glesys",
									"googledomains",
									"gratisdns",
									"he-net",
									"he-net-v6",
									"he-net-tunnelbroker",
									"hover",
									"loopia",
									"namecheap",
									"noip",
									"noip-v6",
									"noip-free",
									"noip-free-v6",
									"ods",
									"opendns",
									"ovh-dynhost",
									"selfhost",
									"spdyn",
									"spdyn-v6",
									"zoneedit"
								]
							}
						},
						{
							"name": "zoneid",
							"type": "text",
							"label": "Zone ID",
							"mono": true,
							"width": "half",
							"help": "Azure: the resource ID of the DNS zone. DNSimple: the record ID. Route 53: the AWS zone ID.",
							"visibleWhen": {
								"field": "type",
								"in": [
									"azure",
									"azurev6",
									"dnsimple",
									"dnsimple-v6",
									"route53",
									"route53-v6"
								]
							}
						},
						{
							"name": "ttl",
							"type": "text",
							"label": "TTL",
							"width": "third",
							"help": "TTL of the DNS record.",
							"visibleWhen": {
								"field": "type",
								"in": [
									"azure",
									"azurev6",
									"cloudflare",
									"cloudflare-v6",
									"cloudns",
									"digitalocean",
									"digitalocean-v6",
									"dnsimple",
									"dnsimple-v6",
									"gandi-livedns",
									"gandi-livedns-v6",
									"godaddy",
									"godaddy-v6",
									"linode",
									"linode-v6",
									"luadns",
									"luadns-v6",
									"name.com",
									"name.com-v6",
									"onecom",
									"onecom-v6",
									"route53",
									"route53-v6",
									"yandex",
									"yandex-v6",
									"porkbun",
									"porkbun-v6"
								]
							}
						},
						{
							"name": "wildcard",
							"type": "switch",
							"label": "Wildcards",
							"text": "Enable wildcard",
							"width": "third",
							"visibleWhen": {
								"field": "type",
								"in": [
									"all-inkl",
									"citynetwork",
									"cloudns",
									"desec",
									"desec-v6",
									"dnsexit",
									"dnsimple",
									"dnsimple-v6",
									"dnsomatic",
									"duiadns",
									"duiadns-v6",
									"dyndns",
									"dyndns-custom",
									"dyndns-static",
									"dyns",
									"dynv6",
									"dynv6-v6",
									"easydns",
									"easydns-v6",
									"eurodns",
									"freedns",
									"freedns-v6",
									"freedns2",
									"freedns2-v6",
									"glesys",
									"googledomains",
									"gratisdns",
									"he-net",
									"he-net-v6",
									"he-net-tunnelbroker",
									"hover",
									"loopia",
									"namecheap",
									"noip",
									"noip-v6",
									"noip-free",
									"noip-free-v6",
									"ods",
									"opendns",
									"ovh-dynhost",
									"selfhost",
									"spdyn",
									"spdyn-v6",
									"zoneedit"
								]
							}
						},
						{
							"name": "proxied",
							"type": "switch",
							"label": "Cloudflare proxy",
							"text": "Route traffic through Cloudflare",
							"width": "third",
							"help": "Off by default: the real address is published.",
							"visibleWhen": {
								"field": "type",
								"in": [
									"cloudflare",
									"cloudflare-v6"
								]
							}
						}
					]
				},
				{
					"id": "auth",
					"title": "Credentials",
					"fields": [
						{
							"name": "username",
							"type": "text",
							"label": "Username",
							"width": "half",
							"autocomplete": "off",
							"help": "Required except for custom entries and the services that use only a token. Some services want an API key, account ID or e-mail address here.",
							"errorMatch": [
								"username contains"
							],
							"visibleWhen": {
								"field": "type",
								"in": [
									"all-inkl",
									"azure",
									"azurev6",
									"citynetwork",
									"cloudflare",
									"cloudflare-v6",
									"cloudns",
									"custom",
									"custom-v6",
									"dnsexit",
									"dnsimple",
									"dnsimple-v6",
									"dnsmadeeasy",
									"dnsomatic",
									"domeneshop",
									"domeneshop-v6",
									"dreamhost",
									"dreamhost-v6",
									"duiadns",
									"duiadns-v6",
									"dyfi",
									"dyndns",
									"dyndns-custom",
									"dyndns-static",
									"dyns",
									"dynv6",
									"dynv6-v6",
									"easydns",
									"easydns-v6",
									"eurodns",
									"freedns",
									"freedns-v6",
									"freedns2",
									"freedns2-v6",
									"glesys",
									"godaddy",
									"godaddy-v6",
									"googledomains",
									"gratisdns",
									"he-net",
									"he-net-v6",
									"he-net-tunnelbroker",
									"hover",
									"linode",
									"linode-v6",
									"loopia",
									"luadns",
									"luadns-v6",
									"mythicbeasts",
									"mythicbeasts-v6",
									"name.com",
									"name.com-v6",
									"namecheap",
									"nicru",
									"nicru-v6",
									"noip",
									"noip-v6",
									"noip-free",
									"noip-free-v6",
									"onecom",
									"onecom-v6",
									"ods",
									"opendns",
									"ovh-dynhost",
									"route53",
									"route53-v6",
									"selfhost",
									"spdyn",
									"spdyn-v6",
									"strato",
									"zoneedit",
									"porkbun",
									"porkbun-v6"
								]
							}
						},
						{
							"name": "password",
							"type": "secret",
							"label": "Password",
							"width": "half",
							"autocomplete": "new-password",
							"help": "Password, API token or secret of the service. Never shown again; leave it empty to keep the current one.",
							"errorMatch": [
								"confirmed password"
							]
						}
					]
				},
				{
					"id": "custom",
					"title": "Custom update",
					"fields": [
						{
							"name": "updateurl",
							"type": "text",
							"label": "Update URL",
							"mono": true,
							"help": "The only field a custom entry needs. %IP% is replaced by the address.",
							"visibleWhen": {
								"field": "type",
								"in": [
									"custom",
									"custom-v6"
								]
							}
						},
						{
							"name": "resultmatch",
							"type": "textarea",
							"label": "Result match",
							"code": true,
							"rows": 3,
							"help": "What the provider returns on success (%IP% for the address, alternatives separated by |). Empty: the result is not checked.",
							"visibleWhen": {
								"field": "type",
								"in": [
									"custom",
									"custom-v6"
								]
							}
						}
					],
					"visibleWhen": {
						"field": "type",
						"in": [
							"custom",
							"custom-v6"
						]
					}
				},
				{
					"id": "advanced",
					"title": "Advanced",
					"advanced": true,
					"fields": [
						{
							"name": "maxcacheage",
							"type": "number",
							"label": "Max cache age",
							"min": 1,
							"unit": "days",
							"width": "third",
							"help": "The record is updated at least this often. Empty: the default.",
							"visibleWhen": {
								"field": "type",
								"in": [
									"custom",
									"custom-v6"
								]
							}
						},
						{
							"name": "verboselog",
							"type": "switch",
							"label": "Verbose logging",
							"width": "third"
						},
						{
							"name": "curl_ipresolve_v4",
							"type": "switch",
							"label": "Force IPv4 DNS resolution",
							"width": "third",
							"visibleWhen": {
								"field": "type",
								"in": [
									"custom",
									"custom-v6"
								]
							}
						},
						{
							"name": "curl_ssl_verifypeer",
							"type": "switch",
							"label": "Verify TLS certificate",
							"default": true,
							"width": "third",
							"help": "The service must present a certificate this firewall trusts.",
							"visibleWhen": {
								"field": "type",
								"in": [
									"custom",
									"custom-v6",
									"dnsimple",
									"dnsimple-v6",
									"route53",
									"route53-v6"
								]
							}
						}
					]
				}
			],
			"resource": "services/dyndns"
		},
		"services/rfc2136": {
			"title": "RFC 2136 client",
			"summary": "{host}[ at {server}]",
			"summaryIcon": "globe",
			"sections": [
				{
					"id": "client",
					"title": "Client",
					"fields": [
						{
							"name": "enable",
							"type": "switch",
							"label": "Enabled",
							"text": "Keep this host name updated"
						},
						{
							"name": "interface",
							"type": "select",
							"label": "Interface",
							"required": true,
							"width": "half",
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
							"help": "Its address is published."
						},
						{
							"name": "recordtype",
							"type": "segmented",
							"label": "Record type",
							"default": "both",
							"width": "half",
							"options": [
								{
									"value": "A",
									"label": "A (IPv4)"
								},
								{
									"value": "AAAA",
									"label": "AAAA (IPv6)"
								},
								{
									"value": "both",
									"label": "Both"
								}
							]
						},
						{
							"name": "host",
							"type": "text",
							"label": "Hostname",
							"required": true,
							"mono": true,
							"width": "half",
							"placeholder": "myhost.example.org",
							"help": "The fully qualified name to update.",
							"errorMatch": [
								"host name contains"
							]
						},
						{
							"name": "zone",
							"type": "text",
							"label": "Zone",
							"mono": true,
							"width": "half",
							"help": "The zone of the host name (optional).",
							"errorMatch": [
								"zone name"
							]
						},
						{
							"name": "ttl",
							"type": "number",
							"label": "TTL",
							"required": true,
							"min": 0,
							"unit": "seconds",
							"width": "third",
							"default": 60
						},
						{
							"name": "descr",
							"type": "text",
							"label": "Description",
							"width": "two-thirds"
						}
					]
				},
				{
					"id": "key",
					"title": "Key",
					"fields": [
						{
							"name": "keyname",
							"type": "text",
							"label": "Key name",
							"required": true,
							"mono": true,
							"width": "half",
							"help": "As the DNS server knows the key."
						},
						{
							"name": "keyalgorithm",
							"type": "select",
							"label": "Key algorithm",
							"width": "half",
							"options": [
								{
									"value": "hmac-md5",
									"label": "HMAC-MD5 (legacy default)"
								},
								{
									"value": "hmac-sha1",
									"label": "HMAC-SHA1"
								},
								{
									"value": "hmac-sha224",
									"label": "HMAC-SHA224"
								},
								{
									"value": "hmac-sha256",
									"label": "HMAC-SHA256 (current bind9 default)"
								},
								{
									"value": "hmac-sha384",
									"label": "HMAC-SHA384"
								},
								{
									"value": "hmac-sha512",
									"label": "HMAC-SHA512 (most secure)"
								}
							]
						},
						{
							"name": "keydata",
							"type": "secret",
							"label": "Key",
							"mono": true,
							"autocomplete": "new-password",
							"help": "The secret TSIG key. Never shown again; leave it empty to keep the current key."
						}
					]
				},
				{
					"id": "server",
					"title": "Server",
					"fields": [
						{
							"name": "server",
							"type": "text",
							"label": "Server",
							"mono": true,
							"width": "half",
							"placeholder": "192.0.2.53 5353",
							"help": "An address or host name, optionally followed by a space and a port.",
							"errorMatch": [
								"update server must be"
							]
						},
						{
							"name": "usetcp",
							"type": "switch",
							"label": "Protocol",
							"text": "Use TCP instead of UDP",
							"width": "half"
						},
						{
							"name": "usepublicip",
							"type": "switch",
							"label": "Use public IP",
							"text": "Fetch the public address when the interface address is private"
						},
						{
							"name": "updatesource",
							"type": "select",
							"label": "Update source",
							"width": "half",
							"options": [
								{
									"value": "",
									"label": "Default (use Interface above)"
								},
								{
									"value": "none",
									"label": "Do not specify"
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
									"value": "lo0",
									"label": "Localhost"
								}
							],
							"help": "The address the update is sent from."
						},
						{
							"name": "updatesourcefamily",
							"type": "select",
							"label": "Update source family",
							"width": "half",
							"options": [
								{
									"value": "",
									"label": "Default"
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
							"help": "The address family the update is sent with."
						}
					]
				}
			],
			"resource": "services/rfc2136"
		},
		"services/router_advertisements": {
			"title": "Router advertisements",
			"sections": [
				{
					"id": "ra",
					"title": "Router advertisement",
					"fields": [
						{
							"name": "ramode",
							"type": "select",
							"label": "Router mode",
							"required": true,
							"default": "disabled",
							"options": [
								{
									"value": "disabled",
									"label": "Disabled"
								},
								{
									"value": "router",
									"label": "Router Only - RA Flags [none], Prefix Flags [router]"
								},
								{
									"value": "unmanaged",
									"label": "Unmanaged - RA Flags [none], Prefix Flags [onlink, auto, router]"
								},
								{
									"value": "managed",
									"label": "Managed - RA Flags [managed, other stateful], Prefix Flags [onlink, router]"
								},
								{
									"value": "assist",
									"label": "Assisted - RA Flags [managed, other stateful], Prefix Flags [onlink, auto, router]"
								},
								{
									"value": "stateless_dhcp",
									"label": "Stateless DHCP - RA Flags [other stateful], Prefix Flags [onlink, auto, router]"
								}
							],
							"help": "Router Only advertises this router; Unmanaged adds SLAAC; Managed leaves all configuration to DHCPv6; Assisted offers DHCPv6 and SLAAC; Stateless DHCP offers SLAAC with other information through DHCPv6. The DHCPv6 server may be another host.",
							"errorMatch": [
								"router advertisements can only be enabled"
							]
						},
						{
							"name": "rapriority",
							"type": "segmented",
							"label": "Router priority",
							"required": true,
							"default": "medium",
							"width": "half",
							"options": [
								{
									"value": "low",
									"label": "Low"
								},
								{
									"value": "medium",
									"label": "Normal"
								},
								{
									"value": "high",
									"label": "High"
								}
							],
							"visibleWhen": {
								"field": "ramode",
								"notEquals": "disabled"
							}
						},
						{
							"name": "rainterface",
							"type": "select",
							"label": "RA interface",
							"width": "half",
							"optionsFrom": "choices.rainterface",
							"visibleWhen": {
								"field": "ramode",
								"notEquals": "disabled"
							},
							"help": "The interface, or one of its IPv6 CARP addresses (only offered when it has one)."
						}
					]
				},
				{
					"id": "subnets",
					"title": "Subnets",
					"visibleWhen": {
						"field": "ramode",
						"notEquals": "disabled"
					},
					"fields": [
						{
							"name": "subnets",
							"type": "entry-grid",
							"label": "RA subnets",
							"max": 5000,
							"addLabel": "Add subnet",
							"emptyText": "The subnet of the interface is advertised.",
							"errorMatch": [
								"invalid subnet"
							],
							"fields": [
								{
									"name": "subnet",
									"type": "text",
									"label": "Subnet or alias",
									"mono": true,
									"required": true,
									"placeholder": "2001:db8:1::/64"
								}
							]
						}
					]
				},
				{
					"id": "dns",
					"title": "DNS",
					"visibleWhen": {
						"field": "ramode",
						"notEquals": "disabled"
					},
					"fields": [
						{
							"name": "radvd-dns",
							"type": "switch",
							"label": "DNS",
							"default": true,
							"text": "Provide DNS configuration (RDNSS/DNSSL)",
							"help": "Turning this off may violate some RFCs."
						},
						{
							"name": "rasamednsasdhcp6",
							"type": "switch",
							"label": "Mirror DHCPv6",
							"text": "Copy the DNS configuration of the DHCPv6 server",
							"visibleWhen": {
								"field": "radvd-dns",
								"truthy": true
							}
						},
						{
							"name": "radnsserver",
							"type": "entry-grid",
							"label": "DNS servers",
							"max": 4,
							"addLabel": "Add DNS server",
							"emptyText": "This interface's address when the DNS Resolver or Forwarder is enabled, else the system's DNS servers.",
							"visibleWhen": {
								"field": "radvd-dns",
								"truthy": true
							},
							"errorMatch": [
								"dns servers"
							],
							"fields": [
								{
									"name": "server",
									"type": "text",
									"label": "IPv6 address",
									"mono": true,
									"required": true
								}
							]
						},
						{
							"name": "radomainsearchlist",
							"type": "text",
							"label": "Domain search list",
							"mono": true,
							"placeholder": "example.com;sub.example.com",
							"help": "Domains separated by semicolons.",
							"visibleWhen": {
								"field": "radvd-dns",
								"truthy": true
							}
						}
					]
				},
				{
					"id": "timing",
					"title": "Timing and NAT64",
					"advanced": true,
					"visibleWhen": {
						"field": "ramode",
						"notEquals": "disabled"
					},
					"fields": [
						{
							"name": "ravalidlifetime",
							"type": "number",
							"label": "Valid lifetime",
							"min": 1,
							"max": 655350,
							"unit": "seconds",
							"width": "half",
							"placeholder": "86400",
							"help": "How long the prefix is valid for on-link determination.",
							"errorMatch": [
								"valid lifetime below",
								"default valid lifetime must be greater"
							]
						},
						{
							"name": "rapreferredlifetime",
							"type": "number",
							"label": "Preferred lifetime",
							"min": 1,
							"unit": "seconds",
							"width": "half",
							"placeholder": "14400",
							"help": "How long SLAAC addresses from the prefix stay preferred.",
							"errorMatch": [
								"default preferred lifetime"
							]
						},
						{
							"name": "raminrtradvinterval",
							"type": "number",
							"label": "Minimum RA interval",
							"min": 3,
							"max": 1350,
							"unit": "seconds",
							"width": "third",
							"placeholder": "200",
							"errorMatch": [
								"minimum advertisement interval"
							]
						},
						{
							"name": "ramaxrtradvinterval",
							"type": "number",
							"label": "Maximum RA interval",
							"min": 4,
							"max": 1800,
							"unit": "seconds",
							"width": "third",
							"placeholder": "600",
							"errorMatch": [
								"maximum advertisement interval"
							]
						},
						{
							"name": "raadvdefaultlifetime",
							"type": "number",
							"label": "Router lifetime",
							"min": 0,
							"max": 9000,
							"unit": "seconds",
							"width": "third",
							"help": "Empty: 3 × the maximum RA interval."
						},
						{
							"name": "pref64_enable",
							"type": "switch",
							"label": "PREF64",
							"text": "Advertise a NAT64 prefix",
							"width": "third"
						},
						{
							"name": "pref64_lifetime",
							"type": "number",
							"label": "NAT64 prefix lifetime",
							"min": 1,
							"max": 65528,
							"unit": "seconds",
							"width": "third",
							"visibleWhen": {
								"field": "pref64_enable",
								"truthy": true
							},
							"help": "Empty: 3 × the maximum RA interval."
						}
					]
				}
			],
			"resource": "services/router_advertisements"
		}
	};
	var RA_TEMPLATE = {
		"interface": "lan",
		"ramode": "disabled",
		"rapriority": "low",
		"rainterface": "",
		"ravalidlifetime": "",
		"rapreferredlifetime": "",
		"raminrtradvinterval": "",
		"ramaxrtradvinterval": "",
		"raadvdefaultlifetime": "",
		"pref64_lifetime": "",
		"radomainsearchlist": "",
		"pref64_enable": false,
		"subnets": [],
		"radvd-dns": false,
		"rasamednsasdhcp6": false,
		"radnsserver": [],
		"choices": {
			"ramode": {
				"disabled": "Disabled",
				"router": "Router Only - RA Flags [none], Prefix Flags [router]",
				"unmanaged": "Unmanaged - RA Flags [none], Prefix Flags [onlink, auto, router]",
				"managed": "Managed - RA Flags [managed, other stateful], Prefix Flags [onlink, router]",
				"assist": "Assisted - RA Flags [managed, other stateful], Prefix Flags [onlink, auto, router]",
				"stateless_dhcp": "Stateless DHCP - RA Flags [other stateful], Prefix Flags [onlink, auto, router]"
			},
			"rapriority": {
				"low": "Low",
				"medium": "Normal",
				"high": "High"
			},
			"rainterface": []
		},
		"fields": {
			"ramode": "disabled",
			"rapriority": "low",
			"rainterface": "",
			"ravalidlifetime": "",
			"rapreferredlifetime": "",
			"raminrtradvinterval": "",
			"ramaxrtradvinterval": "",
			"raadvdefaultlifetime": "",
			"pref64_lifetime": "",
			"radomainsearchlist": "",
			"pref64_enable": false,
			"subnets": [],
			"radvd-dns": false,
			"rasamednsasdhcp6": false,
			"radnsserver": []
		},
		"display": {
			"interface": "LAN",
			"mode": "Disabled",
			"priority": "Low",
			"dhcpv6": "Disabled",
			"enabled": false
		}
	};
	var pending = false;
	function ifLabel(id) { var i = M.interfaces.find(function (x) { return x.id === id; }); return i ? i.descr : id; }
	function ifOptions() { return M.interfaces.map(function (i) { return { value: i.id, label: i.descr }; }); }

	/* ---------------------------------------------------------------- gateways */

	var GATEWAYS = [
		{ name: 'WAN_DHCP', interface: 'wan', ipprotocol: 'inet', gateway: 'dynamic', monitor: '', descr: 'Interface WAN_DHCP Gateway', weight: '1', dynamic: true, live: { addr: '203.0.113.1', state: 'online', delay: '4.1ms', loss: '0.0%' } },
		{ name: 'WAN_DHCP6', interface: 'wan', ipprotocol: 'inet6', gateway: 'dynamic', monitor: '', descr: 'Interface WAN_DHCP6 Gateway', weight: '1', dynamic: true, live: { addr: 'fe80::1', state: 'online', delay: '4.4ms', loss: '0.0%' } },
		{ name: 'WAN2_LTE', interface: 'opt4', ipprotocol: 'inet', gateway: '192.168.8.1', monitor: '1.1.1.1', descr: 'LTE backup', weight: '1', live: { addr: '192.168.8.1', state: 'highdelay', delay: '187ms', loss: '1.0%' } },
		{ name: 'VPN_SITE', interface: 'wg0', ipprotocol: 'inet', gateway: '10.99.0.2', monitor: '', descr: 'Branch office over WireGuard', weight: '1', monitor_disable: 'yes', live: { addr: '10.99.0.2', state: 'none', delay: '', loss: '' } }
	];
	var DEFAULTS = { defaultgw4: 'WAN_DHCP', defaultgw6: '' };
	function gwOut(g) {
		var f = clone(g); delete f.live; delete f.dynamic;
		var isDefault = DEFAULTS[g.ipprotocol === 'inet6' ? 'defaultgw6' : 'defaultgw4'] === g.name || (!DEFAULTS.defaultgw6 && g.name === 'WAN_DHCP6');
		return Object.assign(clone(f), { dynamic: !!g.dynamic, disabled: !!g.disabled, default: isDefault, editable: true, fields: f,
			display: { interface: ifLabel(g.interface), address: g.dynamic ? 'dynamic' : g.gateway, monitor: g.monitor || g.live.addr, family: g.ipprotocol === 'inet6' ? 'IPv6' : 'IPv4',
				default: isDefault, enabled: !g.disabled, inactive: false, description: g.descr || '', status: { state: g.disabled ? 'none' : g.live.state, substate: 'none', delay: g.live.delay, loss: g.live.loss } } });
	}
	function gwOptions(family, extra) {
		return (extra || []).concat(GATEWAYS.filter(function (g) { return !family || g.ipprotocol === family; }).map(function (g) { return { value: g.name, label: g.name + (g.descr ? ' - ' + g.descr : '') }; }));
	}

	var GROUPS = [
		{ name: 'WAN_FAILOVER', descr: 'Fibre, then LTE', trigger: 'downloss', items: [{ gateway: 'WAN_DHCP', tier: '1', vip: 'address' }, { gateway: 'WAN2_LTE', tier: '2', vip: 'address' }] }
	];
	var TRIGGER = { down: 'Member down', downloss: 'Packet Loss', downlatency: 'High Latency', downlosslatency: 'Packet Loss or High Latency' };
	function groupOut(g) {
		return Object.assign(clone(g), { fields: clone(g), display: { members: g.items.map(function (i) { return i.gateway + ' (tier ' + i.tier + ')'; }), trigger: TRIGGER[g.trigger] || g.trigger, description: g.descr || '' } });
	}
	var ROUTES = [
		{ network: '10.20.0.0', network_subnet: '16', gateway: 'VPN_SITE', descr: 'Branch office' },
		{ network: '192.168.100.0', network_subnet: '24', gateway: 'WAN2_LTE', descr: 'LTE router management', disabled: 'yes' }
	];
	function routeOut(r, i) {
		var g = GATEWAYS.find(function (x) { return x.name === r.gateway; });
		return Object.assign({ id: i }, clone(r), { fields: clone(r), display: { network: r.network + '/' + r.network_subnet, gateway: r.gateway + (g ? ' - ' + (g.dynamic ? g.live.addr : g.gateway) : ''),
			interface: g ? ifLabel(g.interface) : '', enabled: !r.disabled, inactive: false, description: r.descr || '' } });
	}

	function schema(name) {
		var s = clone(SCHEMAS[name]);
		s.sections.forEach(function (sec) { sec.fields.forEach(function (f) {
			if (f.name === 'interface') f.options = ifOptions();
			if (name === 'routing/static_routes' && f.name === 'gateway') f.options = gwOptions(null, []).concat([{ value: 'Null4', label: 'Null4 - 127.0.0.1' }, { value: 'Null6', label: 'Null6 - ::1' }]);
			if (name === 'routing/default_gateways') f.options = gwOptions(f.name === 'defaultgw6' ? 'inet6' : 'inet', [{ value: '', label: 'Automatic' }]).concat([{ value: '-', label: 'None' }]);
			(f.fields || []).forEach(function (c) { if (c.name === 'gateway') c.options = gwOptions(null, []); });
		}); });
		return s;
	}
	Object.keys(SCHEMAS).forEach(function (n) { M.route('GET', '/api/v1/schema/' + n, function () { return M.ok(schema(n)); }); });

	function crud(base, list, opts) {
		var byName = !!opts.key;
		function idx(p) { return byName ? list().findIndex(function (x) { return x[opts.key] === p.id; }) : (list()[+p.id] ? +p.id : -1); }
		function one(i) { return opts.out(list()[i], i); }
		M.route('GET', base, function () { return M.ok(list().map(function (x, i) { return opts.out(x, i); })); });
		M.route('GET', base + '/{id}', function (p) { var i = idx(p); return i < 0 ? M.err(404, 'Not found.') : M.ok(one(i)); });
		M.route('POST', base, function (p, q, b) {
			var x = opts.clean(clone(b || {}));
			var e = opts.check(x, -1);
			if (e) return M.err(422, INVALID, e);
			list().push(x);
			if (opts.stage) pending = true;
			return Object.assign(M.ok(one(list().length - 1)), { status: 201 });
		});
		M.route('PUT', base + '/{id}', function (p, q, b) {
			var i = idx(p);
			if (i < 0) return M.err(404, 'Not found.');
			var x = opts.clean(Object.assign(clone(list()[i]), b || {}), list()[i]);
			var e = opts.check(x, i);
			if (e) return M.err(422, INVALID, e);
			list()[i] = x;
			if (opts.stage) pending = true;
			return M.ok(one(i));
		});
		M.route('DELETE', base + '/{id}', function (p) {
			var i = idx(p);
			if (i < 0) return M.err(404, 'Not found.');
			if (opts.inUse) { var r = opts.inUse(list()[i]); if (r) return M.err(409, r); }
			list().splice(i, 1);
			if (opts.stage) pending = true;
			return M.ok({ deleted: p.id });
		});
		if (opts.toggle) M.route('POST', base + '/{id}/toggle', function (p) {
			var i = idx(p);
			if (i < 0) return M.err(404, 'Not found.');
			var x = list()[i];
			if (x.disabled) delete x.disabled; else x.disabled = 'yes';
			if (opts.stage) pending = true;
			return M.ok(one(i));
		});
	}
	var strip = function (x) { ['fields', 'display', 'id', 'default', 'editable', 'inactive'].forEach(function (k) { delete x[k]; }); Object.keys(x).forEach(function (k) { if (x[k] === false) delete x[k]; else if (x[k] === true && k !== 'dynamic') x[k] = 'yes'; }); return x; };

	crud('/api/v1/routing/gateways', function () { return GATEWAYS; }, {
		key: 'name', stage: true, toggle: true, out: gwOut,
		clean: function (x, old) { x = strip(x); x.live = old ? old.live : { addr: x.gateway, state: 'online', delay: '2.0ms', loss: '0.0%' }; x.dynamic = old ? old.dynamic : false; return x; },
		check: function (x, i) {
			var e = {};
			if (!/^[A-Za-z0-9_-]{1,31}$/.test(x.name || '')) e.name = 'The gateway name must not contain invalid characters.';
			else if (GATEWAYS.some(function (g, j) { return j !== i && g.name === x.name; })) e.name = 'The gateway name "' + x.name + '" already exists.';
			if (!x.dynamic && !V4.test(x.gateway || '') && !/:/.test(x.gateway || '')) e.gateway = 'A valid gateway IP address must be specified.';
			if (x.monitor && !V4.test(x.monitor) && !/:/.test(x.monitor)) e.monitor = 'A valid monitor IP address must be specified.';
			return Object.keys(e).length ? e : null;
		},
		inUse: function (g) {
			if (GROUPS.some(function (x) { return x.items.some(function (i) { return i.gateway === g.name; }); })) return 'Gateway "' + g.name + '" cannot be deleted because it is in use on Gateway Group "WAN_FAILOVER".';
			if (ROUTES.some(function (r) { return r.gateway === g.name; })) return 'Gateway "' + g.name + '" cannot be deleted because it is in use on Static Route.';
			return '';
		}
	});
	crud('/api/v1/routing/gateway-groups', function () { return GROUPS; }, {
		key: 'name', stage: true, out: groupOut, clean: strip,
		check: function (x) {
			var e = {};
			if (!/^[A-Za-z0-9_]{1,31}$/.test(x.name || '')) e.name = 'The gateway name must not contain invalid characters.';
			if (!(x.items || []).length) e.items = 'No gateway(s) have been selected to be used in this group.';
			return Object.keys(e).length ? e : null;
		}
	});
	crud('/api/v1/routing/static-routes', function () { return ROUTES; }, {
		stage: true, toggle: true, out: routeOut, clean: strip,
		check: function (x) {
			var e = {};
			if (!V4.test(x.network || '') && !/:/.test(x.network || '')) e.network = 'A valid IPv4 or IPv6 destination network must be specified.';
			if (!(+x.network_subnet >= 0 && +x.network_subnet <= 128)) e.network_subnet = 'A valid destination network bit count must be specified.';
			if (!GATEWAYS.some(function (g) { return g.name === x.gateway; }) && !/^Null[46]$/.test(x.gateway)) e.gateway = 'A valid gateway must be specified.';
			return Object.keys(e).length ? e : null;
		}
	});
	M.route('GET', '/api/v1/routing/default-gateways', function () { return M.ok(Object.assign(clone(DEFAULTS), { fields: clone(DEFAULTS) })); });
	M.route('PUT', '/api/v1/routing/default-gateways', function (p, q, b) {
		['defaultgw4', 'defaultgw6'].forEach(function (k) { if (b && k in b) DEFAULTS[k] = b[k]; });
		pending = true;
		return M.ok(Object.assign(clone(DEFAULTS), { fields: clone(DEFAULTS), pending: true }));
	});
	M.route('GET', '/api/v1/routing/pending', function () { return M.ok({ pending: pending }); });
	M.route('POST', '/api/v1/routing/apply', function () { pending = false; return Object.assign(M.ok({ applied: true, pending: false }), { delay: 900 }); });

	/* ---------------------------------------------------------------- dynamic DNS */

	var DDNS = [
		{ enable: true, type: 'cloudflare', interface: 'wan', host: 'home', domainname: 'example.org', username: 'token', descr: 'Home', cached: '203.0.113.42', status: 'ok' },
		{ enable: true, type: 'duckdns', interface: 'opt4', host: 'fw01-lte', domainname: '', username: '', descr: 'LTE backup line', cached: '', status: 'unknown' }
	];
	var DDNS_LABEL = { cloudflare: 'Cloudflare', duckdns: 'DuckDNS' };
	var RFC = [
		{ enable: true, interface: 'wan', host: 'fw01.dyn.example.net', zone: 'dyn.example.net', server: 'ns1.example.net', recordtype: 'A', keyname: 'fw01', descr: 'Own name server', cached: '203.0.113.42', status: 'fail' }
	];
	function hide(x) { var f = clone(x); delete f.cached; delete f.status; delete f.password; delete f.keydata; return f; }
	crud('/api/v1/services/dyndns/clients', function () { return DDNS; }, {
		out: function (x, i) {
			return Object.assign({ id: i }, hide(x), { password: '(set)', fields: Object.assign(hide(x), { password: '' }),
				display: { service: DDNS_LABEL[x.type] || x.type, hostname: [x.host, x.domainname].filter(Boolean).join('.') + (x.type === 'duckdns' ? '.duckdns.org' : ''), interface: ifLabel(x.interface),
					cached_ip: x.cached || '', status: x.status || 'unknown', enabled: !!x.enable, description: x.descr || '' } });
		},
		clean: function (x, old) { ['fields', 'display', 'id'].forEach(function (k) { delete x[k]; }); if (!x.password && old) x.password = old.password; x.status = old ? old.status : 'unknown'; x.cached = old ? old.cached : ''; return x; },
		check: function (x) {
			var e = {};
			if (!x.type) e.type = 'The field Service type is required.';
			if (!x.host && x.type !== 'custom') e.host = 'The Hostname contains invalid characters.';
			return Object.keys(e).length ? e : null;
		}
	});
	crud('/api/v1/services/rfc2136/clients', function () { return RFC; }, {
		out: function (x, i) {
			return Object.assign({ id: i }, hide(x), { keydata: '(set)', fields: Object.assign(hide(x), { keydata: '' }),
				display: { hostname: x.host, server: x.server, interface: ifLabel(x.interface), record_type: x.recordtype, cached_ip: x.cached || '', cached_ipv6: '',
					status_ipv4: x.status || 'unknown', status_ipv6: 'unknown', enabled: !!x.enable, description: x.descr || '' } });
		},
		clean: function (x, old) { ['fields', 'display', 'id'].forEach(function (k) { delete x[k]; }); if (!x.keydata && old) x.keydata = old.keydata; x.status = old ? old.status : 'unknown'; x.cached = old ? old.cached : ''; return x; },
		check: function (x) {
			var e = {};
			if (!x.host) e.host = 'The field Hostname is required.';
			if (!x.keyname) e.keyname = 'The field Key name is required.';
			return Object.keys(e).length ? e : null;
		}
	});
	[['/api/v1/services/dyndns/clients', DDNS], ['/api/v1/services/rfc2136/clients', RFC]].forEach(function (d) {
		M.route('POST', d[0] + '/{id}/update', function (p) {
			var x = d[1][+p.id];
			if (!x) return M.err(404, 'Not found.');
			x.status = 'ok'; x.cached = '203.0.113.42';
			return Object.assign(M.ok({ updated: true }), { delay: 700 });
		});
	});

	/* ---------------------------------------------------------------- router advertisements */

	var RA = {};
	M.interfaces.filter(function (i) { return i.id !== 'wan' && !/^wg|^tun/.test(i.if); }).forEach(function (i, n) {
		var r = clone(RA_TEMPLATE);
		['fields', 'display', 'choices'].forEach(function (k) { delete r[k]; });
		r.interface = i.id;
		r.ramode = n === 0 ? 'assist' : (n === 1 ? 'unmanaged' : 'disabled');
		r.rapriority = n === 0 ? 'high' : 'medium';
		RA[i.id] = r;
	});
	var MODES = { disabled: 'Disabled', router: 'Router Only', unmanaged: 'Unmanaged', managed: 'Managed', assist: 'Assisted', stateless_dhcp: 'Stateless DHCP' };
	function raOut(r) {
		return Object.assign(clone(r), { choices: clone(RA_TEMPLATE.choices), fields: clone(r), display: { interface: ifLabel(r.interface), mode: MODES[r.ramode] || r.ramode,
			priority: r.rapriority.charAt(0).toUpperCase() + r.rapriority.slice(1), dhcpv6: r.ramode === 'managed' || r.ramode === 'assist' ? 'Enabled' : 'Disabled', enabled: r.ramode !== 'disabled' } });
	}
	M.route('GET', '/api/v1/services/router-advertisements', function () { return M.ok(Object.keys(RA).map(function (k) { return raOut(RA[k]); })); });
	M.route('GET', '/api/v1/services/router-advertisements/{interface}', function (p) { return RA[p.interface] ? M.ok(raOut(RA[p.interface])) : M.err(404, 'Router advertisements are not available on this interface.'); });
	M.route('PUT', '/api/v1/services/router-advertisements/{interface}', function (p, q, b) {
		var r = RA[p.interface];
		if (!r) return M.err(404, 'Router advertisements are not available on this interface.');
		var n = Object.assign(clone(r), b || {});
		['fields', 'display', 'choices'].forEach(function (k) { delete n[k]; });
		if (n.raminrtradvinterval && n.ramaxrtradvinterval && +n.raminrtradvinterval >= +n.ramaxrtradvinterval)
			return M.err(422, INVALID, { raminrtradvinterval: 'Minimum advertisement interval must be less than maximum advertisement interval.' });
		RA[p.interface] = n;
		return M.ok(raOut(n));
	});
})(window.FSMock);
