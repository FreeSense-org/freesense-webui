/*
 * routes-unbound.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Mock DNS resolver, as the API serves it (freesense restapi/routes_unbound.inc):
 *   GET    /api/v1/schema/services/dns_resolver{,_advanced}, dns_host_override, dns_domain_override, dns_access_list
 *   GET    /api/v1/services/dns-resolver               general settings (flat form values + *_choices); PUT partial
 *   GET    /api/v1/services/dns-resolver/advanced      advanced settings; PUT partial
 *   GET    /api/v1/services/dns-resolver/pending       {pending: bool}
 *   POST   /api/v1/services/dns-resolver/apply         apply (reload the resolver)
 *   GET    /api/v1/services/dns-resolver/{host-overrides|domain-overrides|access-lists}   [{id, …stored…, fields, display}], id = position
 *   POST, GET/PUT/DELETE …/{id}                        create / one / partial update / delete
 * Every write saves and marks the resolver pending, like the 1.x pages.
 */
(function (M) {
	'use strict';

	var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
	var INVALID = 'The request failed validation.';
	var V4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
	var V6 = /^[0-9a-f:]+$/i;
	var isIp = function (v) { return V4.test(v) || (V6.test(v) && v.indexOf(':') >= 0); };
	var HOSTNAME = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)$/i;
	var DOMAIN = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;
	var SCHEMAS = {
		dns_resolver: {
			"title": "DNS resolver",
			"order": [
				"general",
				"tls",
				"forwarding",
				"registration",
				"python",
				"custom"
			],
			"sections": [
				{
					"id": "general",
					"title": "General DNS resolver options",
					"fields": [
						{
							"name": "enable",
							"type": "switch",
							"label": "Enable",
							"text": "Enable DNS resolver"
						},
						{
							"name": "port",
							"type": "port",
							"label": "Listen port",
							"range": false,
							"alias": false,
							"placeholder": "53",
							"width": "third",
							"help": "The port used for responding to DNS queries. It should normally be left blank unless another service needs to bind to TCP/UDP port 53.",
							"errorMatch": [
								"valid port number",
								"using this port"
							]
						},
						{
							"name": "active_interface",
							"type": "checklist",
							"label": "Network interfaces",
							"required": true,
							"options": [
								{
									"value": "all",
									"label": "All"
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
									"value": "_llocwan",
									"label": "WAN IPv6 Link-Local"
								},
								{
									"value": "_lloclan",
									"label": "LAN IPv6 Link-Local"
								},
								{
									"value": "lo0",
									"label": "Localhost"
								}
							],
							"help": "Interface IP addresses used by the DNS Resolver for responding to queries from clients. If an interface has both IPv4 and IPv6 addresses, both are used. Queries to addresses not selected in this list are discarded. The default behavior is to respond to queries on every available IPv4 and IPv6 address.",
							"errorMatch": [
								"is not an interface the dns resolver offers"
							]
						},
						{
							"name": "outgoing_interface",
							"type": "checklist",
							"label": "Outgoing network interfaces",
							"required": true,
							"options": [
								{
									"value": "all",
									"label": "All"
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
									"value": "_llocwan",
									"label": "WAN IPv6 Link-Local"
								},
								{
									"value": "_lloclan",
									"label": "LAN IPv6 Link-Local"
								},
								{
									"value": "lo0",
									"label": "Localhost"
								}
							],
							"help": "Utilize different network interface(s) that the DNS Resolver will use to send queries to authoritative servers and receive their replies. By default all interfaces are used."
						},
						{
							"name": "strictout",
							"type": "switch",
							"label": "Strict outgoing network interface binding",
							"text": "Do not send recursive queries if none of the selected Outgoing Network Interfaces are available.",
							"help": "By default the DNS Resolver sends recursive DNS requests over any available interfaces if none of the selected Outgoing Network Interfaces are available. This option makes the DNS Resolver refuse recursive queries."
						},
						{
							"name": "system_domain_local_zone_type",
							"type": "select",
							"label": "System domain local zone type",
							"required": true,
							"default": "transparent",
							"width": "half",
							"options": [
								{
									"value": "deny",
									"label": "Deny"
								},
								{
									"value": "refuse",
									"label": "Refuse"
								},
								{
									"value": "static",
									"label": "Static"
								},
								{
									"value": "transparent",
									"label": "Transparent"
								},
								{
									"value": "typetransparent",
									"label": "Type Transparent"
								},
								{
									"value": "redirect",
									"label": "Redirect"
								},
								{
									"value": "inform",
									"label": "Inform"
								},
								{
									"value": "inform_deny",
									"label": "Inform Deny"
								},
								{
									"value": "nodefault",
									"label": "No Default"
								}
							],
							"help": "The local-zone type used for the system domain (System > General Setup). Transparent is the default."
						},
						{
							"name": "dnssec",
							"type": "switch",
							"label": "DNSSEC",
							"text": "Enable DNSSEC Support"
						}
					]
				},
				{
					"id": "tls",
					"title": "DNS over SSL/TLS",
					"fields": [
						{
							"name": "enablessl",
							"type": "switch",
							"label": "Enable SSL/TLS service",
							"text": "Respond to incoming SSL/TLS queries from local clients",
							"help": "Configures the DNS Resolver to act as a DNS over SSL/TLS server which can answer queries from clients which also support DNS over TLS. Activating this option disables automatic interface response routing behavior, thus it works best with specific interface bindings."
						},
						{
							"name": "sslcertref",
							"type": "select",
							"label": "SSL/TLS certificate",
							"width": "half",
							"options": [
								{
									"value": "5f1c0a9b2d3e4",
									"label": "GUI default (5f1c0a9b2d3e4)"
								},
								{
									"value": "5f1c0a9b2d3e5",
									"label": "dns.home.arpa"
								}
							],
							"visibleWhen": {
								"field": "enablessl",
								"truthy": true
							},
							"errorMatch": [
								"valid server certificate"
							],
							"help": "The server certificate to use for SSL/TLS service. The CA chain will be determined automatically."
						},
						{
							"name": "tlsport",
							"type": "port",
							"label": "SSL/TLS listen port",
							"range": false,
							"alias": false,
							"placeholder": "853",
							"width": "third",
							"visibleWhen": {
								"field": "enablessl",
								"truthy": true
							},
							"errorMatch": [
								"ssl/tls port number"
							],
							"help": "The port used for responding to SSL/TLS DNS queries. It should normally be left blank unless another service needs to bind to TCP/UDP port 853."
						}
					]
				},
				{
					"id": "forwarding",
					"title": "Forwarding",
					"fields": [
						{
							"name": "forwarding",
							"type": "switch",
							"label": "DNS query forwarding",
							"text": "Enable Forwarding Mode",
							"errorMatch": [
								"forwarding mode"
							],
							"help": "If this option is set, DNS queries will be forwarded to the upstream DNS servers defined under System > General Setup or those obtained via dynamic interfaces such as DHCP, PPP, or OpenVPN (if DNS Server Override is enabled there)."
						},
						{
							"name": "forward_tls_upstream",
							"type": "switch",
							"label": "Forwarding over SSL/TLS",
							"text": "Use SSL/TLS for outgoing DNS Queries to Forwarding Servers",
							"visibleWhen": {
								"field": "forwarding",
								"truthy": true
							},
							"help": "When set in conjunction with DNS Query Forwarding, queries to all upstream forwarding DNS servers will be sent using SSL/TLS on the default port of 853. Note that ALL configured forwarding servers MUST support SSL/TLS queries on port 853."
						}
					]
				},
				{
					"id": "registration",
					"title": "Registration",
					"fields": [
						{
							"name": "regovpnclients",
							"type": "switch",
							"label": "OpenVPN clients",
							"text": "Register connected OpenVPN clients in the DNS Resolver",
							"help": "If this option is set, then the common name (CN) of connected OpenVPN clients will be registered in the DNS Resolver, so that their name can be resolved. This only works for OpenVPN servers (Remote Access SSL/TLS or User Auth with Username as Common Name option) operating in \"tun\" mode. The domain in System > General Setup should also be set to the proper value."
						}
					]
				},
				{
					"id": "python",
					"title": "Python module",
					"advanced": true,
					"fields": [
						{
							"name": "python",
							"type": "switch",
							"label": "Python module",
							"text": "Enable Python Module"
						},
						{
							"name": "python_order",
							"type": "select",
							"label": "Python module order",
							"width": "half",
							"default": "pre_validator",
							"visibleWhen": {
								"field": "python",
								"truthy": true
							},
							"help": "Select the Python Module ordering.",
							"options": [
								{
									"value": "pre_validator",
									"label": "Pre Validator"
								},
								{
									"value": "post_validator",
									"label": "Post Validator"
								}
							]
						},
						{
							"name": "python_script",
							"type": "select",
							"label": "Python module script",
							"width": "half",
							"options": [
								{
									"value": "",
									"label": "No Python Module scripts found"
								}
							],
							"visibleWhen": {
								"field": "python",
								"truthy": true
							},
							"help": "Select the Python module script to utilize."
						}
					]
				},
				{
					"id": "custom",
					"title": "Custom options",
					"advanced": true,
					"fields": [
						{
							"name": "custom_options",
							"type": "textarea",
							"label": "Custom options",
							"code": true,
							"rows": 8,
							"help": "Enter any additional configuration parameters to add to the DNS Resolver configuration here, separated by a newline.",
							"errorMatch": [
								"generated config file"
							]
						}
					]
				}
			],
			"resource": "services/dns_resolver"
		},
		dns_resolver_advanced: {
			"title": "DNS resolver advanced settings",
			"order": [
				"privacy",
				"resolver",
				"cache",
				"access",
				"dns64"
			],
			"sections": [
				{
					"id": "privacy",
					"title": "Advanced privacy options",
					"fields": [
						{
							"name": "hideidentity",
							"type": "switch",
							"label": "Hide identity",
							"text": "id.server and hostname.bind queries are refused"
						},
						{
							"name": "hideversion",
							"type": "switch",
							"label": "Hide version",
							"text": "version.server and version.bind queries are refused"
						},
						{
							"name": "qname-minimisation",
							"type": "switch",
							"label": "Query name minimization",
							"text": "Send minimum amount of QNAME/QTYPE information to upstream servers to enhance privacy",
							"help": "Only send minimum required labels of the QNAME and set QTYPE to A when possible. Best effort approach; full QNAME and original QTYPE will be sent when upstream replies with a RCODE other than NOERROR, except when receiving NXDOMAIN from a DNSSEC signed zone. See RFC 7816."
						},
						{
							"name": "qname-minimisation-strict",
							"type": "switch",
							"label": "Strict query name minimization",
							"text": "Do not fall-back to sending full QNAME to potentially broken DNS servers",
							"visibleWhen": {
								"field": "qname-minimisation",
								"truthy": true
							},
							"help": "QNAME minimization in strict mode. A significant number of domains will fail to resolve when this option in enabled. Only use if you know what you are doing. This option only has effect when Query Name Minimization is enabled. Default is off."
						}
					]
				},
				{
					"id": "resolver",
					"title": "Advanced resolver options",
					"fields": [
						{
							"name": "prefetch",
							"type": "switch",
							"label": "Prefetch support",
							"text": "Message cache elements are prefetched before they expire to help keep the cache up to date",
							"help": "When enabled, this option can cause an increase of around 10% more DNS traffic and load on the server, but frequently requested items will not expire from the cache."
						},
						{
							"name": "prefetchkey",
							"type": "switch",
							"label": "Prefetch DNS key support",
							"text": "DNSKEYs are fetched earlier in the validation process when a Delegation signer is encountered",
							"help": "This helps lower the latency of requests but does utilize a little more CPU."
						},
						{
							"name": "dnssecstripped",
							"type": "switch",
							"label": "Harden DNSSEC data",
							"text": "DNSSEC data is required for trust-anchored zones.",
							"help": "If such data is absent, the zone becomes bogus. If Disabled and no DNSSEC data is received, then the zone is made insecure. Requires DNSSEC support on the General tab."
						},
						{
							"name": "dnsrecordcache",
							"type": "switch",
							"label": "Serve expired",
							"text": "Serve cache records even with TTL of 0",
							"help": "When enabled, allows unbound to serve one query even with a TTL of 0, if TTL is 0 then new record will be requested in the background when the cache is served to ensure cache is updated without latency on service of the DNS request."
						},
						{
							"name": "sock_queue_timeout",
							"type": "number",
							"label": "Drop old UDP queries",
							"min": 0,
							"unit": "seconds",
							"width": "third",
							"help": "Timeout in seconds before dropping UDP queries waiting in the socket buffer. Queries that have waited for a long time don't need to be processed and can be dropped. Disabled by default (0)."
						},
						{
							"name": "aggressivensec",
							"type": "switch",
							"label": "Aggressive NSEC",
							"text": "Aggressive Use of DNSSEC-Validated Cache",
							"help": "When enabled, unbound uses the DNSSEC NSEC chain to synthesize NXDOMAIN and other denials, using information from previous NXDOMAINs answers. It helps to reduce the query rate towards targets that get a very high nonexistent name lookup rate."
						}
					]
				},
				{
					"id": "cache",
					"title": "Buffers, cache and logging",
					"advanced": true,
					"fields": [
						{
							"name": "msgcachesize",
							"type": "select",
							"label": "Message cache size",
							"width": "half",
							"options": [
								{
									"value": "4",
									"label": "4 MB"
								},
								{
									"value": "10",
									"label": "10 MB"
								},
								{
									"value": "20",
									"label": "20 MB"
								},
								{
									"value": "50",
									"label": "50 MB"
								},
								{
									"value": "100",
									"label": "100 MB"
								},
								{
									"value": "250",
									"label": "250 MB"
								},
								{
									"value": "512",
									"label": "512 MB"
								}
							],
							"help": "Size of the message cache. The message cache stores DNS response codes and validation statuses. The Resource Record Set (RRSet) cache will automatically be set to twice this amount. The RRSet cache contains the actual RR data. The default is 4 megabytes.",
							"default": "4"
						},
						{
							"name": "outgoing_num_tcp",
							"type": "select",
							"label": "Outgoing TCP buffers",
							"width": "half",
							"options": [
								{
									"value": "0",
									"label": "0"
								},
								{
									"value": "10",
									"label": "10"
								},
								{
									"value": "20",
									"label": "20"
								},
								{
									"value": "30",
									"label": "30"
								},
								{
									"value": "40",
									"label": "40"
								},
								{
									"value": "50",
									"label": "50"
								}
							],
							"help": "The number of outgoing TCP buffers to allocate per thread. The default value is 10. If 0 is selected then TCP queries are not sent to authoritative servers.",
							"default": "10"
						},
						{
							"name": "incoming_num_tcp",
							"type": "select",
							"label": "Incoming TCP buffers",
							"width": "half",
							"options": [
								{
									"value": "0",
									"label": "0"
								},
								{
									"value": "10",
									"label": "10"
								},
								{
									"value": "20",
									"label": "20"
								},
								{
									"value": "30",
									"label": "30"
								},
								{
									"value": "40",
									"label": "40"
								},
								{
									"value": "50",
									"label": "50"
								}
							],
							"help": "The number of incoming TCP buffers to allocate per thread. The default value is 10. If 0 is selected then TCP queries are not accepted from clients.",
							"default": "10"
						},
						{
							"name": "edns_buffer_size",
							"type": "select",
							"label": "EDNS buffer size",
							"width": "half",
							"options": [
								{
									"value": "auto",
									"label": "Automatic value based on active interface MTUs"
								},
								{
									"value": "512",
									"label": "512: IPv4 Minimum"
								},
								{
									"value": "1220",
									"label": "1220: NSD IPv6 EDNS Minimum"
								},
								{
									"value": "1232",
									"label": "1232: IPv6 Minimum"
								},
								{
									"value": "1432",
									"label": "1432: 1500 Byte MTU"
								},
								{
									"value": "1480",
									"label": "1480: NSD IPv4 EDNS Minimum"
								},
								{
									"value": "4096",
									"label": "4096: Unbound Default"
								}
							],
							"help": "Number of bytes size to advertise as the EDNS reassembly buffer size. This is the value that is used in UDP datagrams sent to peers. Auto mode sets optimal buffer size by using the smallest MTU of active interfaces and subtracting the IPv4/IPv6 header size. If fragmentation reassemble problems occur, usually seen as timeouts, then a value of 1432 should help. The 512/1232 values bypasses most IPv4/IPv6 MTU path problems, but it can generate an excessive amount of TCP fallback.",
							"default": "auto"
						},
						{
							"name": "num_queries_per_thread",
							"type": "select",
							"label": "Number of queries per thread",
							"width": "half",
							"options": [
								{
									"value": "512",
									"label": "512"
								},
								{
									"value": "1024",
									"label": "1024"
								},
								{
									"value": "2048",
									"label": "2048"
								}
							],
							"help": "The number of queries that every thread will service simultaneously. If more queries arrive that need to be serviced, and no queries can be jostled, then these queries are dropped.",
							"default": "512"
						},
						{
							"name": "jostle_timeout",
							"type": "select",
							"label": "Jostle timeout",
							"width": "half",
							"options": [
								{
									"value": "100",
									"label": "100 ms"
								},
								{
									"value": "200",
									"label": "200 ms"
								},
								{
									"value": "500",
									"label": "500 ms"
								},
								{
									"value": "1000",
									"label": "1000 ms"
								}
							],
							"help": "This timeout is used for when the server is very busy. This protects against denial of service by slow queries or high query rates. The default value is 200 milliseconds.",
							"default": "200"
						},
						{
							"name": "cache_max_ttl",
							"type": "number",
							"label": "Maximum TTL for RRsets and messages",
							"min": 0,
							"unit": "seconds",
							"width": "half",
							"placeholder": "86400",
							"help": "The Maximum Time to Live for RRsets and messages in the cache. The default is 86400 seconds (1 day). When the internal TTL expires the cache item is expired. This can be configured to force the resolver to query for data more often and not trust (very large) TTL values."
						},
						{
							"name": "cache_min_ttl",
							"type": "number",
							"label": "Minimum TTL for RRsets and messages",
							"min": 0,
							"unit": "seconds",
							"width": "half",
							"placeholder": "0",
							"help": "The Minimum Time to Live for RRsets and messages in the cache. The default is 0 seconds. If the minimum value kicks in, the data is cached for longer than the domain owner intended, and thus less queries are made to look up the data. The 0 value ensures the data in the cache is as the domain owner intended. High values can lead to trouble as the data in the cache might not match up with the actual data anymore."
						},
						{
							"name": "infra_keep_probing",
							"type": "switch",
							"label": "Keep probing",
							"text": "Keep probing servers that are down",
							"help": "When disabled, it may take up to \"TTL for Host Cache Entries\" for a server to be used again after being marked as down."
						},
						{
							"name": "infra_host_ttl",
							"type": "select",
							"label": "TTL for host cache entries",
							"width": "half",
							"options": [
								{
									"value": "60",
									"label": "1 minutes"
								},
								{
									"value": "120",
									"label": "2 minutes"
								},
								{
									"value": "300",
									"label": "5 minutes"
								},
								{
									"value": "600",
									"label": "10 minutes"
								},
								{
									"value": "900",
									"label": "15 minutes"
								}
							],
							"help": "Time to Live duration for entries in the infrastructure host cache. The infrastructure host cache contains round trip timing, lameness, and EDNS support information for DNS servers. The default value is 15 minutes.",
							"default": "900"
						},
						{
							"name": "infra_cache_numhosts",
							"type": "select",
							"label": "Number of hosts to cache",
							"width": "half",
							"options": [
								{
									"value": "1000",
									"label": "1000"
								},
								{
									"value": "5000",
									"label": "5000"
								},
								{
									"value": "10000",
									"label": "10000"
								},
								{
									"value": "20000",
									"label": "20000"
								},
								{
									"value": "50000",
									"label": "50000"
								},
								{
									"value": "100000",
									"label": "100000"
								},
								{
									"value": "200000",
									"label": "200000"
								}
							],
							"help": "Number of infrastructure hosts for which information is cached. The default is 10,000.",
							"default": "10000"
						},
						{
							"name": "unwanted_reply_threshold",
							"type": "select",
							"label": "Unwanted reply threshold",
							"width": "half",
							"options": [
								{
									"value": "disabled",
									"label": "Disabled"
								},
								{
									"value": "5000000",
									"label": "5 million"
								},
								{
									"value": "10000000",
									"label": "10 million"
								},
								{
									"value": "20000000",
									"label": "20 million"
								},
								{
									"value": "40000000",
									"label": "40 million"
								},
								{
									"value": "50000000",
									"label": "50 million"
								}
							],
							"help": "If enabled, a total number of unwanted replies is kept track of in every thread. When it reaches the threshold, a defensive action is taken and a warning is printed to the log file. This defensive action is to clear the RRSet and message caches, hopefully flushing away any poison. The default is disabled, but if enabled a value of 10 million is suggested.",
							"default": "disabled"
						},
						{
							"name": "log_verbosity",
							"type": "select",
							"label": "Log level",
							"width": "half",
							"options": [
								{
									"value": "0",
									"label": "Level 0: No logging"
								},
								{
									"value": "1",
									"label": "Level 1: Basic operational information"
								},
								{
									"value": "2",
									"label": "Level 2: Detailed operational information"
								},
								{
									"value": "3",
									"label": "Level 3: Query level information"
								},
								{
									"value": "4",
									"label": "Level 4: Algorithm level information"
								},
								{
									"value": "5",
									"label": "Level 5: Client identification for cache misses"
								}
							],
							"help": "Select the level of detail to be logged. Each level also includes the information from previous levels. The default is basic operational information (level 1)",
							"default": "1"
						}
					]
				},
				{
					"id": "access",
					"title": "Automatic entries",
					"advanced": true,
					"fields": [
						{
							"name": "disable_auto_added_access_control",
							"type": "switch",
							"label": "Disable auto-added access control",
							"text": "Disable the automatically-added access control entries",
							"help": "By default, IPv4 and IPv6 networks residing on internal interfaces of this system are permitted. Allowed networks must be manually configured on the Access Lists tab if the auto-added entries are disabled."
						},
						{
							"name": "disable_auto_added_host_entries",
							"type": "switch",
							"label": "Disable auto-added host entries",
							"text": "Disable the automatically-added host entries",
							"help": "By default, the primary IPv4 and IPv6 addresses of this firewall are added as records for the system domain of this firewall as configured in System > General Setup. This disables the auto generation of these entries."
						},
						{
							"name": "use_caps",
							"type": "switch",
							"label": "Experimental bit 0x20 support",
							"text": "Use 0x-20 encoded random bits in the DNS query to foil spoofing attempts.",
							"help": "See the implementation draft dns-0x20 for more information."
						}
					]
				},
				{
					"id": "dns64",
					"title": "DNS64",
					"fields": [
						{
							"name": "dns64_enable",
							"type": "switch",
							"label": "DNS64 support",
							"text": "Enable DNS64 (RFC 6147)",
							"help": "DNS64 is used with an IPv6/IPv4 translator to enable client-server communication between an IPv6-only client and an IPv4-only servers."
						},
						{
							"name": "allow_dns64_for_localhost",
							"type": "switch",
							"label": "DNS64 for localhost",
							"text": "Disable the automatically-added configuration that removes DNS64 answers from localhost queries."
						}
					]
				}
			],
			"resource": "services/dns_resolver_advanced"
		},
		dns_host_override: {
			"title": "Host override",
			"summary": "[{host}.]{domain} → {ip}",
			"summaryIcon": "server",
			"sections": [
				{
					"id": "host",
					"title": "Host override options",
					"description": "Lookups of this host return the given addresses; the usual lookup server for the domain is not queried for it.",
					"fields": [
						{
							"name": "host",
							"type": "text",
							"label": "Host",
							"mono": true,
							"width": "half",
							"help": "Name of the host, without the domain part, e.g. enter \"myhost\" if the full domain name is \"myhost.example.com\". Empty for the domain itself.",
							"errorMatch": [
								"hostname",
								"host/domain override combination"
							]
						},
						{
							"name": "domain",
							"type": "text",
							"label": "Domain",
							"mono": true,
							"required": true,
							"width": "half",
							"help": "Parent domain of the host, e.g. enter \"example.com\" for \"myhost.example.com\"."
						},
						{
							"name": "ip",
							"type": "text",
							"label": "IP address",
							"mono": true,
							"required": true,
							"placeholder": "192.168.100.100",
							"help": "IPv4 or IPv6 comma-separated addresses to be returned for the host, e.g. 192.168.100.100 or fd00:abcd:: or the list 192.168.1.3,192.168.4.5,fc00:123::3",
							"errorMatch": [
								"ip addresses"
							]
						},
						{
							"name": "descr",
							"type": "text",
							"label": "Description",
							"help": "A description may be entered here for administrative reference (not parsed)."
						}
					]
				},
				{
					"id": "aliases",
					"title": "Additional names for this host",
					"description": "If the host can be accessed using multiple names, then enter any other names for the host which should also be overridden.",
					"fields": [
						{
							"name": "aliases",
							"type": "entry-grid",
							"label": "Additional names",
							"min": 0,
							"addLabel": "Add host name",
							"emptyText": "No additional names.",
							"errorMatch": [
								"alias domain",
								"alias list",
								"alias hostname"
							],
							"fields": [
								{
									"name": "host",
									"type": "text",
									"label": "Host name",
									"mono": true,
									"width": "md"
								},
								{
									"name": "domain",
									"type": "text",
									"label": "Domain",
									"mono": true,
									"required": true,
									"width": "md"
								},
								{
									"name": "description",
									"type": "text",
									"label": "Description",
									"width": "lg"
								}
							]
						}
					]
				}
			],
			"resource": "services/dns_host_override"
		},
		dns_domain_override: {
			"title": "Domain override",
			"summary": "{domain} → {ip}",
			"summaryIcon": "sitemap",
			"sections": [
				{
					"id": "domain",
					"title": "Domain to override with a custom lookup server",
					"description": "The IP address is treated as the authoritative lookup server for the domain (including all of its subdomains); other lookup servers are not queried. For several servers, add an entry for each with the same domain.",
					"fields": [
						{
							"name": "domain",
							"type": "text",
							"label": "Domain",
							"mono": true,
							"required": true,
							"width": "half",
							"help": "Domain whose lookups will be directed to a user-specified DNS lookup server.",
							"errorMatch": [
								"after _msdcs"
							]
						},
						{
							"name": "ip",
							"type": "text",
							"label": "IP address",
							"mono": true,
							"required": true,
							"width": "half",
							"placeholder": "192.168.100.100",
							"pattern": "^[a-zA-Z0-9@.:]+$",
							"help": "IPv4 or IPv6 address of the authoritative DNS server for this domain, e.g. 192.168.100.100. To use a non-default port for communication, append an '@' with the port number."
						},
						{
							"name": "forward_tls_upstream",
							"type": "switch",
							"label": "TLS queries",
							"text": "Use SSL/TLS for DNS Queries forwarded to this server",
							"help": "When set, queries to all DNS servers for this domain will be sent using SSL/TLS on the default port of 853."
						},
						{
							"name": "tls_hostname",
							"type": "text",
							"label": "TLS hostname",
							"mono": true,
							"width": "half",
							"visibleWhen": {
								"field": "forward_tls_upstream",
								"truthy": true
							},
							"help": "An optional TLS hostname used to verify the server certificate when performing TLS Queries."
						},
						{
							"name": "descr",
							"type": "text",
							"label": "Description",
							"help": "A description may be entered here for administrative reference (not parsed)."
						}
					]
				}
			],
			"resource": "services/dns_domain_override"
		},
		dns_access_list: {
			"title": "Access list",
			"summary": "{aclaction} {aclname}",
			"summaryIcon": "list-check",
			"sections": [
				{
					"id": "acl",
					"title": "Access list",
					"fields": [
						{
							"name": "aclname",
							"type": "text",
							"label": "Access list name",
							"width": "half",
							"help": "Provide an Access List name."
						},
						{
							"name": "aclaction",
							"type": "select",
							"label": "Action",
							"required": true,
							"default": "allow",
							"width": "half",
							"options": [
								{
									"value": "allow",
									"label": "Allow"
								},
								{
									"value": "deny",
									"label": "Deny"
								},
								{
									"value": "refuse",
									"label": "Refuse"
								},
								{
									"value": "allow snoop",
									"label": "Allow Snoop"
								},
								{
									"value": "deny nonlocal",
									"label": "Deny Nonlocal"
								},
								{
									"value": "refuse nonlocal",
									"label": "Refuse Nonlocal"
								}
							],
							"help": "Deny drops queries from these networks; Refuse also answers REFUSED. Allow permits queries. Allow Snoop also permits non-recursive (cache snooping) queries, ideally only for the administrative host. Deny Nonlocal and Refuse Nonlocal permit only authoritative local-data queries, dropping or refusing the others."
						},
						{
							"name": "description",
							"type": "text",
							"label": "Description",
							"help": "A description may be entered here for administrative reference."
						}
					]
				},
				{
					"id": "networks",
					"title": "Networks",
					"fields": [
						{
							"name": "networks",
							"type": "entry-grid",
							"label": "Networks",
							"min": 0,
							"max": 50,
							"addLabel": "Add network",
							"emptyText": "No networks yet.",
							"errorMatch": [
								"valid ipv6 address must be entered"
							],
							"fields": [
								{
									"name": "acl_network",
									"type": "text",
									"label": "Network",
									"mono": true,
									"required": true,
									"width": "lg"
								},
								{
									"name": "mask",
									"type": "number",
									"label": "Prefix length",
									"min": 0,
									"max": 128,
									"required": true,
									"width": "xs"
								},
								{
									"name": "description",
									"type": "text",
									"label": "Description",
									"width": "lg"
								}
							]
						}
					]
				}
			],
			"resource": "services/dns_access_list"
		}
	};
	var GENERAL = {
		"port": "53",
		"tlsport": "",
		"sslcertref": "5f1c0a9b2d3e4",
		"system_domain_local_zone_type": "transparent",
		"python_order": "pre_validator",
		"python_script": "",
		"custom_options": "",
		"enable": true,
		"enablessl": false,
		"strictout": false,
		"dnssec": false,
		"python": false,
		"forwarding": false,
		"forward_tls_upstream": false,
		"regovpnclients": false,
		"active_interface": [
			"all"
		],
		"outgoing_interface": [
			"all"
		],
		"local_zone_type_choices": {
			"deny": "Deny",
			"refuse": "Refuse",
			"static": "Static",
			"transparent": "Transparent",
			"typetransparent": "Type Transparent",
			"redirect": "Redirect",
			"inform": "Inform",
			"inform_deny": "Inform Deny",
			"nodefault": "No Default"
		},
		"python_script_choices": [],
		"sslcertref_choices": {
			"5f1c0a9b2d3e4": "GUI default (5f1c0a9b2d3e4)",
			"5f1c0a9b2d3e5": "dns.home.arpa"
		},
		"pending": false
	};
	var ADVANCED = {
		"sock_queue_timeout": "0",
		"cache_max_ttl": "86400",
		"cache_min_ttl": "0",
		"dns64_prefix": "",
		"msgcachesize": "4",
		"outgoing_num_tcp": "10",
		"incoming_num_tcp": "10",
		"edns_buffer_size": "auto",
		"num_queries_per_thread": "512",
		"jostle_timeout": "200",
		"infra_host_ttl": "900",
		"infra_cache_numhosts": "10000",
		"unwanted_reply_threshold": "disabled",
		"log_verbosity": "1",
		"hideidentity": false,
		"hideversion": false,
		"qname-minimisation": false,
		"qname-minimisation-strict": false,
		"prefetch": false,
		"prefetchkey": false,
		"dnssecstripped": false,
		"dnsrecordcache": false,
		"aggressivensec": false,
		"infra_keep_probing": true,
		"disable_auto_added_access_control": false,
		"disable_auto_added_host_entries": false,
		"use_caps": false,
		"dns64_enable": false,
		"allow_dns64_for_localhost": false,
		"choices": {
			"msgcachesize": [
				"4",
				"10",
				"20",
				"50",
				"100",
				"250",
				"512"
			],
			"outgoing_num_tcp": [
				"0",
				"10",
				"20",
				"30",
				"40",
				"50"
			],
			"incoming_num_tcp": [
				"0",
				"10",
				"20",
				"30",
				"40",
				"50"
			],
			"edns_buffer_size": [
				"auto",
				"512",
				"1220",
				"1232",
				"1432",
				"1480",
				"4096"
			],
			"num_queries_per_thread": [
				"512",
				"1024",
				"2048"
			],
			"jostle_timeout": [
				"100",
				"200",
				"500",
				"1000"
			],
			"infra_host_ttl": [
				"60",
				"120",
				"300",
				"600",
				"900"
			],
			"infra_cache_numhosts": [
				"1000",
				"5000",
				"10000",
				"20000",
				"50000",
				"100000",
				"200000"
			],
			"unwanted_reply_threshold": [
				"disabled",
				"5000000",
				"10000000",
				"20000000",
				"40000000",
				"50000000"
			],
			"log_verbosity": [
				"0",
				"1",
				"2",
				"3",
				"4",
				"5"
			]
		},
		"pending": false
	};
	var pending = false;

	function ifaceOptions() {
		var o = [{ value: 'all', label: 'All' }];
		M.interfaces.forEach(function (i) { o.push({ value: i.id, label: i.descr }); });
		return o.concat([{ value: 'lo0', label: 'Localhost' }]);
	}
	function schema(name) {
		var s = clone(SCHEMAS[name]);
		s.sections.forEach(function (sec) { sec.fields.forEach(function (f) {
			if (f.name === 'active_interface' || f.name === 'outgoing_interface') f.options = ifaceOptions();
		}); });
		return s;
	}
	function settings(path, obj, check) {
		M.route('GET', path, function () { return M.ok(clone(obj)); });
		M.route('PUT', path, function (p, q, b) {
			var n = Object.assign(clone(obj), b || {});
			var e = check ? check(n) : null;
			if (e) return M.err(422, INVALID, e);
			Object.keys(b || {}).forEach(function (k) { if (!/_choices$/.test(k)) obj[k] = b[k]; });
			pending = true;
			return M.ok(clone(obj));
		});
	}
	settings('/api/v1/services/dns-resolver', GENERAL, function (n) {
		var e = {};
		if (n.port !== '' && !(+n.port >= 1 && +n.port <= 65535)) e.port = 'A valid port number must be specified.';
		if (n.enablessl && n.tlsport !== '' && !(+n.tlsport >= 1 && +n.tlsport <= 65535)) e.tlsport = 'A valid SSL/TLS port number must be specified.';
		if (!n.active_interface || !n.active_interface.length) e.active_interface = 'One or more Network Interfaces must be selected for binding.';
		if (!n.outgoing_interface || !n.outgoing_interface.length) e.outgoing_interface = 'One or more Outgoing Network Interfaces must be selected.';
		return Object.keys(e).length ? e : null;
	});
	settings('/api/v1/services/dns-resolver/advanced', ADVANCED, function (n) {
		var e = {};
		if (!(+n.cache_max_ttl >= 0)) e.cache_max_ttl = 'Maximum TTL for RRsets and Messages must be a positive integer.';
		if (!(+n.cache_min_ttl >= 0)) e.cache_min_ttl = 'Minimum TTL for RRsets and Messages must be a positive integer.';
		return Object.keys(e).length ? e : null;
	});

	/* ---------------------------------------------------------------- lists */

	var LISTS = {
		'host-overrides': {
			schema: 'dns_host_override',
			items: [
				{ host: 'nas', domain: 'home.arpa', ip: '192.168.1.10,fd00:1::10', descr: 'Storage', aliases: [{ host: 'files', domain: 'home.arpa', description: 'SMB shares' }] },
				{ host: 'printer', domain: 'home.arpa', ip: '192.168.1.30', descr: 'Office printer', aliases: [] },
				{ host: 'web01', domain: 'dmz.home.arpa', ip: '172.16.40.10', descr: 'Web server', aliases: [{ host: 'www', domain: 'example.com', description: 'Public name, answered locally' }] }
			],
			display: function (x) {
				var fq = function (h, d) { return (h ? h + '.' : '') + d; };
				return { host: fq(x.host, x.domain), addresses: String(x.ip || '').split(',').filter(Boolean), aliases: (x.aliases || []).map(function (a) { return fq(a.host, a.domain); }), description: x.descr || '' };
			},
			check: function (x) {
				var e = {};
				if (x.host && !HOSTNAME.test(x.host)) e.host = 'The hostname can only contain the characters A-Z, 0-9 and \'-\'. It may not start or end with \'-\'.';
				if (!DOMAIN.test(x.domain || '')) e.domain = 'A valid domain must be specified.';
				var ips = String(x.ip || '').split(',').filter(Boolean);
				if (!ips.length || ips.some(function (i) { return !isIp(i.trim()); })) e.ip = 'A valid IP address must be specified, separated by commas.';
				(x.aliases || []).forEach(function (a, i) { if (!DOMAIN.test(a.domain || '')) e['aliases.' + i + '.domain'] = 'A valid domain must be specified in alias list.'; });
				return e;
			},
			sortKey: function (x) { return x.host + '.' + x.domain; }
		},
		'domain-overrides': {
			schema: 'dns_domain_override',
			items: [
				{ domain: 'corp.example', ip: '10.20.0.53', forward_tls_upstream: false, tls_hostname: '', descr: 'Company DNS over the VPN' },
				{ domain: '168.192.in-addr.arpa', ip: '192.168.1.53@5353', forward_tls_upstream: false, tls_hostname: '', descr: 'Reverse lookups' }
			],
			display: function (x) { return { domain: x.domain, server: x.ip, tls: !!x.forward_tls_upstream, description: x.descr || '' }; },
			check: function (x) {
				var e = {};
				if (!DOMAIN.test(x.domain || '')) e.domain = 'A valid domain must be specified.';
				var ip = String(x.ip || '').split('@')[0];
				if (!isIp(ip)) e.ip = 'A valid IP address must be specified.';
				return e;
			},
			sortKey: function (x) { return x.domain; }
		},
		'access-lists': {
			schema: 'dns_access_list',
			items: [
				{ aclname: 'Home networks', aclaction: 'allow', description: 'LAN and Wi-Fi', networks: [{ acl_network: '192.168.1.0', mask: '24', description: 'LAN' }, { acl_network: '192.168.20.0', mask: '24', description: 'Wi-Fi' }] },
				{ aclname: 'Guests', aclaction: 'allow', description: '', networks: [{ acl_network: '192.168.30.0', mask: '24', description: '' }] },
				{ aclname: 'Old lab', aclaction: 'refuse', description: 'Decommissioned', networks: [{ acl_network: '10.50.0.0', mask: '16', description: '' }] }
			],
			display: function (x) {
				var labels = { allow: 'Allow', 'allow snoop': 'Allow Snoop', deny: 'Deny', refuse: 'Refuse', 'deny nonlocal': 'Deny Nonlocal', 'refuse nonlocal': 'Refuse Nonlocal' };
				return { name: x.aclname, action: labels[x.aclaction] || x.aclaction, networks: (x.networks || []).map(function (n) { return n.acl_network + '/' + n.mask; }), description: x.description || '' };
			},
			check: function (x) {
				var e = {};
				if (!x.aclname) e.aclname = 'The field Access List name is required.';
				if (!(x.networks || []).length) e.networks = 'The field Networks is required.';
				(x.networks || []).forEach(function (n, i) {
					if (!isIp(n.acl_network || '')) e['networks.' + i + '.acl_network'] = 'The network IP address entered is not valid.';
					if (!(+n.mask >= 0 && +n.mask <= 128)) e['networks.' + i + '.mask'] = 'The network mask entered is not valid.';
				});
				return e;
			}
		}
	};

	Object.keys(LISTS).forEach(function (kind) {
		var L = LISTS[kind], base = '/api/v1/services/dns-resolver/' + kind;
		function out(i) { var x = L.items[i]; return Object.assign({ id: i }, clone(x), { fields: clone(x), display: L.display(x) }); }
		function save(x) {
			L.items.push(x);
			if (L.sortKey) L.items.sort(function (a, b) { return L.sortKey(a).localeCompare(L.sortKey(b)); });
			pending = true;
			return L.items.indexOf(x);
		}
		M.route('GET', '/api/v1/schema/services/' + L.schema, function () { return M.ok(schema(L.schema)); });
		M.route('GET', base, function () { return M.ok(L.items.map(function (x, i) { return out(i); })); });
		M.route('GET', base + '/{id}', function (p) { return L.items[+p.id] ? M.ok(out(+p.id)) : M.err(404, 'Not found.'); });
		M.route('POST', base, function (p, q, b) {
			var x = clone(b || {});
			var e = L.check(x);
			if (Object.keys(e).length) return M.err(422, INVALID, e);
			return Object.assign(M.ok(out(save(x))), { status: 201 });
		});
		M.route('PUT', base + '/{id}', function (p, q, b) {
			var id = +p.id;
			if (!L.items[id]) return M.err(404, 'Not found.');
			var x = Object.assign(clone(L.items[id]), b || {});
			['id', 'fields', 'display', 'pending', 'apply'].forEach(function (k) { delete x[k]; });
			var e = L.check(x);
			if (Object.keys(e).length) return M.err(422, INVALID, e);
			L.items.splice(id, 1);
			return M.ok(out(save(x)));
		});
		M.route('DELETE', base + '/{id}', function (p) {
			if (!L.items[+p.id]) return M.err(404, 'Not found.');
			L.items.splice(+p.id, 1);
			pending = true;
			return M.ok({ deleted: +p.id });
		});
	});

	['dns_resolver', 'dns_resolver_advanced'].forEach(function (n) {
		M.route('GET', '/api/v1/schema/services/' + n, function () { return M.ok(schema(n)); });
	});
	M.route('GET', '/api/v1/services/dns-resolver/pending', function () { return M.ok({ pending: pending }); });
	M.route('POST', '/api/v1/services/dns-resolver/apply', function () {
		pending = false;
		return Object.assign(M.ok({ applied: true, pending: false }), { delay: 800 });
	});
})(window.FSMock);
