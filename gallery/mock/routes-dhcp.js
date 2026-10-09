/*
 * routes-dhcp.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Mock DHCP server, as the API serves it (freesense restapi/routes_dhcp.inc), for DHCP and DHCPv6:
 *   GET    /api/v1/services/dhcp[v6]/servers                          every interface: {interface, description, enabled, range, static_count, subnet, available}
 *   GET    /api/v1/services/dhcp[v6]/servers/{if}                     {interface, …, pending, fields, display}; PUT partial (409 when unavailable)
 *   GET    /api/v1/services/dhcp[v6]/servers/{if}/static-mappings     [{id, …, fields, display}], id = position; POST, GET/PUT/DELETE …/{id}
 *   GET    /api/v1/services/dhcp[v6]/pending, POST …/apply            changes wait for Apply
 *   GET    /api/v1/services/dhcp[v6]/settings; PUT                    Kea settings (backend read-only)
 *   GET    /api/v1/services/dhcp[v6]-relay; PUT                       relay (applies at once)
 *   GET    /api/v1/schema/services/{dhcp_server(?interface=), dhcp_static_mapping, …}   captured schemas
 */
(function (M) {
	'use strict';

	var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
	var INVALID = 'The request failed validation.';
	var V4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
	var MAC = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;
	var SCHEMAS = {
		"dhcp_server": {
			"title": "DHCP server",
			"summary": "[Range {range_from} – {range_to}]",
			"summaryIcon": "network-wired",
			"sections": [
				{
					"id": "general",
					"title": "General",
					"fields": [
						{
							"name": "enable",
							"type": "switch",
							"label": "DHCP server",
							"text": "Enable the DHCP server on this interface",
							"help": "Cannot be enabled while the DHCP relay is enabled.",
							"errorMatch": [
								"dhcp relay on the",
								"dhcp registration features",
								"requires a static ipv4 subnet"
							]
						},
						{
							"name": "denyunknown",
							"type": "select",
							"label": "Deny unknown clients",
							"default": "disabled",
							"width": "half",
							"options": [
								{
									"value": "disabled",
									"label": "Allow all clients"
								},
								{
									"value": "enabled",
									"label": "Allow known clients from any interface"
								},
								{
									"value": "class",
									"label": "Allow known clients from only this interface"
								}
							],
							"help": "Known clients have a static mapping; \"only this interface\" accepts the mappings of this interface only."
						},
						{
							"name": "ignoreclientuids",
							"type": "switch",
							"label": "Ignore client identifiers",
							"width": "half",
							"text": "Do not record client identifiers (UID) in leases",
							"help": "For clients that dual-boot with different identifiers but one MAC address. This violates the DHCP specification."
						},
						{
							"name": "dnsregpolicy",
							"type": "select",
							"label": "DNS registration",
							"default": "default",
							"width": "half",
							"options": [
								{
									"value": "default",
									"label": "Track server"
								},
								{
									"value": "enable",
									"label": "Enable"
								},
								{
									"value": "disable",
									"label": "Disable"
								}
							],
							"help": "Overrides the default DNS registration policy of the DHCP settings."
						},
						{
							"name": "earlydnsregpolicy",
							"type": "select",
							"label": "Early DNS registration",
							"default": "default",
							"width": "half",
							"options": [
								{
									"value": "default",
									"label": "Track server"
								},
								{
									"value": "enable",
									"label": "Enable"
								},
								{
									"value": "disable",
									"label": "Disable"
								}
							],
							"help": "Overrides the default early DNS registration policy of the DHCP settings."
						}
					]
				},
				{
					"id": "pool",
					"title": "Primary address pool",
					"description": "The addresses handed out to clients.",
					"fields": [
						{
							"name": "range_from",
							"type": "text",
							"label": "Range from",
							"mono": true,
							"width": "half",
							"placeholder": "192.168.1.100",
							"help": "Required while the server is enabled. Inside the interface subnet, outside the additional pools and the static mappings.",
							"errorMatch": [
								"range begin",
								"starting subnet range",
								"lies outside of the current subnet",
								"range is invalid",
								"overlap any static dhcp mappings",
								"overlap with virtual ip address",
								"within the range configured on another dhcp pool",
								"within the primary address range"
							]
						},
						{
							"name": "range_to",
							"type": "text",
							"label": "Range to",
							"mono": true,
							"width": "half",
							"placeholder": "192.168.1.199",
							"errorMatch": [
								"range end",
								"ending subnet range"
							]
						}
					]
				},
				{
					"id": "servers",
					"title": "Server options",
					"fields": [
						{
							"name": "winsserver",
							"type": "entry-grid",
							"label": "WINS servers",
							"max": 2,
							"reorder": true,
							"addLabel": "Add server",
							"fields": [
								{
									"name": "address",
									"type": "text",
									"label": "Address",
									"mono": true,
									"required": true,
									"width": "lg"
								}
							]
						},
						{
							"name": "dnsserver",
							"type": "entry-grid",
							"label": "DNS servers",
							"max": 4,
							"reorder": true,
							"addLabel": "Add server",
							"fields": [
								{
									"name": "address",
									"type": "text",
									"label": "Address",
									"mono": true,
									"required": true,
									"width": "lg"
								}
							],
							"help": "Empty: this interface's address while the DNS Resolver or Forwarder runs, else the system DNS servers."
						}
					]
				},
				{
					"id": "options",
					"title": "Other DHCP options",
					"fields": [
						{
							"name": "gateway",
							"type": "text",
							"label": "Gateway",
							"mono": true,
							"width": "half",
							"placeholder": "",
							"help": "Empty: this interface's address. \"none\" hands out no gateway."
						},
						{
							"name": "domain",
							"type": "text",
							"label": "Domain name",
							"mono": true,
							"width": "half",
							"placeholder": "",
							"help": "Empty: the domain of this firewall.",
							"errorMatch": [
								"for the dns domain"
							]
						},
						{
							"name": "domainsearchlist",
							"type": "text",
							"label": "Domain search list",
							"mono": true,
							"placeholder": "example.com;sub.example.com",
							"help": "Domains separated by semicolons."
						},
						{
							"name": "deftime",
							"type": "number",
							"label": "Default lease time",
							"unit": "seconds",
							"min": 60,
							"width": "half",
							"placeholder": "7200",
							"help": "For clients that do not ask for a lease time. Default 7200.",
							"errorMatch": [
								"the default lease time must",
								"than default lease time"
							]
						},
						{
							"name": "maxtime",
							"type": "number",
							"label": "Maximum lease time",
							"unit": "seconds",
							"min": 60,
							"width": "half",
							"placeholder": "86400",
							"help": "For clients that ask for a lease time. Default 86400.",
							"errorMatch": [
								"the maximum lease time must"
							]
						},
						{
							"name": "staticarp",
							"type": "switch",
							"label": "Static ARP",
							"text": "Enable static ARP entries",
							"help": "Only hosts with a static mapping (IP and MAC address) can reach the firewall on this interface, even with the DHCP server off."
						}
					]
				},
				{
					"id": "mac",
					"title": "MAC address control",
					"advanced": true,
					"fields": [
						{
							"name": "mac_allow",
							"type": "text",
							"label": "MAC allow",
							"mono": true,
							"help": "Full or partial MAC addresses, comma separated without spaces. Any other MAC is denied."
						},
						{
							"name": "mac_deny",
							"type": "text",
							"label": "MAC deny",
							"mono": true,
							"help": "Full or partial MAC addresses, comma separated without spaces. Any other MAC is allowed."
						}
					]
				},
				{
					"id": "ntp",
					"title": "NTP",
					"advanced": true,
					"fields": [
						{
							"name": "ntpserver",
							"type": "entry-grid",
							"label": "NTP servers",
							"max": 4,
							"reorder": true,
							"addLabel": "Add server",
							"fields": [
								{
									"name": "address",
									"type": "text",
									"label": "Address",
									"mono": true,
									"required": true,
									"width": "lg"
								}
							]
						}
					]
				},
				{
					"id": "tftp",
					"title": "TFTP",
					"advanced": true,
					"fields": [
						{
							"name": "tftp",
							"type": "text",
							"label": "TFTP server",
							"mono": true,
							"help": "Leave empty to disable. An IP address, host name or URL of the TFTP server."
						}
					]
				},
				{
					"id": "ldap",
					"title": "LDAP",
					"advanced": true,
					"fields": [
						{
							"name": "ldap",
							"type": "text",
							"label": "LDAP server URI",
							"mono": true,
							"placeholder": "ldap://ldap.example.com/dc=example,dc=com",
							"help": "Leave empty to disable. The full URI of the LDAP server."
						}
					]
				},
				{
					"id": "netboot",
					"title": "Network booting",
					"advanced": true,
					"description": "Clients boot from the network only when a file name and a boot server are set.",
					"fields": [
						{
							"name": "netboot",
							"type": "switch",
							"label": "Network booting",
							"text": "Enable network booting"
						},
						{
							"name": "nextserver",
							"type": "text",
							"label": "Next server",
							"mono": true,
							"width": "half",
							"help": "IPv4 address of the boot server.",
							"errorMatch": [
								"network boot server"
							],
							"visibleWhen": {
								"field": "netboot",
								"truthy": true
							}
						},
						{
							"name": "filename",
							"type": "text",
							"label": "Default BIOS file name",
							"mono": true,
							"width": "half",
							"visibleWhen": {
								"field": "netboot",
								"truthy": true
							}
						},
						{
							"name": "filename32",
							"type": "text",
							"label": "UEFI 32 bit file name",
							"mono": true,
							"width": "half",
							"visibleWhen": {
								"field": "netboot",
								"truthy": true
							}
						},
						{
							"name": "filename64",
							"type": "text",
							"label": "UEFI 64 bit file name",
							"mono": true,
							"width": "half",
							"visibleWhen": {
								"field": "netboot",
								"truthy": true
							}
						},
						{
							"name": "filename32arm",
							"type": "text",
							"label": "ARM 32 bit file name",
							"mono": true,
							"width": "half",
							"visibleWhen": {
								"field": "netboot",
								"truthy": true
							}
						},
						{
							"name": "filename64arm",
							"type": "text",
							"label": "ARM 64 bit file name",
							"mono": true,
							"width": "half",
							"visibleWhen": {
								"field": "netboot",
								"truthy": true
							}
						},
						{
							"name": "uefihttpboot",
							"type": "text",
							"label": "UEFI HTTPBoot URL",
							"mono": true,
							"visibleWhen": {
								"field": "netboot",
								"truthy": true
							},
							"placeholder": "http://server/firmware.efi",
							"help": "Format: http://(servername)/(firmwarepath)."
						},
						{
							"name": "rootpath",
							"type": "text",
							"label": "Root path",
							"mono": true,
							"visibleWhen": {
								"field": "netboot",
								"truthy": true
							},
							"help": "Format: iscsi:(servername):(protocol):(port):(LUN):targetname."
						}
					]
				},
				{
					"id": "custom",
					"title": "Custom configuration",
					"advanced": true,
					"fields": [
						{
							"name": "custom_kea_config",
							"type": "textarea",
							"label": "JSON configuration",
							"code": true,
							"rows": 8,
							"readonly": false,
							"help": "JSON merged into the \"subnet\" section of the generated Kea DHCPv4 configuration: a well formed JSON object without the \"subnet\" key itself.",
							"errorMatch": [
								"custom configuration",
								"custom kea configuration"
							]
						}
					]
				}
			],
			"resource": "services/dhcp_server"
		},
		"dhcp_static_mapping": {
			"title": "Static mapping",
			"summary": "{mac}[ → {ipaddr}][ ({hostname})]",
			"summaryIcon": "thumbtack",
			"sections": [
				{
					"id": "mapping",
					"title": "Static mapping",
					"fields": [
						{
							"name": "mac",
							"type": "text",
							"label": "MAC address",
							"mono": true,
							"width": "half",
							"placeholder": "xx:xx:xx:xx:xx:xx",
							"help": "MAC address of the client (6 hex octets separated by colons).",
							"errorMatch": [
								"either mac address or client identifier",
								"mac address or client identifier already exists"
							]
						},
						{
							"name": "cid",
							"type": "text",
							"label": "Client identifier",
							"mono": true,
							"width": "half",
							"help": "Optional identifier the client sends (RFC 2132). With both set, Kea matches the MAC address."
						},
						{
							"name": "ipaddr",
							"type": "text",
							"label": "IP address",
							"mono": true,
							"width": "half",
							"help": "IPv4 address for this client, outside every address pool. Empty: an address from a pool.",
							"errorMatch": [
								"a valid ipv4 address must be specified.",
								"ipv4 address must be specified for use with static arp"
							]
						},
						{
							"name": "arp_table_static_entry",
							"type": "switch",
							"label": "Static ARP entry",
							"width": "half",
							"text": "Create a static ARP entry for this MAC and IP address"
						},
						{
							"name": "hostname",
							"type": "text",
							"label": "Hostname",
							"mono": true,
							"width": "half",
							"help": "Name of the client without the domain part.",
							"errorMatch": [
								"rfc952",
								"the domain name part should be omitted"
							]
						},
						{
							"name": "descr",
							"type": "text",
							"label": "Description",
							"width": "half",
							"help": "For your reference (not parsed)."
						},
						{
							"name": "earlydnsregpolicy",
							"type": "select",
							"label": "Early DNS registration",
							"default": "default",
							"width": "half",
							"options": [
								{
									"value": "default",
									"label": "Track subnet"
								},
								{
									"value": "enable",
									"label": "Enable"
								},
								{
									"value": "disable",
									"label": "Disable"
								}
							],
							"help": "Overrides the early DNS registration policy of the subnet."
						}
					]
				},
				{
					"id": "servers",
					"title": "Server options",
					"description": "Empty lists use the settings of the interface.",
					"fields": [
						{
							"name": "winsserver",
							"type": "entry-grid",
							"label": "WINS servers",
							"max": 2,
							"reorder": true,
							"addLabel": "Add server",
							"fields": [
								{
									"name": "address",
									"type": "text",
									"label": "Address",
									"mono": true,
									"required": true,
									"width": "lg"
								}
							]
						},
						{
							"name": "dnsserver",
							"type": "entry-grid",
							"label": "DNS servers",
							"max": 4,
							"reorder": true,
							"addLabel": "Add server",
							"fields": [
								{
									"name": "address",
									"type": "text",
									"label": "Address",
									"mono": true,
									"required": true,
									"width": "lg"
								}
							]
						}
					]
				},
				{
					"id": "options",
					"title": "Other DHCP options",
					"fields": [
						{
							"name": "gateway",
							"type": "text",
							"label": "Gateway",
							"mono": true,
							"width": "half",
							"help": "Empty: the gateway of the interface."
						},
						{
							"name": "domain",
							"type": "text",
							"label": "Domain name",
							"mono": true,
							"width": "half",
							"help": "Empty: the domain of the interface.",
							"errorMatch": [
								"for the dns domain"
							]
						},
						{
							"name": "domainsearchlist",
							"type": "text",
							"label": "Domain search list",
							"mono": true,
							"placeholder": "example.com;sub.example.com",
							"help": "Domains separated by semicolons."
						}
					]
				},
				{
					"id": "ntp",
					"title": "NTP",
					"advanced": true,
					"fields": [
						{
							"name": "ntpserver",
							"type": "entry-grid",
							"label": "NTP servers",
							"max": 4,
							"reorder": true,
							"addLabel": "Add server",
							"fields": [
								{
									"name": "address",
									"type": "text",
									"label": "Address",
									"mono": true,
									"required": true,
									"width": "lg"
								}
							]
						}
					]
				},
				{
					"id": "tftp",
					"title": "TFTP",
					"advanced": true,
					"fields": [
						{
							"name": "tftp",
							"type": "text",
							"label": "TFTP server",
							"mono": true,
							"help": "Leave empty to disable. An IP address, host name or URL of the TFTP server."
						}
					]
				},
				{
					"id": "ldap",
					"title": "LDAP",
					"advanced": true,
					"fields": [
						{
							"name": "ldap",
							"type": "text",
							"label": "LDAP server URI",
							"mono": true,
							"placeholder": "ldap://ldap.example.com/dc=example,dc=com",
							"help": "Leave empty to disable. The full URI of the LDAP server."
						}
					]
				},
				{
					"id": "netboot",
					"title": "Network booting",
					"advanced": true,
					"description": "Clients boot from the network only when a file name and a boot server are set.",
					"fields": [
						{
							"name": "netboot",
							"type": "switch",
							"label": "Network booting",
							"text": "Enable network booting"
						},
						{
							"name": "filename",
							"type": "text",
							"label": "Default BIOS file name",
							"mono": true,
							"width": "half",
							"visibleWhen": {
								"field": "netboot",
								"truthy": true
							}
						},
						{
							"name": "filename32",
							"type": "text",
							"label": "UEFI 32 bit file name",
							"mono": true,
							"width": "half",
							"visibleWhen": {
								"field": "netboot",
								"truthy": true
							}
						},
						{
							"name": "filename64",
							"type": "text",
							"label": "UEFI 64 bit file name",
							"mono": true,
							"width": "half",
							"visibleWhen": {
								"field": "netboot",
								"truthy": true
							}
						},
						{
							"name": "filename32arm",
							"type": "text",
							"label": "ARM 32 bit file name",
							"mono": true,
							"width": "half",
							"visibleWhen": {
								"field": "netboot",
								"truthy": true
							}
						},
						{
							"name": "filename64arm",
							"type": "text",
							"label": "ARM 64 bit file name",
							"mono": true,
							"width": "half",
							"visibleWhen": {
								"field": "netboot",
								"truthy": true
							}
						},
						{
							"name": "uefihttpboot",
							"type": "text",
							"label": "UEFI HTTPBoot URL",
							"mono": true,
							"visibleWhen": {
								"field": "netboot",
								"truthy": true
							},
							"placeholder": "http://server/firmware.efi",
							"help": "Format: http://(servername)/(firmwarepath)."
						},
						{
							"name": "rootpath",
							"type": "text",
							"label": "Root path",
							"mono": true,
							"visibleWhen": {
								"field": "netboot",
								"truthy": true
							},
							"help": "Format: iscsi:(servername):(protocol):(port):(LUN):targetname."
						}
					]
				},
				{
					"id": "custom",
					"title": "Custom configuration",
					"advanced": true,
					"fields": [
						{
							"name": "custom_kea_config",
							"type": "textarea",
							"label": "JSON configuration",
							"code": true,
							"rows": 8,
							"readonly": false,
							"help": "JSON merged into the \"reservation\" section of the generated Kea DHCPv4 configuration: a well formed JSON object without the \"reservation\" key itself.",
							"errorMatch": [
								"custom configuration",
								"custom kea configuration"
							]
						}
					]
				}
			],
			"resource": "services/dhcp_static_mapping"
		},
		"dhcpv6_server": {
			"title": "DHCPv6 server",
			"summary": "[Range {range_from} – {range_to}]",
			"summaryIcon": "network-wired",
			"sections": [
				{
					"id": "general",
					"title": "General",
					"fields": [
						{
							"name": "enable",
							"type": "switch",
							"label": "DHCPv6 server",
							"text": "Enable the DHCPv6 server on this interface",
							"help": "Cannot be enabled while the DHCPv6 relay is enabled.",
							"errorMatch": [
								"dhcp relay on the",
								"can only be enabled on interfaces configured with a static ipv6"
							]
						},
						{
							"name": "denyunknown",
							"type": "select",
							"label": "Deny unknown clients",
							"default": "disabled",
							"width": "half",
							"options": [
								{
									"value": "disabled",
									"label": "Allow all clients"
								},
								{
									"value": "enabled",
									"label": "Allow known clients from any interface"
								},
								{
									"value": "class",
									"label": "Allow known clients from only this interface"
								}
							]
						},
						{
							"name": "dnsregpolicy",
							"type": "select",
							"label": "DNS registration",
							"default": "default",
							"width": "half",
							"options": [
								{
									"value": "default",
									"label": "Track server"
								},
								{
									"value": "enable",
									"label": "Enable"
								},
								{
									"value": "disable",
									"label": "Disable"
								}
							],
							"help": "Overrides the default DNS registration policy of the DHCPv6 settings."
						},
						{
							"name": "earlydnsregpolicy",
							"type": "select",
							"label": "Early DNS registration",
							"default": "default",
							"width": "half",
							"options": [
								{
									"value": "default",
									"label": "Track server"
								},
								{
									"value": "enable",
									"label": "Enable"
								},
								{
									"value": "disable",
									"label": "Disable"
								}
							],
							"help": "Overrides the default early DNS registration policy of the DHCPv6 settings."
						}
					]
				},
				{
					"id": "pool",
					"title": "Primary address pool",
					"description": "The addresses handed out to clients.",
					"fields": [
						{
							"name": "range_from",
							"type": "text",
							"label": "Range from",
							"mono": true,
							"width": "half",
							"placeholder": "::1000",
							"help": "Required unless the router advertisements are in Stateless DHCP mode. With Track Interface only the suffix (the delegated prefix is prepended).",
							"errorMatch": [
								"a valid range must be specified",
								"lies outside of the current subnet",
								"range is invalid",
								"must be zero",
								"overlap any static dhcp mappings",
								"overlap with virtual ipv6 address",
								"within the range configured on another dhcpv6 pool",
								"within the primary dhcpv6 address pool",
								"range from and range to"
							]
						},
						{
							"name": "range_to",
							"type": "text",
							"label": "Range to",
							"mono": true,
							"width": "half",
							"placeholder": "::2000"
						}
					]
				},
				{
					"id": "pd",
					"title": "Prefix delegation pool",
					"description": "Prefixes delegated to downstream routers.",
					"fields": [
						{
							"name": "pdprefix",
							"type": "text",
							"label": "Delegated prefix",
							"mono": true,
							"width": "half",
							"placeholder": "2001:db8:1000::",
							"help": "Start of the range the delegated prefixes are taken from."
						},
						{
							"name": "pdprefixlen",
							"type": "number",
							"label": "Prefix length",
							"min": 48,
							"max": 64,
							"width": "third",
							"help": "The fixed part of the delegated prefix; not longer than the delegated length.",
							"errorMatch": [
								"delegated prefix length"
							]
						},
						{
							"name": "pddellen",
							"type": "number",
							"label": "Delegated length",
							"min": 48,
							"max": 128,
							"width": "third",
							"help": "The prefix length handed to each client."
						}
					]
				},
				{
					"id": "servers",
					"title": "Server options",
					"fields": [
						{
							"name": "dhcp6c-dns",
							"type": "switch",
							"label": "Provide DNS",
							"text": "Provide DNS servers to DHCPv6 clients",
							"default": true,
							"help": "Off removes the name-servers option, which may violate RFCs."
						},
						{
							"name": "dnsserver",
							"type": "entry-grid",
							"label": "DNS servers",
							"max": 4,
							"reorder": true,
							"addLabel": "Add server",
							"fields": [
								{
									"name": "address",
									"type": "text",
									"label": "Address",
									"mono": true,
									"required": true,
									"width": "lg"
								}
							],
							"help": "Empty: this interface's address while the DNS Resolver or Forwarder runs, else the system DNS servers.",
							"visibleWhen": {
								"field": "dhcp6c-dns",
								"truthy": true
							}
						}
					]
				},
				{
					"id": "options",
					"title": "Other DHCPv6 options",
					"fields": [
						{
							"name": "domain",
							"type": "text",
							"label": "Domain name",
							"mono": true,
							"width": "half",
							"placeholder": "",
							"help": "Empty: the domain of this firewall.",
							"errorMatch": [
								"for the dns domain"
							]
						},
						{
							"name": "domainsearchlist",
							"type": "text",
							"label": "Domain search list",
							"mono": true,
							"width": "half",
							"placeholder": "example.com;sub.example.com",
							"help": "Domains separated by semicolons."
						},
						{
							"name": "deftime",
							"type": "number",
							"label": "Default lease time",
							"unit": "seconds",
							"min": 60,
							"width": "half",
							"placeholder": "7200",
							"errorMatch": [
								"the default lease time must"
							]
						},
						{
							"name": "maxtime",
							"type": "number",
							"label": "Maximum lease time",
							"unit": "seconds",
							"min": 60,
							"width": "half",
							"placeholder": "86400",
							"errorMatch": [
								"the maximum lease time must"
							]
						}
					]
				},
				{
					"id": "ntp",
					"title": "NTP",
					"advanced": true,
					"fields": [
						{
							"name": "ntpserver",
							"type": "entry-grid",
							"label": "NTP servers",
							"max": 4,
							"reorder": true,
							"addLabel": "Add server",
							"fields": [
								{
									"name": "address",
									"type": "text",
									"label": "Address",
									"mono": true,
									"required": true,
									"width": "lg"
								}
							]
						}
					]
				},
				{
					"id": "netboot",
					"title": "Network booting",
					"advanced": true,
					"fields": [
						{
							"name": "netboot",
							"type": "switch",
							"label": "Network booting",
							"text": "Enable network booting"
						},
						{
							"name": "bootfile_url",
							"type": "text",
							"label": "Bootfile URL",
							"mono": true,
							"visibleWhen": {
								"field": "netboot",
								"truthy": true
							},
							"errorMatch": [
								"network bootfile"
							]
						}
					]
				},
				{
					"id": "custom",
					"title": "Custom configuration",
					"advanced": true,
					"fields": [
						{
							"name": "custom_kea_config",
							"type": "textarea",
							"label": "JSON configuration",
							"code": true,
							"rows": 8,
							"readonly": false,
							"help": "JSON merged into the \"subnet\" section of the generated Kea DHCPv6 configuration: a well formed JSON object without the \"subnet\" key itself.",
							"errorMatch": [
								"custom configuration",
								"custom kea configuration"
							]
						}
					]
				}
			],
			"resource": "services/dhcpv6_server"
		},
		"dhcpv6_static_mapping": {
			"title": "DHCPv6 static mapping",
			"summary": "{duid}[ → {ipaddrv6}][ ({hostname})]",
			"summaryIcon": "thumbtack",
			"sections": [
				{
					"id": "mapping",
					"title": "Static mapping",
					"fields": [
						{
							"name": "duid",
							"type": "text",
							"label": "DUID",
							"required": true,
							"mono": true,
							"placeholder": "xx:xx:xx:xx:xx:xx:xx:xx:xx:xx",
							"help": "DHCP Unique Identifier of the client: hex octets separated by colons.",
							"errorMatch": [
								"or duid already exists"
							]
						},
						{
							"name": "ipaddrv6",
							"type": "text",
							"label": "IPv6 address",
							"mono": true,
							"width": "half",
							"help": "IPv6 address for this client. With Track Interface only the suffix (::1:2:3:4).",
							"errorMatch": [
								"must be zero"
							]
						},
						{
							"name": "pdprefix",
							"type": "text",
							"label": "Delegated prefix",
							"mono": true,
							"width": "half",
							"placeholder": "2001:db8:1000::/56",
							"help": "A prefix (address/length) delegated to this client."
						},
						{
							"name": "hostname",
							"type": "text",
							"label": "Hostname",
							"mono": true,
							"width": "half",
							"help": "Name of the client without the domain part.",
							"errorMatch": [
								"rfc952",
								"the domain name part should be omitted"
							]
						},
						{
							"name": "descr",
							"type": "text",
							"label": "Description",
							"width": "half",
							"help": "For your reference (not parsed)."
						},
						{
							"name": "earlydnsregpolicy",
							"type": "select",
							"label": "Early DNS registration",
							"default": "default",
							"width": "half",
							"options": [
								{
									"value": "default",
									"label": "Track subnet"
								},
								{
									"value": "enable",
									"label": "Enable"
								},
								{
									"value": "disable",
									"label": "Disable"
								}
							],
							"help": "Overrides the early DNS registration policy of the subnet."
						}
					]
				},
				{
					"id": "custom",
					"title": "Custom configuration",
					"advanced": true,
					"fields": [
						{
							"name": "custom_kea_config",
							"type": "textarea",
							"label": "JSON configuration",
							"code": true,
							"rows": 8,
							"readonly": false,
							"help": "JSON merged into the \"reservation\" section of the generated Kea DHCPv6 configuration: a well formed JSON object without the \"reservation\" key itself.",
							"errorMatch": [
								"custom configuration",
								"custom kea configuration"
							]
						}
					]
				}
			],
			"resource": "services/dhcpv6_static_mapping"
		},
		"dhcp_settings": {
			"title": "DHCP server settings",
			"sections": [
				{
					"id": "general",
					"title": "General settings",
					"fields": [
						{
							"name": "backend",
							"type": "select",
							"label": "DHCP backend",
							"readonly": true,
							"default": "kea",
							"width": "half",
							"options": [
								{
									"value": "kea",
									"label": "Kea DHCP"
								}
							],
							"help": "FreeSense runs Kea DHCP. ISC DHCP has reached end of life and is not available.",
							"errorMatch": [
								"kea dhcp backend"
							]
						},
						{
							"name": "loglevel",
							"type": "select",
							"label": "Log level",
							"default": "WARN",
							"width": "half",
							"options": [
								{
									"value": "FATAL",
									"label": "Fatal"
								},
								{
									"value": "ERROR",
									"label": "Error"
								},
								{
									"value": "WARN",
									"label": "Warning (default)"
								},
								{
									"value": "INFO",
									"label": "Informational"
								},
								{
									"value": "DEBUG",
									"label": "Debug"
								}
							],
							"help": "Lowest severity of the Kea messages sent to the DHCP log."
						},
						{
							"name": "dnsreg",
							"type": "switch",
							"label": "DNS registration",
							"text": "Enable DNS registration",
							"width": "half",
							"help": "Default DNS registration policy; an interface can override it. Clients are registered with the DNS Resolver."
						},
						{
							"name": "earlydnsreg",
							"type": "switch",
							"label": "Early DNS registration",
							"text": "Enable early DNS registration",
							"width": "half",
							"help": "Default early DNS registration policy for static mappings; an interface or mapping can override it."
						}
					]
				},
				{
					"id": "ha",
					"title": "High availability",
					"fields": [
						{
							"name": "ha_enable",
							"type": "switch",
							"label": "High availability",
							"text": "Enable hot-standby high availability"
						},
						{
							"name": "ha_role",
							"type": "segmented",
							"label": "Node role",
							"default": "primary",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							},
							"options": [
								{
									"value": "primary",
									"label": "Primary"
								},
								{
									"value": "standby",
									"label": "Standby"
								}
							],
							"help": "Only one node is the primary."
						},
						{
							"name": "ha_localname",
							"type": "text",
							"label": "Local name",
							"mono": true,
							"width": "half",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							},
							"placeholder": "FreeSense",
							"help": "Name of this instance (hostname-like)."
						},
						{
							"name": "ha_remotename",
							"type": "text",
							"label": "Remote name",
							"mono": true,
							"width": "half",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							},
							"help": "Name of the partner instance (hostname-like)."
						},
						{
							"name": "ha_localip",
							"type": "text",
							"label": "Local address",
							"mono": true,
							"width": "third",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							},
							"help": "Listening address of this instance."
						},
						{
							"name": "ha_localport",
							"type": "number",
							"label": "Local port",
							"min": 1,
							"max": 65535,
							"width": "third",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							},
							"placeholder": "8765"
						},
						{
							"name": "ha_remoteip",
							"type": "text",
							"label": "Remote address",
							"mono": true,
							"width": "third",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							},
							"help": "Listening address of the partner instance."
						},
						{
							"name": "ha_remoteport",
							"type": "number",
							"label": "Remote port",
							"min": 1,
							"max": 65535,
							"width": "third",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							},
							"placeholder": "8765"
						}
					]
				},
				{
					"id": "ha_advanced",
					"title": "High availability tuning",
					"advanced": true,
					"visibleWhen": {
						"field": "ha_enable",
						"truthy": true
					},
					"fields": [
						{
							"name": "ha_heartbeatdelay",
							"type": "number",
							"label": "Heartbeat Delay",
							"min": 1,
							"width": "half",
							"placeholder": "10000",
							"help": "Time between two heartbeats to the partner.",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							},
							"unit": "ms"
						},
						{
							"name": "ha_maxresponsedelay",
							"type": "number",
							"label": "Max Response Delay",
							"min": 1,
							"width": "half",
							"placeholder": "60000",
							"help": "Time without contact after which the partner counts as unreachable; longer than the heartbeat delay.",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							},
							"unit": "ms"
						},
						{
							"name": "ha_maxackdelay",
							"type": "number",
							"label": "Max Ack Delay",
							"min": 1,
							"width": "half",
							"placeholder": "60000",
							"help": "Time a client may try to reach the partner before it counts as \"unacked\".",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							},
							"unit": "ms"
						},
						{
							"name": "ha_maxunackedclients",
							"type": "number",
							"label": "Max Unacked Clients",
							"min": 0,
							"width": "half",
							"placeholder": "0",
							"help": "\"Unacked\" clients allowed before the partner counts as down.",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							}
						},
						{
							"name": "ha_maxrejectedleaseupdates",
							"type": "number",
							"label": "Max Rejected Updates",
							"min": 0,
							"width": "half",
							"placeholder": "10",
							"help": "Failed lease updates for distinct clients before the server stops synchronizing.",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							}
						}
					]
				},
				{
					"id": "ha_tls",
					"title": "TLS transport",
					"advanced": true,
					"visibleWhen": {
						"field": "ha_enable",
						"truthy": true
					},
					"description": "Not synchronized: configure TLS on both instances.",
					"fields": [
						{
							"name": "ha_tls",
							"type": "switch",
							"label": "TLS transport",
							"text": "Secure heartbeats and lease updates with TLS",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							}
						},
						{
							"name": "ha_scertref",
							"type": "select",
							"label": "Server certificate",
							"width": "half",
							"visibleWhen": [
								{
									"field": "ha_enable",
									"truthy": true
								},
								{
									"field": "ha_tls",
									"truthy": true
								}
							],
							"options": [
								{
									"value": "6ac0aae79ac39",
									"label": "FreeRADIUS Server Certificate"
								},
								{
									"value": "6ac0b399d7f25",
									"label": "fstest"
								},
								{
									"value": "6ac0b56aa7f4a",
									"label": "fs-ovpn-server"
								},
								{
									"value": "6ac40644dccf2",
									"label": "FreeRADIUS Server Certificate"
								},
								{
									"value": "6ac50a564d462",
									"label": "FreeRADIUS Server Certificate"
								}
							]
						},
						{
							"name": "ha_mutualtls",
							"type": "switch",
							"label": "Mutual TLS",
							"text": "Offer a client certificate to the partner",
							"width": "half",
							"visibleWhen": [
								{
									"field": "ha_enable",
									"truthy": true
								},
								{
									"field": "ha_tls",
									"truthy": true
								}
							]
						},
						{
							"name": "ha_ccertref",
							"type": "select",
							"label": "Client certificate",
							"width": "half",
							"visibleWhen": [
								{
									"field": "ha_enable",
									"truthy": true
								},
								{
									"field": "ha_tls",
									"truthy": true
								},
								{
									"field": "ha_mutualtls",
									"truthy": true
								}
							],
							"options": [
								{
									"value": "6ac0b594bc838",
									"label": "vpnuser-cert"
								}
							]
						}
					]
				},
				{
					"id": "custom",
					"title": "Custom configuration",
					"advanced": true,
					"fields": [
						{
							"name": "custom_kea_config",
							"type": "textarea",
							"label": "JSON configuration",
							"code": true,
							"rows": 8,
							"readonly": false,
							"help": "JSON merged into the \"Dhcp4\" section of the generated Kea DHCPv4 configuration: a well formed JSON object without the \"Dhcp4\" key itself.",
							"errorMatch": [
								"custom configuration",
								"custom kea configuration"
							]
						}
					]
				}
			],
			"resource": "services/dhcp_settings"
		},
		"dhcpv6_settings": {
			"title": "DHCPv6 server settings",
			"sections": [
				{
					"id": "general",
					"title": "General settings",
					"fields": [
						{
							"name": "backend",
							"type": "select",
							"label": "DHCP backend",
							"readonly": true,
							"default": "kea",
							"width": "half",
							"options": [
								{
									"value": "kea",
									"label": "Kea DHCP"
								}
							],
							"help": "FreeSense runs Kea DHCP. ISC DHCP has reached end of life and is not available.",
							"errorMatch": [
								"kea dhcp backend"
							]
						},
						{
							"name": "loglevel",
							"type": "select",
							"label": "Log level",
							"default": "WARN",
							"width": "half",
							"options": [
								{
									"value": "FATAL",
									"label": "Fatal"
								},
								{
									"value": "ERROR",
									"label": "Error"
								},
								{
									"value": "WARN",
									"label": "Warning (default)"
								},
								{
									"value": "INFO",
									"label": "Informational"
								},
								{
									"value": "DEBUG",
									"label": "Debug"
								}
							],
							"help": "Lowest severity of the Kea messages sent to the DHCP log."
						},
						{
							"name": "dnsreg",
							"type": "switch",
							"label": "DNS registration",
							"text": "Enable DNS registration",
							"width": "half",
							"help": "Default DNS registration policy; an interface can override it. Clients are registered with the DNS Resolver."
						},
						{
							"name": "earlydnsreg",
							"type": "switch",
							"label": "Early DNS registration",
							"text": "Enable early DNS registration",
							"width": "half",
							"help": "Default early DNS registration policy for static mappings; an interface or mapping can override it."
						}
					]
				},
				{
					"id": "ha",
					"title": "High availability",
					"fields": [
						{
							"name": "ha_enable",
							"type": "switch",
							"label": "High availability",
							"text": "Enable hot-standby high availability"
						},
						{
							"name": "ha_role",
							"type": "segmented",
							"label": "Node role",
							"default": "primary",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							},
							"options": [
								{
									"value": "primary",
									"label": "Primary"
								},
								{
									"value": "standby",
									"label": "Standby"
								}
							],
							"help": "Only one node is the primary."
						},
						{
							"name": "ha_localname",
							"type": "text",
							"label": "Local name",
							"mono": true,
							"width": "half",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							},
							"placeholder": "FreeSense",
							"help": "Name of this instance (hostname-like)."
						},
						{
							"name": "ha_remotename",
							"type": "text",
							"label": "Remote name",
							"mono": true,
							"width": "half",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							},
							"help": "Name of the partner instance (hostname-like)."
						},
						{
							"name": "ha_localip",
							"type": "text",
							"label": "Local address",
							"mono": true,
							"width": "third",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							},
							"help": "Listening address of this instance."
						},
						{
							"name": "ha_localport",
							"type": "number",
							"label": "Local port",
							"min": 1,
							"max": 65535,
							"width": "third",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							},
							"placeholder": "8765"
						},
						{
							"name": "ha_remoteip",
							"type": "text",
							"label": "Remote address",
							"mono": true,
							"width": "third",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							},
							"help": "Listening address of the partner instance."
						},
						{
							"name": "ha_remoteport",
							"type": "number",
							"label": "Remote port",
							"min": 1,
							"max": 65535,
							"width": "third",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							},
							"placeholder": "8765"
						}
					]
				},
				{
					"id": "ha_advanced",
					"title": "High availability tuning",
					"advanced": true,
					"visibleWhen": {
						"field": "ha_enable",
						"truthy": true
					},
					"fields": [
						{
							"name": "ha_heartbeatdelay",
							"type": "number",
							"label": "Heartbeat Delay",
							"min": 1,
							"width": "half",
							"placeholder": "10000",
							"help": "Time between two heartbeats to the partner.",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							},
							"unit": "ms"
						},
						{
							"name": "ha_maxresponsedelay",
							"type": "number",
							"label": "Max Response Delay",
							"min": 1,
							"width": "half",
							"placeholder": "60000",
							"help": "Time without contact after which the partner counts as unreachable; longer than the heartbeat delay.",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							},
							"unit": "ms"
						},
						{
							"name": "ha_maxackdelay",
							"type": "number",
							"label": "Max Ack Delay",
							"min": 1,
							"width": "half",
							"placeholder": "60000",
							"help": "Time a client may try to reach the partner before it counts as \"unacked\".",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							},
							"unit": "ms"
						},
						{
							"name": "ha_maxunackedclients",
							"type": "number",
							"label": "Max Unacked Clients",
							"min": 0,
							"width": "half",
							"placeholder": "0",
							"help": "\"Unacked\" clients allowed before the partner counts as down.",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							}
						},
						{
							"name": "ha_maxrejectedleaseupdates",
							"type": "number",
							"label": "Max Rejected Updates",
							"min": 0,
							"width": "half",
							"placeholder": "10",
							"help": "Failed lease updates for distinct clients before the server stops synchronizing.",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							}
						}
					]
				},
				{
					"id": "ha_tls",
					"title": "TLS transport",
					"advanced": true,
					"visibleWhen": {
						"field": "ha_enable",
						"truthy": true
					},
					"description": "Not synchronized: configure TLS on both instances.",
					"fields": [
						{
							"name": "ha_tls",
							"type": "switch",
							"label": "TLS transport",
							"text": "Secure heartbeats and lease updates with TLS",
							"visibleWhen": {
								"field": "ha_enable",
								"truthy": true
							}
						},
						{
							"name": "ha_scertref",
							"type": "select",
							"label": "Server certificate",
							"width": "half",
							"visibleWhen": [
								{
									"field": "ha_enable",
									"truthy": true
								},
								{
									"field": "ha_tls",
									"truthy": true
								}
							],
							"options": [
								{
									"value": "6ac0aae79ac39",
									"label": "FreeRADIUS Server Certificate"
								},
								{
									"value": "6ac0b399d7f25",
									"label": "fstest"
								},
								{
									"value": "6ac0b56aa7f4a",
									"label": "fs-ovpn-server"
								},
								{
									"value": "6ac40644dccf2",
									"label": "FreeRADIUS Server Certificate"
								},
								{
									"value": "6ac50a564d462",
									"label": "FreeRADIUS Server Certificate"
								}
							]
						},
						{
							"name": "ha_mutualtls",
							"type": "switch",
							"label": "Mutual TLS",
							"text": "Offer a client certificate to the partner",
							"width": "half",
							"visibleWhen": [
								{
									"field": "ha_enable",
									"truthy": true
								},
								{
									"field": "ha_tls",
									"truthy": true
								}
							]
						},
						{
							"name": "ha_ccertref",
							"type": "select",
							"label": "Client certificate",
							"width": "half",
							"visibleWhen": [
								{
									"field": "ha_enable",
									"truthy": true
								},
								{
									"field": "ha_tls",
									"truthy": true
								},
								{
									"field": "ha_mutualtls",
									"truthy": true
								}
							],
							"options": [
								{
									"value": "6ac0b594bc838",
									"label": "vpnuser-cert"
								}
							]
						}
					]
				},
				{
					"id": "custom",
					"title": "Custom configuration",
					"advanced": true,
					"fields": [
						{
							"name": "custom_kea_config",
							"type": "textarea",
							"label": "JSON configuration",
							"code": true,
							"rows": 8,
							"readonly": false,
							"help": "JSON merged into the \"Dhcp6\" section of the generated Kea DHCPv6 configuration: a well formed JSON object without the \"Dhcp6\" key itself.",
							"errorMatch": [
								"custom configuration",
								"custom kea configuration"
							]
						}
					]
				}
			],
			"resource": "services/dhcpv6_settings"
		},
		"dhcp_relay": {
			"title": "DHCP relay",
			"sections": [
				{
					"id": "relay",
					"title": "DHCP relay",
					"fields": [
						{
							"name": "enable",
							"type": "switch",
							"label": "Relay",
							"text": "Enable DHCP relay",
							"help": "Cannot be enabled while the DHCP server runs on any interface.",
							"errorMatch": [
								"cannot be enabled while"
							]
						},
						{
							"name": "interface",
							"type": "checklist",
							"label": "Downstream interfaces",
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
							"visibleWhen": {
								"field": "enable",
								"truthy": true
							},
							"help": "Interfaces without an IPv4 address are not listed.",
							"errorMatch": [
								"field interface is required",
								"is not an interface the relay can use"
							]
						},
						{
							"name": "carpstatusvip",
							"type": "select",
							"label": "CARP status VIP",
							"default": "none",
							"width": "half",
							"options": [
								{
									"value": "none",
									"label": "none"
								}
							],
							"visibleWhen": {
								"field": "enable",
								"truthy": true
							},
							"help": "The relay stops while this CARP VIP is in backup state (high availability)."
						},
						{
							"name": "agentoption",
							"type": "switch",
							"label": "Agent information",
							"width": "half",
							"visibleWhen": {
								"field": "enable",
								"truthy": true
							},
							"text": "Append the circuit ID and agent ID to requests"
						},
						{
							"name": "server",
							"type": "entry-grid",
							"label": "Upstream servers",
							"max": 64,
							"reorder": true,
							"addLabel": "Add server",
							"fields": [
								{
									"name": "address",
									"type": "text",
									"label": "Address",
									"mono": true,
									"required": true,
									"width": "lg"
								}
							],
							"help": "IPv4 addresses of the servers the requests are relayed to.",
							"visibleWhen": {
								"field": "enable",
								"truthy": true
							},
							"errorMatch": [
								"upstream server"
							]
						}
					]
				}
			],
			"resource": "services/dhcp_relay"
		},
		"dhcpv6_relay": {
			"title": "DHCPv6 relay",
			"sections": [
				{
					"id": "relay",
					"title": "DHCPv6 relay",
					"fields": [
						{
							"name": "enable",
							"type": "switch",
							"label": "Relay",
							"text": "Enable DHCPv6 relay",
							"help": "Cannot be enabled while the DHCPv6 server runs on any interface.",
							"errorMatch": [
								"cannot be enabled while"
							]
						},
						{
							"name": "interface",
							"type": "checklist",
							"label": "Downstream interfaces",
							"options": [],
							"visibleWhen": {
								"field": "enable",
								"truthy": true
							},
							"help": "Interfaces without an IPv6 address are not listed.",
							"errorMatch": [
								"field interface is required",
								"is not an interface the relay can use"
							]
						},
						{
							"name": "carpstatusvip",
							"type": "select",
							"label": "CARP status VIP",
							"default": "none",
							"width": "half",
							"options": [
								{
									"value": "none",
									"label": "none"
								}
							],
							"visibleWhen": {
								"field": "enable",
								"truthy": true
							},
							"help": "The relay stops while this CARP VIP is in backup state (high availability)."
						},
						{
							"name": "agentoption",
							"type": "switch",
							"label": "Agent information",
							"width": "half",
							"visibleWhen": {
								"field": "enable",
								"truthy": true
							},
							"text": "Append the circuit ID and agent ID to requests"
						},
						{
							"name": "server",
							"type": "entry-grid",
							"label": "Upstream servers",
							"max": 64,
							"reorder": true,
							"addLabel": "Add server",
							"fields": [
								{
									"name": "address",
									"type": "text",
									"label": "Address",
									"mono": true,
									"required": true,
									"width": "lg"
								}
							],
							"help": "IPv6 addresses of the servers the requests are relayed to.",
							"visibleWhen": {
								"field": "enable",
								"truthy": true
							},
							"errorMatch": [
								"upstream server"
							]
						}
					]
				}
			],
			"resource": "services/dhcpv6_relay"
		}
	};
	var LAN_FIELDS = {
		"enable": true,
		"staticarp": false,
		"range_from": "192.168.228.100",
		"range_to": "192.168.228.150",
		"denyunknown": "disabled",
		"gateway": "",
		"domain": "",
		"domainsearchlist": "",
		"mac_allow": "",
		"mac_deny": "",
		"tftp": "",
		"ldap": "",
		"filename": "",
		"filename32": "",
		"filename64": "",
		"filename32arm": "",
		"filename64arm": "",
		"uefihttpboot": "",
		"rootpath": "",
		"netboot": false,
		"ignoreclientuids": false,
		"deftime": "",
		"maxtime": "",
		"nextserver": "",
		"dnsregpolicy": "default",
		"earlydnsregpolicy": "default",
		"custom_kea_config": "",
		"winsserver": [],
		"dnsserver": [],
		"ntpserver": []
	};
	var SETTINGS = {
		"dnsreg": false,
		"earlydnsreg": false,
		"loglevel": "DEBUG",
		"ha_enable": false,
		"ha_role": "primary",
		"ha_localname": "",
		"ha_localip": "",
		"ha_localport": "",
		"ha_remotename": "",
		"ha_remoteip": "",
		"ha_remoteport": "",
		"ha_heartbeatdelay": "",
		"ha_maxresponsedelay": "",
		"ha_maxackdelay": "",
		"ha_maxunackedclients": "",
		"ha_maxrejectedleaseupdates": "",
		"ha_tls": false,
		"ha_scertref": "",
		"ha_mutualtls": false,
		"ha_ccertref": "",
		"custom_kea_config_editable": true,
		"loglevel_choices": {
			"FATAL": "Fatal",
			"ERROR": "Error",
			"WARN": "Warning (default)",
			"INFO": "Informational",
			"DEBUG": "Debug"
		},
		"role_choices": {
			"primary": "Primary",
			"standby": "Standby"
		},
		"scertref_choices": {
			"6ac0aae79ac39": "FreeRADIUS Server Certificate",
			"6ac0b399d7f25": "fstest",
			"6ac0b56aa7f4a": "fs-ovpn-server",
			"6ac40644dccf2": "FreeRADIUS Server Certificate",
			"6ac50a564d462": "FreeRADIUS Server Certificate"
		},
		"ccertref_choices": {
			"6ac0b594bc838": "vpnuser-cert"
		},
		"pending": false,
		"backend": "kea",
		"fields": {
			"backend": "kea",
			"dnsreg": false,
			"earlydnsreg": false,
			"ha_enable": false,
			"ha_tls": false,
			"ha_mutualtls": false,
			"loglevel": "DEBUG",
			"ha_role": "primary",
			"ha_localname": "",
			"ha_localip": "",
			"ha_localport": "",
			"ha_remotename": "",
			"ha_remoteip": "",
			"ha_remoteport": "",
			"ha_heartbeatdelay": "",
			"ha_maxresponsedelay": "",
			"ha_maxackdelay": "",
			"ha_maxunackedclients": "",
			"ha_maxrejectedleaseupdates": "",
			"ha_scertref": "6ac0aae79ac39",
			"ha_ccertref": "6ac0b594bc838",
			"custom_kea_config": "{\"valid-lifetime\": 7300}"
		}
	};
	var RELAY = {
		"enable": false,
		"interface": [],
		"agentoption": false,
		"server": [],
		"carpstatusvip": "none",
		"dhcp_server_enabled": true
	};
	var pending = { dhcp: false, dhcpv6: false };

	function ip2n(a) { return a.split('.').reduce(function (n, o) { return n * 256 + (+o); }, 0); }
	function n2ip(n) { return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'); }
	function net(i) {
		if (!i.ipv4) return null;
		var p = i.ipv4.split('/'), bits = +(p[1] || 24), mask = bits ? (~0 << (32 - bits)) >>> 0 : 0, base = (ip2n(p[0]) & mask) >>> 0;
		return { addr: p[0], bits: bits, first: n2ip(base + 1), last: n2ip(base + Math.pow(2, 32 - bits) - 2), subnet: n2ip(base) + '/' + bits, base: base };
	}
	function ifs() { return M.interfaces.filter(function (i) { return !/^(tun|wg|ovpn)/.test(i.if); }); }

	/* DHCPv4 servers per interface (fields as the API returns them). */
	var SERVERS = {};
	var MAPPINGS = {};
	ifs().forEach(function (i) {
		var n = net(i);
		if (!n || i.id === 'wan') return;
		var f = clone(LAN_FIELDS);
		Object.assign(f, { enable: i.id !== 'opt3', range_from: n2ip(n.base + 100), range_to: n2ip(n.base + 199), gateway: '', domain: '', dnsserver: [], winsserver: [], ntpserver: [] });
		SERVERS[i.id] = f;
		MAPPINGS[i.id] = [];
	});
	if (MAPPINGS.lan) MAPPINGS.lan = [
		{ mac: '00:11:32:aa:01:10', cid: '', ipaddr: '192.168.1.10', hostname: 'nas', descr: 'Storage', arp_table_static_entry: true },
		{ mac: '3c:22:fb:12:34:56', cid: '', ipaddr: '192.168.1.20', hostname: 'office-pc', descr: 'Office desktop', arp_table_static_entry: false },
		{ mac: 'b8:27:eb:5d:9e:01', cid: '', ipaddr: '192.168.1.30', hostname: 'printer', descr: 'Laser printer', arp_table_static_entry: false }
	];
	var V6MAPPINGS = { lan: [] };

	function serverDisplay(id) {
		var i = M.interfaces.find(function (x) { return x.id === id; }), n = net(i), f = SERVERS[id];
		return { interface: i.descr, backend: 'Kea DHCP', enabled: !!f.enable, subnet: n.subnet, subnet_range: n.first + ' – ' + n.last,
			range: f.range_from + ' – ' + f.range_to, pools: 1, static_count: MAPPINGS[id].length, relay_enabled: false,
			placeholders: { range_from: n.first, range_to: n.last, gateway: n.addr, domain: 'home.arpa', dnsserver: [n.addr] } };
	}
	function serverOut(id) {
		var f = SERVERS[id];
		return { interface: id, range: { from: f.range_from, to: f.range_to }, enable: f.enable ? '' : undefined, pending: pending.dhcp, fields: clone(f), display: serverDisplay(id) };
	}
	function mappingOut(m, i) {
		return Object.assign({ id: i }, clone(m), { fields: clone(m), display: { mac: m.mac, ip: m.ipaddr || '', hostname: m.hostname || '', description: m.descr || '', client_id: m.cid || '',
			name: m.hostname || m.mac, static_arp: !!m.arp_table_static_entry, early_dns: false } });
	}
	function inRange(id, a) { var n = net(M.interfaces.find(function (x) { return x.id === id; })), v = ip2n(a); return v > n.base && v < n.base + Math.pow(2, 32 - n.bits) - 1; }

	function schema(name, q) {
		var s = clone(SCHEMAS[name]);
		var id = q && q.get && q.get('interface');
		if (name === 'dhcp_server' && id && SERVERS[id]) {
			var ph = serverDisplay(id).placeholders;
			s.sections.forEach(function (sec) { sec.fields.forEach(function (f) { if (ph[f.name] && typeof ph[f.name] === 'string') f.placeholder = ph[f.name]; }); });
		}
		s.sections.forEach(function (sec) { sec.fields.forEach(function (f) {
			if (f.name === 'interface' && f.options) f.options = ifs().map(function (i) { return { value: i.id, label: i.descr }; });
			if (/certref$/.test(f.name)) f.options = [{ value: '', label: 'None' }, { value: '5f1c0a9b2d3e4', label: 'GUI default' }];
		}); });
		return s;
	}
	Object.keys(SCHEMAS).forEach(function (n) { M.route('GET', '/api/v1/schema/services/' + n, function (p, q) { return M.ok(schema(n, q)); }); });

	/* ---------------------------------------------------------------- DHCPv4 */

	var B = '/api/v1/services/dhcp';
	M.route('GET', B + '/servers', function () {
		return M.ok(ifs().map(function (i) {
			var f = SERVERS[i.id], n = net(i);
			return { interface: i.id, description: i.descr, enabled: !!(f && f.enable), range: f ? f.range_from + ' – ' + f.range_to : '',
				static_count: f ? MAPPINGS[i.id].length : 0, subnet: n && f ? n.subnet : '', available: !!f, pools: f ? 1 : 0 };
		}));
	});
	M.route('GET', B + '/servers/{if}', function (p) {
		if (!M.interfaces.some(function (x) { return x.id === p.if; })) return M.err(404, 'No such interface.');
		return SERVERS[p.if] ? M.ok(serverOut(p.if)) : M.err(409, 'The DHCP server can only be enabled on interfaces configured with a static IPv4 address.');
	});
	M.route('PUT', B + '/servers/{if}', function (p, q, b) {
		var f = SERVERS[p.if];
		if (!f) return M.err(409, 'The DHCP server can only be enabled on interfaces configured with a static IPv4 address.');
		var n = Object.assign(clone(f), b || {});
		['interface', 'range', 'pending', 'fields', 'display'].forEach(function (k) { delete n[k]; });
		var e = {};
		if (n.enable) {
			if (!V4.test(n.range_from || '') || !inRange(p.if, n.range_from)) e.range_from = 'The range lies outside of the current subnet.';
			if (!V4.test(n.range_to || '') || !inRange(p.if, n.range_to)) e.range_to = 'The range lies outside of the current subnet.';
			else if (V4.test(n.range_from || '') && ip2n(n.range_from) > ip2n(n.range_to)) e.range_to = 'The range is invalid (first element higher than second element).';
		}
		if (n.gateway && !V4.test(n.gateway)) e.gateway = 'A valid IP address must be specified for the gateway.';
		if (n.deftime && !(+n.deftime >= 60)) e.deftime = 'The default lease time must be at least 60 seconds.';
		if (Object.keys(e).length) return M.err(422, INVALID, e);
		SERVERS[p.if] = n;
		pending.dhcp = true;
		return M.ok(serverOut(p.if));
	});
	function mappingCheck(id, m, skip) {
		var e = {};
		if (!MAC.test(m.mac || '') && !m.cid) e.mac = 'A valid MAC address must be specified.';
		if (m.ipaddr && (!V4.test(m.ipaddr) || !inRange(id, m.ipaddr))) e.ipaddr = 'The IP address must lie in the ' + M.interfaces.find(function (x) { return x.id === id; }).descr + ' subnet.';
		if (m.hostname && !/^[A-Za-z0-9-]{1,63}$/.test(m.hostname)) e.hostname = 'The hostname can only contain the characters A-Z, 0-9 and \'-\'. It may not start or end with \'-\'.';
		MAPPINGS[id].forEach(function (x, i) {
			if (i === skip) return;
			if (x.mac === m.mac) e.mac = 'This MAC address already exists.';
			if (m.ipaddr && x.ipaddr === m.ipaddr) e.ipaddr = 'This IP address is already in use by another static mapping.';
		});
		return Object.keys(e).length ? e : null;
	}
	var SM = B + '/servers/{if}/static-mappings';
	M.route('GET', SM, function (p) { return MAPPINGS[p.if] ? M.ok(MAPPINGS[p.if].map(mappingOut)) : M.err(409, 'The DHCP server is not available on this interface.'); });
	M.route('GET', SM + '/{id}', function (p) { var l = MAPPINGS[p.if]; return l && l[+p.id] ? M.ok(mappingOut(l[+p.id], +p.id)) : M.err(404, 'Not found.'); });
	M.route('POST', SM, function (p, q, b) {
		var l = MAPPINGS[p.if];
		if (!l) return M.err(409, 'The DHCP server is not available on this interface.');
		var m = clone(b || {});
		var e = mappingCheck(p.if, m, -1);
		if (e) return M.err(422, INVALID, e);
		l.push(m);
		if (SERVERS[p.if].enable) pending.dhcp = true;
		return Object.assign(M.ok(mappingOut(m, l.length - 1)), { status: 201 });
	});
	M.route('PUT', SM + '/{id}', function (p, q, b) {
		var l = MAPPINGS[p.if];
		if (!l || !l[+p.id]) return M.err(404, 'Not found.');
		var m = Object.assign(clone(l[+p.id]), b || {});
		['id', 'fields', 'display'].forEach(function (k) { delete m[k]; });
		var e = mappingCheck(p.if, m, +p.id);
		if (e) return M.err(422, INVALID, e);
		l[+p.id] = m;
		if (SERVERS[p.if].enable) pending.dhcp = true;
		return M.ok(mappingOut(m, +p.id));
	});
	M.route('DELETE', SM + '/{id}', function (p) {
		var l = MAPPINGS[p.if];
		if (!l || !l[+p.id]) return M.err(404, 'Not found.');
		l.splice(+p.id, 1);
		if (SERVERS[p.if].enable) pending.dhcp = true;
		return M.ok({ deleted: +p.id });
	});

	/* ---------------------------------------------------------------- DHCPv6 (no server configured in the mock) */

	var B6 = '/api/v1/services/dhcpv6';
	M.route('GET', B6 + '/servers', function () {
		return M.ok(ifs().map(function (i) {
			var lan = i.id === 'lan';
			return { interface: i.id, description: i.descr, enabled: false, range: '', static_count: 0, subnet: lan ? 'fd00:1::/64' : '', available: lan, track6: false, ramode: lan ? 'assist' : 'disabled' };
		}));
	});
	M.route('GET', B6 + '/servers/{if}', function (p) {
		if (p.if !== 'lan') return M.err(409, 'The DHCPv6 server can only be enabled on interfaces configured with a static IPv6 address.');
		return M.ok({ interface: 'lan', pending: pending.dhcpv6, fields: { enable: false, range_from: '', range_to: '', domain: '', dnsserver: [] },
			display: { interface: 'LAN', backend: 'Kea DHCP', enabled: false, prefix: 'fd00:1::/64', prefix_range: 'fd00:1:: – fd00:1::ffff:ffff:ffff:ffff', range: '', pools: 0, static_count: 0, track6: false, ramode: 'assist', relay_enabled: false, placeholders: { domain: 'home.arpa', dnsserver: ['fd00:1::1'] } } });
	});
	M.route('PUT', B6 + '/servers/{if}', function (p) {
		if (p.if !== 'lan') return M.err(409, 'The DHCPv6 server can only be enabled on interfaces configured with a static IPv6 address.');
		pending.dhcpv6 = true;
		return M.ok({ interface: 'lan', pending: true });
	});
	M.route('GET', B6 + '/servers/{if}/static-mappings', function (p) { return M.ok((V6MAPPINGS[p.if] || []).slice()); });

	/* ---------------------------------------------------------------- shared */

	['dhcp', 'dhcpv6'].forEach(function (s) {
		var base = '/api/v1/services/' + s;
		M.route('GET', base + '/pending', function () { return M.ok({ pending: pending[s] }); });
		M.route('POST', base + '/apply', function () { pending[s] = false; return Object.assign(M.ok({ applied: true, pending: false }), { delay: 900 }); });
		var st = clone(SETTINGS);
		M.route('GET', base + '/settings', function () { return M.ok(Object.assign(clone(st), { backend: 'kea', pending: pending[s], fields: clone(st) })); });
		M.route('PUT', base + '/settings', function (p, q, b) {
			b = b || {};
			if (b.backend && b.backend !== 'kea') return M.err(422, INVALID, { backend: 'Only the Kea DHCP backend is available.' });
			Object.keys(b).forEach(function (k) { if (k in st) st[k] = b[k]; });
			pending[s] = true;
			return M.ok(Object.assign(clone(st), { backend: 'kea', pending: true, fields: clone(st) }));
		});
		var relay = clone(RELAY);
		relay.dhcp_server_enabled = true;
		M.route('GET', '/api/v1/services/' + s + '-relay', function () { return M.ok(Object.assign(clone(relay), { fields: clone(relay) })); });
		M.route('PUT', '/api/v1/services/' + s + '-relay', function (p, q, b) {
			b = b || {};
			var n = Object.assign(clone(relay), b);
			if (n.enable && !(n.server || []).length) return M.err(422, INVALID, { server: 'At least one destination server IP address must be specified.' });
			if (n.enable && relay.dhcp_server_enabled && s === 'dhcp') return M.err(422, INVALID, null, ['The DHCP server is enabled on at least one interface. The relay cannot run at the same time.']);
			['fields'].forEach(function (k) { delete n[k]; });
			relay = n;
			return M.ok(Object.assign(clone(relay), { fields: clone(relay) }));
		});
	});
})(window.FSMock);
