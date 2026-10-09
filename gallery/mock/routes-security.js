/*
 * routes-security.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Mock schedules and virtual IPs, as the API serves them (freesense restapi/routes_firewall.inc):
 *   GET    /api/v1/schema/firewall/schedules     editor schema (captured from a firewall)
 *   GET    /api/v1/firewall/schedules            [{name, description, ranges, descr, timerange, fields, display}]
 *   GET    /api/v1/firewall/schedules/{name}     one schedule
 *   POST   /api/v1/firewall/schedules            create ({name, descr, ranges: [{weekdays, dates, start, stop, description}]}); 422 with the API's messages
 *   PUT    /api/v1/firewall/schedules/{name}     partial update (a schedule a rule uses cannot be renamed)
 *   DELETE /api/v1/firewall/schedules/{name}     409 in_use while a rule uses it
 *   GET    /api/v1/schema/firewall/virtual_ips   editor schema (captured; interface choices from the mock)
 *   GET    /api/v1/firewall/virtual-ips          [{id, mode, interface, subnet, subnet_bits, …, fields, display}] (never the CARP password)
 *   GET    /api/v1/firewall/virtual-ips/{id}     one virtual IP
 *   POST   /api/v1/firewall/virtual-ips          create from form fields; 422
 *   PUT    /api/v1/firewall/virtual-ips/{id}     partial update; an empty password keeps the stored one
 *   DELETE /api/v1/firewall/virtual-ips/{id}     delete
 *   POST   /api/v1/firewall/virtual-ips/apply    apply
 * Virtual IP writes mark "virtual_ips" pending.
 */
(function (M) {
	'use strict';

	var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
	var INVALID = 'The request failed validation.';
	var V4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
	var SCHEDULE_SCHEMA = {
		"title": "Schedule",
		"summary": "Schedule {name}[ with {ranges}]",
		"summaryIcon": "calendar-days",
		"sections": [
			{
				"id": "general",
				"title": "Schedule",
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
						"help": "Rules select the schedule by this name. While a rule uses the schedule, the name cannot be changed.",
						"errorMatch": [
							"schedule name"
						]
					},
					{
						"name": "descr",
						"type": "text",
						"label": "Description",
						"width": "half",
						"help": "For your reference (not parsed)."
					}
				]
			},
			{
				"id": "ranges",
				"title": "Time ranges",
				"description": "Rules with this schedule apply during any of these ranges. Choose weekdays for a weekly range, or enter dates (month-day, every year) for specific days.",
				"fields": [
					{
						"name": "ranges",
						"type": "entry-grid",
						"label": "Time ranges",
						"min": 1,
						"max": 99,
						"addLabel": "Add time range",
						"emptyText": "No time ranges yet.",
						"errorMatch": [
							"time range",
							"start time",
							"stop time",
							"schedule specification"
						],
						"fields": [
							{
								"name": "weekdays",
								"type": "checklist",
								"label": "Weekdays",
								"inline": true,
								"width": "lg",
								"options": [
									{
										"value": "1",
										"label": "Mon"
									},
									{
										"value": "2",
										"label": "Tue"
									},
									{
										"value": "3",
										"label": "Wed"
									},
									{
										"value": "4",
										"label": "Thu"
									},
									{
										"value": "5",
										"label": "Fri"
									},
									{
										"value": "6",
										"label": "Sat"
									},
									{
										"value": "7",
										"label": "Sun"
									}
								]
							},
							{
								"name": "dates",
								"type": "text",
								"label": "Dates",
								"mono": true,
								"width": "md",
								"placeholder": "12-24, 12-25"
							},
							{
								"name": "start",
								"type": "datetime",
								"mode": "time",
								"label": "Start",
								"required": true,
								"width": "sm"
							},
							{
								"name": "stop",
								"type": "datetime",
								"mode": "time",
								"label": "Stop",
								"required": true,
								"width": "sm"
							},
							{
								"name": "description",
								"type": "text",
								"label": "Description",
								"width": "md"
							}
						]
					}
				]
			}
		],
		"resource": "firewall/schedules"
	};
	var VIP_SCHEMA = {
		"title": "Virtual IP",
		"summary": "{mode} address {subnet}[/{subnet_bits}] on {interface}",
		"summaryIcon": "network-wired",
		"sections": [
			{
				"id": "general",
				"title": "Virtual IP",
				"fields": [
					{
						"name": "mode",
						"type": "segmented",
						"label": "Type",
						"required": true,
						"default": "ipalias",
						"options": [
							{
								"value": "ipalias",
								"label": "IP Alias"
							},
							{
								"value": "carp",
								"label": "CARP"
							},
							{
								"value": "proxyarp",
								"label": "Proxy ARP"
							},
							{
								"value": "other",
								"label": "Other"
							}
						],
						"help": "Only IP Alias and CARP addresses can be used by services on the firewall (IPsec, OpenVPN, ...). Proxy ARP and Other addresses are for NAT.",
						"errorMatch": [
							"must stay an ip alias or carp address"
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
							},
							{
								"value": "lo0",
								"label": "Localhost"
							}
						],
						"help": "A CARP address can be the parent of IP Alias addresses only.",
						"errorMatch": [
							"interface chosen",
							"localhost is not allowed",
							"carp parent",
							"carp parent interface"
						]
					},
					{
						"name": "descr",
						"type": "text",
						"label": "Description",
						"width": "half",
						"help": "For your reference (not parsed)."
					}
				]
			},
			{
				"id": "address",
				"title": "Address",
				"fields": [
					{
						"name": "type",
						"type": "select",
						"label": "Address type",
						"width": "third",
						"default": "single",
						"options": [
							{
								"value": "single",
								"label": "Single address"
							},
							{
								"value": "network",
								"label": "Network"
							}
						],
						"visibleWhen": {
							"field": "mode",
							"in": [
								"proxyarp",
								"other"
							]
						},
						"help": "IP Alias and CARP addresses are always single addresses."
					},
					{
						"name": "subnet",
						"type": "text",
						"label": "Address",
						"required": true,
						"mono": true,
						"width": "third",
						"placeholder": "192.0.2.10",
						"help": "IP Alias and CARP: the prefix length is that of the network, not a range. Proxy ARP and Other: an address or the start of a CIDR block.",
						"errorMatch": [
							"ip address",
							"is being used by another interface",
							"network address",
							"broadcast address",
							"only ipv4 addresses"
						]
					},
					{
						"name": "subnet_bits",
						"type": "number",
						"label": "Prefix length",
						"min": 1,
						"max": 128,
						"width": "third",
						"default": 32,
						"visibleWhen": {
							"any": [
								{
									"field": "mode",
									"in": [
										"ipalias",
										"carp"
									]
								},
								[
									{
										"field": "mode",
										"in": [
											"proxyarp",
											"other"
										]
									},
									{
										"field": "type",
										"equals": "network"
									}
								]
							]
						}
					},
					{
						"name": "noexpand",
						"type": "switch",
						"label": "Expansion",
						"text": "Do not expand this network into single addresses in NAT lists",
						"visibleWhen": [
							{
								"field": "mode",
								"in": [
									"proxyarp",
									"other"
								]
							},
							{
								"field": "type",
								"equals": "network"
							}
						]
					}
				]
			},
			{
				"id": "carp",
				"title": "CARP",
				"visibleWhen": {
					"field": "mode",
					"equals": "carp"
				},
				"description": "Members of a high availability cluster share the address through a VHID group.",
				"fields": [
					{
						"name": "vhid",
						"type": "select",
						"label": "VHID group",
						"required": true,
						"width": "third",
						"default": "1",
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
							},
							{
								"value": "31",
								"label": "31"
							},
							{
								"value": "32",
								"label": "32"
							},
							{
								"value": "33",
								"label": "33"
							},
							{
								"value": "34",
								"label": "34"
							},
							{
								"value": "35",
								"label": "35"
							},
							{
								"value": "36",
								"label": "36"
							},
							{
								"value": "37",
								"label": "37"
							},
							{
								"value": "38",
								"label": "38"
							},
							{
								"value": "39",
								"label": "39"
							},
							{
								"value": "40",
								"label": "40"
							},
							{
								"value": "41",
								"label": "41"
							},
							{
								"value": "42",
								"label": "42"
							},
							{
								"value": "43",
								"label": "43"
							},
							{
								"value": "44",
								"label": "44"
							},
							{
								"value": "45",
								"label": "45"
							},
							{
								"value": "46",
								"label": "46"
							},
							{
								"value": "47",
								"label": "47"
							},
							{
								"value": "48",
								"label": "48"
							},
							{
								"value": "49",
								"label": "49"
							},
							{
								"value": "50",
								"label": "50"
							},
							{
								"value": "51",
								"label": "51"
							},
							{
								"value": "52",
								"label": "52"
							},
							{
								"value": "53",
								"label": "53"
							},
							{
								"value": "54",
								"label": "54"
							},
							{
								"value": "55",
								"label": "55"
							},
							{
								"value": "56",
								"label": "56"
							},
							{
								"value": "57",
								"label": "57"
							},
							{
								"value": "58",
								"label": "58"
							},
							{
								"value": "59",
								"label": "59"
							},
							{
								"value": "60",
								"label": "60"
							},
							{
								"value": "61",
								"label": "61"
							},
							{
								"value": "62",
								"label": "62"
							},
							{
								"value": "63",
								"label": "63"
							},
							{
								"value": "64",
								"label": "64"
							},
							{
								"value": "65",
								"label": "65"
							},
							{
								"value": "66",
								"label": "66"
							},
							{
								"value": "67",
								"label": "67"
							},
							{
								"value": "68",
								"label": "68"
							},
							{
								"value": "69",
								"label": "69"
							},
							{
								"value": "70",
								"label": "70"
							},
							{
								"value": "71",
								"label": "71"
							},
							{
								"value": "72",
								"label": "72"
							},
							{
								"value": "73",
								"label": "73"
							},
							{
								"value": "74",
								"label": "74"
							},
							{
								"value": "75",
								"label": "75"
							},
							{
								"value": "76",
								"label": "76"
							},
							{
								"value": "77",
								"label": "77"
							},
							{
								"value": "78",
								"label": "78"
							},
							{
								"value": "79",
								"label": "79"
							},
							{
								"value": "80",
								"label": "80"
							},
							{
								"value": "81",
								"label": "81"
							},
							{
								"value": "82",
								"label": "82"
							},
							{
								"value": "83",
								"label": "83"
							},
							{
								"value": "84",
								"label": "84"
							},
							{
								"value": "85",
								"label": "85"
							},
							{
								"value": "86",
								"label": "86"
							},
							{
								"value": "87",
								"label": "87"
							},
							{
								"value": "88",
								"label": "88"
							},
							{
								"value": "89",
								"label": "89"
							},
							{
								"value": "90",
								"label": "90"
							},
							{
								"value": "91",
								"label": "91"
							},
							{
								"value": "92",
								"label": "92"
							},
							{
								"value": "93",
								"label": "93"
							},
							{
								"value": "94",
								"label": "94"
							},
							{
								"value": "95",
								"label": "95"
							},
							{
								"value": "96",
								"label": "96"
							},
							{
								"value": "97",
								"label": "97"
							},
							{
								"value": "98",
								"label": "98"
							},
							{
								"value": "99",
								"label": "99"
							},
							{
								"value": "100",
								"label": "100"
							},
							{
								"value": "101",
								"label": "101"
							},
							{
								"value": "102",
								"label": "102"
							},
							{
								"value": "103",
								"label": "103"
							},
							{
								"value": "104",
								"label": "104"
							},
							{
								"value": "105",
								"label": "105"
							},
							{
								"value": "106",
								"label": "106"
							},
							{
								"value": "107",
								"label": "107"
							},
							{
								"value": "108",
								"label": "108"
							},
							{
								"value": "109",
								"label": "109"
							},
							{
								"value": "110",
								"label": "110"
							},
							{
								"value": "111",
								"label": "111"
							},
							{
								"value": "112",
								"label": "112"
							},
							{
								"value": "113",
								"label": "113"
							},
							{
								"value": "114",
								"label": "114"
							},
							{
								"value": "115",
								"label": "115"
							},
							{
								"value": "116",
								"label": "116"
							},
							{
								"value": "117",
								"label": "117"
							},
							{
								"value": "118",
								"label": "118"
							},
							{
								"value": "119",
								"label": "119"
							},
							{
								"value": "120",
								"label": "120"
							},
							{
								"value": "121",
								"label": "121"
							},
							{
								"value": "122",
								"label": "122"
							},
							{
								"value": "123",
								"label": "123"
							},
							{
								"value": "124",
								"label": "124"
							},
							{
								"value": "125",
								"label": "125"
							},
							{
								"value": "126",
								"label": "126"
							},
							{
								"value": "127",
								"label": "127"
							},
							{
								"value": "128",
								"label": "128"
							},
							{
								"value": "129",
								"label": "129"
							},
							{
								"value": "130",
								"label": "130"
							},
							{
								"value": "131",
								"label": "131"
							},
							{
								"value": "132",
								"label": "132"
							},
							{
								"value": "133",
								"label": "133"
							},
							{
								"value": "134",
								"label": "134"
							},
							{
								"value": "135",
								"label": "135"
							},
							{
								"value": "136",
								"label": "136"
							},
							{
								"value": "137",
								"label": "137"
							},
							{
								"value": "138",
								"label": "138"
							},
							{
								"value": "139",
								"label": "139"
							},
							{
								"value": "140",
								"label": "140"
							},
							{
								"value": "141",
								"label": "141"
							},
							{
								"value": "142",
								"label": "142"
							},
							{
								"value": "143",
								"label": "143"
							},
							{
								"value": "144",
								"label": "144"
							},
							{
								"value": "145",
								"label": "145"
							},
							{
								"value": "146",
								"label": "146"
							},
							{
								"value": "147",
								"label": "147"
							},
							{
								"value": "148",
								"label": "148"
							},
							{
								"value": "149",
								"label": "149"
							},
							{
								"value": "150",
								"label": "150"
							},
							{
								"value": "151",
								"label": "151"
							},
							{
								"value": "152",
								"label": "152"
							},
							{
								"value": "153",
								"label": "153"
							},
							{
								"value": "154",
								"label": "154"
							},
							{
								"value": "155",
								"label": "155"
							},
							{
								"value": "156",
								"label": "156"
							},
							{
								"value": "157",
								"label": "157"
							},
							{
								"value": "158",
								"label": "158"
							},
							{
								"value": "159",
								"label": "159"
							},
							{
								"value": "160",
								"label": "160"
							},
							{
								"value": "161",
								"label": "161"
							},
							{
								"value": "162",
								"label": "162"
							},
							{
								"value": "163",
								"label": "163"
							},
							{
								"value": "164",
								"label": "164"
							},
							{
								"value": "165",
								"label": "165"
							},
							{
								"value": "166",
								"label": "166"
							},
							{
								"value": "167",
								"label": "167"
							},
							{
								"value": "168",
								"label": "168"
							},
							{
								"value": "169",
								"label": "169"
							},
							{
								"value": "170",
								"label": "170"
							},
							{
								"value": "171",
								"label": "171"
							},
							{
								"value": "172",
								"label": "172"
							},
							{
								"value": "173",
								"label": "173"
							},
							{
								"value": "174",
								"label": "174"
							},
							{
								"value": "175",
								"label": "175"
							},
							{
								"value": "176",
								"label": "176"
							},
							{
								"value": "177",
								"label": "177"
							},
							{
								"value": "178",
								"label": "178"
							},
							{
								"value": "179",
								"label": "179"
							},
							{
								"value": "180",
								"label": "180"
							},
							{
								"value": "181",
								"label": "181"
							},
							{
								"value": "182",
								"label": "182"
							},
							{
								"value": "183",
								"label": "183"
							},
							{
								"value": "184",
								"label": "184"
							},
							{
								"value": "185",
								"label": "185"
							},
							{
								"value": "186",
								"label": "186"
							},
							{
								"value": "187",
								"label": "187"
							},
							{
								"value": "188",
								"label": "188"
							},
							{
								"value": "189",
								"label": "189"
							},
							{
								"value": "190",
								"label": "190"
							},
							{
								"value": "191",
								"label": "191"
							},
							{
								"value": "192",
								"label": "192"
							},
							{
								"value": "193",
								"label": "193"
							},
							{
								"value": "194",
								"label": "194"
							},
							{
								"value": "195",
								"label": "195"
							},
							{
								"value": "196",
								"label": "196"
							},
							{
								"value": "197",
								"label": "197"
							},
							{
								"value": "198",
								"label": "198"
							},
							{
								"value": "199",
								"label": "199"
							},
							{
								"value": "200",
								"label": "200"
							},
							{
								"value": "201",
								"label": "201"
							},
							{
								"value": "202",
								"label": "202"
							},
							{
								"value": "203",
								"label": "203"
							},
							{
								"value": "204",
								"label": "204"
							},
							{
								"value": "205",
								"label": "205"
							},
							{
								"value": "206",
								"label": "206"
							},
							{
								"value": "207",
								"label": "207"
							},
							{
								"value": "208",
								"label": "208"
							},
							{
								"value": "209",
								"label": "209"
							},
							{
								"value": "210",
								"label": "210"
							},
							{
								"value": "211",
								"label": "211"
							},
							{
								"value": "212",
								"label": "212"
							},
							{
								"value": "213",
								"label": "213"
							},
							{
								"value": "214",
								"label": "214"
							},
							{
								"value": "215",
								"label": "215"
							},
							{
								"value": "216",
								"label": "216"
							},
							{
								"value": "217",
								"label": "217"
							},
							{
								"value": "218",
								"label": "218"
							},
							{
								"value": "219",
								"label": "219"
							},
							{
								"value": "220",
								"label": "220"
							},
							{
								"value": "221",
								"label": "221"
							},
							{
								"value": "222",
								"label": "222"
							},
							{
								"value": "223",
								"label": "223"
							},
							{
								"value": "224",
								"label": "224"
							},
							{
								"value": "225",
								"label": "225"
							},
							{
								"value": "226",
								"label": "226"
							},
							{
								"value": "227",
								"label": "227"
							},
							{
								"value": "228",
								"label": "228"
							},
							{
								"value": "229",
								"label": "229"
							},
							{
								"value": "230",
								"label": "230"
							},
							{
								"value": "231",
								"label": "231"
							},
							{
								"value": "232",
								"label": "232"
							},
							{
								"value": "233",
								"label": "233"
							},
							{
								"value": "234",
								"label": "234"
							},
							{
								"value": "235",
								"label": "235"
							},
							{
								"value": "236",
								"label": "236"
							},
							{
								"value": "237",
								"label": "237"
							},
							{
								"value": "238",
								"label": "238"
							},
							{
								"value": "239",
								"label": "239"
							},
							{
								"value": "240",
								"label": "240"
							},
							{
								"value": "241",
								"label": "241"
							},
							{
								"value": "242",
								"label": "242"
							},
							{
								"value": "243",
								"label": "243"
							},
							{
								"value": "244",
								"label": "244"
							},
							{
								"value": "245",
								"label": "245"
							},
							{
								"value": "246",
								"label": "246"
							},
							{
								"value": "247",
								"label": "247"
							},
							{
								"value": "248",
								"label": "248"
							},
							{
								"value": "249",
								"label": "249"
							},
							{
								"value": "250",
								"label": "250"
							},
							{
								"value": "251",
								"label": "251"
							},
							{
								"value": "252",
								"label": "252"
							},
							{
								"value": "253",
								"label": "253"
							},
							{
								"value": "254",
								"label": "254"
							},
							{
								"value": "255",
								"label": "255"
							}
						],
						"visibleWhen": {
							"field": "mode",
							"equals": "carp"
						},
						"help": "The VHID group the cluster members share.",
						"errorMatch": [
							"is already in use on interface"
						]
					},
					{
						"name": "advbase",
						"type": "select",
						"label": "Advertising base",
						"required": true,
						"width": "third",
						"default": "1",
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
							},
							{
								"value": "31",
								"label": "31"
							},
							{
								"value": "32",
								"label": "32"
							},
							{
								"value": "33",
								"label": "33"
							},
							{
								"value": "34",
								"label": "34"
							},
							{
								"value": "35",
								"label": "35"
							},
							{
								"value": "36",
								"label": "36"
							},
							{
								"value": "37",
								"label": "37"
							},
							{
								"value": "38",
								"label": "38"
							},
							{
								"value": "39",
								"label": "39"
							},
							{
								"value": "40",
								"label": "40"
							},
							{
								"value": "41",
								"label": "41"
							},
							{
								"value": "42",
								"label": "42"
							},
							{
								"value": "43",
								"label": "43"
							},
							{
								"value": "44",
								"label": "44"
							},
							{
								"value": "45",
								"label": "45"
							},
							{
								"value": "46",
								"label": "46"
							},
							{
								"value": "47",
								"label": "47"
							},
							{
								"value": "48",
								"label": "48"
							},
							{
								"value": "49",
								"label": "49"
							},
							{
								"value": "50",
								"label": "50"
							},
							{
								"value": "51",
								"label": "51"
							},
							{
								"value": "52",
								"label": "52"
							},
							{
								"value": "53",
								"label": "53"
							},
							{
								"value": "54",
								"label": "54"
							},
							{
								"value": "55",
								"label": "55"
							},
							{
								"value": "56",
								"label": "56"
							},
							{
								"value": "57",
								"label": "57"
							},
							{
								"value": "58",
								"label": "58"
							},
							{
								"value": "59",
								"label": "59"
							},
							{
								"value": "60",
								"label": "60"
							},
							{
								"value": "61",
								"label": "61"
							},
							{
								"value": "62",
								"label": "62"
							},
							{
								"value": "63",
								"label": "63"
							},
							{
								"value": "64",
								"label": "64"
							},
							{
								"value": "65",
								"label": "65"
							},
							{
								"value": "66",
								"label": "66"
							},
							{
								"value": "67",
								"label": "67"
							},
							{
								"value": "68",
								"label": "68"
							},
							{
								"value": "69",
								"label": "69"
							},
							{
								"value": "70",
								"label": "70"
							},
							{
								"value": "71",
								"label": "71"
							},
							{
								"value": "72",
								"label": "72"
							},
							{
								"value": "73",
								"label": "73"
							},
							{
								"value": "74",
								"label": "74"
							},
							{
								"value": "75",
								"label": "75"
							},
							{
								"value": "76",
								"label": "76"
							},
							{
								"value": "77",
								"label": "77"
							},
							{
								"value": "78",
								"label": "78"
							},
							{
								"value": "79",
								"label": "79"
							},
							{
								"value": "80",
								"label": "80"
							},
							{
								"value": "81",
								"label": "81"
							},
							{
								"value": "82",
								"label": "82"
							},
							{
								"value": "83",
								"label": "83"
							},
							{
								"value": "84",
								"label": "84"
							},
							{
								"value": "85",
								"label": "85"
							},
							{
								"value": "86",
								"label": "86"
							},
							{
								"value": "87",
								"label": "87"
							},
							{
								"value": "88",
								"label": "88"
							},
							{
								"value": "89",
								"label": "89"
							},
							{
								"value": "90",
								"label": "90"
							},
							{
								"value": "91",
								"label": "91"
							},
							{
								"value": "92",
								"label": "92"
							},
							{
								"value": "93",
								"label": "93"
							},
							{
								"value": "94",
								"label": "94"
							},
							{
								"value": "95",
								"label": "95"
							},
							{
								"value": "96",
								"label": "96"
							},
							{
								"value": "97",
								"label": "97"
							},
							{
								"value": "98",
								"label": "98"
							},
							{
								"value": "99",
								"label": "99"
							},
							{
								"value": "100",
								"label": "100"
							},
							{
								"value": "101",
								"label": "101"
							},
							{
								"value": "102",
								"label": "102"
							},
							{
								"value": "103",
								"label": "103"
							},
							{
								"value": "104",
								"label": "104"
							},
							{
								"value": "105",
								"label": "105"
							},
							{
								"value": "106",
								"label": "106"
							},
							{
								"value": "107",
								"label": "107"
							},
							{
								"value": "108",
								"label": "108"
							},
							{
								"value": "109",
								"label": "109"
							},
							{
								"value": "110",
								"label": "110"
							},
							{
								"value": "111",
								"label": "111"
							},
							{
								"value": "112",
								"label": "112"
							},
							{
								"value": "113",
								"label": "113"
							},
							{
								"value": "114",
								"label": "114"
							},
							{
								"value": "115",
								"label": "115"
							},
							{
								"value": "116",
								"label": "116"
							},
							{
								"value": "117",
								"label": "117"
							},
							{
								"value": "118",
								"label": "118"
							},
							{
								"value": "119",
								"label": "119"
							},
							{
								"value": "120",
								"label": "120"
							},
							{
								"value": "121",
								"label": "121"
							},
							{
								"value": "122",
								"label": "122"
							},
							{
								"value": "123",
								"label": "123"
							},
							{
								"value": "124",
								"label": "124"
							},
							{
								"value": "125",
								"label": "125"
							},
							{
								"value": "126",
								"label": "126"
							},
							{
								"value": "127",
								"label": "127"
							},
							{
								"value": "128",
								"label": "128"
							},
							{
								"value": "129",
								"label": "129"
							},
							{
								"value": "130",
								"label": "130"
							},
							{
								"value": "131",
								"label": "131"
							},
							{
								"value": "132",
								"label": "132"
							},
							{
								"value": "133",
								"label": "133"
							},
							{
								"value": "134",
								"label": "134"
							},
							{
								"value": "135",
								"label": "135"
							},
							{
								"value": "136",
								"label": "136"
							},
							{
								"value": "137",
								"label": "137"
							},
							{
								"value": "138",
								"label": "138"
							},
							{
								"value": "139",
								"label": "139"
							},
							{
								"value": "140",
								"label": "140"
							},
							{
								"value": "141",
								"label": "141"
							},
							{
								"value": "142",
								"label": "142"
							},
							{
								"value": "143",
								"label": "143"
							},
							{
								"value": "144",
								"label": "144"
							},
							{
								"value": "145",
								"label": "145"
							},
							{
								"value": "146",
								"label": "146"
							},
							{
								"value": "147",
								"label": "147"
							},
							{
								"value": "148",
								"label": "148"
							},
							{
								"value": "149",
								"label": "149"
							},
							{
								"value": "150",
								"label": "150"
							},
							{
								"value": "151",
								"label": "151"
							},
							{
								"value": "152",
								"label": "152"
							},
							{
								"value": "153",
								"label": "153"
							},
							{
								"value": "154",
								"label": "154"
							},
							{
								"value": "155",
								"label": "155"
							},
							{
								"value": "156",
								"label": "156"
							},
							{
								"value": "157",
								"label": "157"
							},
							{
								"value": "158",
								"label": "158"
							},
							{
								"value": "159",
								"label": "159"
							},
							{
								"value": "160",
								"label": "160"
							},
							{
								"value": "161",
								"label": "161"
							},
							{
								"value": "162",
								"label": "162"
							},
							{
								"value": "163",
								"label": "163"
							},
							{
								"value": "164",
								"label": "164"
							},
							{
								"value": "165",
								"label": "165"
							},
							{
								"value": "166",
								"label": "166"
							},
							{
								"value": "167",
								"label": "167"
							},
							{
								"value": "168",
								"label": "168"
							},
							{
								"value": "169",
								"label": "169"
							},
							{
								"value": "170",
								"label": "170"
							},
							{
								"value": "171",
								"label": "171"
							},
							{
								"value": "172",
								"label": "172"
							},
							{
								"value": "173",
								"label": "173"
							},
							{
								"value": "174",
								"label": "174"
							},
							{
								"value": "175",
								"label": "175"
							},
							{
								"value": "176",
								"label": "176"
							},
							{
								"value": "177",
								"label": "177"
							},
							{
								"value": "178",
								"label": "178"
							},
							{
								"value": "179",
								"label": "179"
							},
							{
								"value": "180",
								"label": "180"
							},
							{
								"value": "181",
								"label": "181"
							},
							{
								"value": "182",
								"label": "182"
							},
							{
								"value": "183",
								"label": "183"
							},
							{
								"value": "184",
								"label": "184"
							},
							{
								"value": "185",
								"label": "185"
							},
							{
								"value": "186",
								"label": "186"
							},
							{
								"value": "187",
								"label": "187"
							},
							{
								"value": "188",
								"label": "188"
							},
							{
								"value": "189",
								"label": "189"
							},
							{
								"value": "190",
								"label": "190"
							},
							{
								"value": "191",
								"label": "191"
							},
							{
								"value": "192",
								"label": "192"
							},
							{
								"value": "193",
								"label": "193"
							},
							{
								"value": "194",
								"label": "194"
							},
							{
								"value": "195",
								"label": "195"
							},
							{
								"value": "196",
								"label": "196"
							},
							{
								"value": "197",
								"label": "197"
							},
							{
								"value": "198",
								"label": "198"
							},
							{
								"value": "199",
								"label": "199"
							},
							{
								"value": "200",
								"label": "200"
							},
							{
								"value": "201",
								"label": "201"
							},
							{
								"value": "202",
								"label": "202"
							},
							{
								"value": "203",
								"label": "203"
							},
							{
								"value": "204",
								"label": "204"
							},
							{
								"value": "205",
								"label": "205"
							},
							{
								"value": "206",
								"label": "206"
							},
							{
								"value": "207",
								"label": "207"
							},
							{
								"value": "208",
								"label": "208"
							},
							{
								"value": "209",
								"label": "209"
							},
							{
								"value": "210",
								"label": "210"
							},
							{
								"value": "211",
								"label": "211"
							},
							{
								"value": "212",
								"label": "212"
							},
							{
								"value": "213",
								"label": "213"
							},
							{
								"value": "214",
								"label": "214"
							},
							{
								"value": "215",
								"label": "215"
							},
							{
								"value": "216",
								"label": "216"
							},
							{
								"value": "217",
								"label": "217"
							},
							{
								"value": "218",
								"label": "218"
							},
							{
								"value": "219",
								"label": "219"
							},
							{
								"value": "220",
								"label": "220"
							},
							{
								"value": "221",
								"label": "221"
							},
							{
								"value": "222",
								"label": "222"
							},
							{
								"value": "223",
								"label": "223"
							},
							{
								"value": "224",
								"label": "224"
							},
							{
								"value": "225",
								"label": "225"
							},
							{
								"value": "226",
								"label": "226"
							},
							{
								"value": "227",
								"label": "227"
							},
							{
								"value": "228",
								"label": "228"
							},
							{
								"value": "229",
								"label": "229"
							},
							{
								"value": "230",
								"label": "230"
							},
							{
								"value": "231",
								"label": "231"
							},
							{
								"value": "232",
								"label": "232"
							},
							{
								"value": "233",
								"label": "233"
							},
							{
								"value": "234",
								"label": "234"
							},
							{
								"value": "235",
								"label": "235"
							},
							{
								"value": "236",
								"label": "236"
							},
							{
								"value": "237",
								"label": "237"
							},
							{
								"value": "238",
								"label": "238"
							},
							{
								"value": "239",
								"label": "239"
							},
							{
								"value": "240",
								"label": "240"
							},
							{
								"value": "241",
								"label": "241"
							},
							{
								"value": "242",
								"label": "242"
							},
							{
								"value": "243",
								"label": "243"
							},
							{
								"value": "244",
								"label": "244"
							},
							{
								"value": "245",
								"label": "245"
							},
							{
								"value": "246",
								"label": "246"
							},
							{
								"value": "247",
								"label": "247"
							},
							{
								"value": "248",
								"label": "248"
							},
							{
								"value": "249",
								"label": "249"
							},
							{
								"value": "250",
								"label": "250"
							},
							{
								"value": "251",
								"label": "251"
							},
							{
								"value": "252",
								"label": "252"
							},
							{
								"value": "253",
								"label": "253"
							},
							{
								"value": "254",
								"label": "254"
							}
						],
						"visibleWhen": {
							"field": "mode",
							"equals": "carp"
						},
						"help": "Seconds between advertisements."
					},
					{
						"name": "advskew",
						"type": "select",
						"label": "Advertising skew",
						"width": "third",
						"default": "0",
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
							},
							{
								"value": "33",
								"label": "33"
							},
							{
								"value": "34",
								"label": "34"
							},
							{
								"value": "35",
								"label": "35"
							},
							{
								"value": "36",
								"label": "36"
							},
							{
								"value": "37",
								"label": "37"
							},
							{
								"value": "38",
								"label": "38"
							},
							{
								"value": "39",
								"label": "39"
							},
							{
								"value": "40",
								"label": "40"
							},
							{
								"value": "41",
								"label": "41"
							},
							{
								"value": "42",
								"label": "42"
							},
							{
								"value": "43",
								"label": "43"
							},
							{
								"value": "44",
								"label": "44"
							},
							{
								"value": "45",
								"label": "45"
							},
							{
								"value": "46",
								"label": "46"
							},
							{
								"value": "47",
								"label": "47"
							},
							{
								"value": "48",
								"label": "48"
							},
							{
								"value": "49",
								"label": "49"
							},
							{
								"value": "50",
								"label": "50"
							},
							{
								"value": "51",
								"label": "51"
							},
							{
								"value": "52",
								"label": "52"
							},
							{
								"value": "53",
								"label": "53"
							},
							{
								"value": "54",
								"label": "54"
							},
							{
								"value": "55",
								"label": "55"
							},
							{
								"value": "56",
								"label": "56"
							},
							{
								"value": "57",
								"label": "57"
							},
							{
								"value": "58",
								"label": "58"
							},
							{
								"value": "59",
								"label": "59"
							},
							{
								"value": "60",
								"label": "60"
							},
							{
								"value": "61",
								"label": "61"
							},
							{
								"value": "62",
								"label": "62"
							},
							{
								"value": "63",
								"label": "63"
							},
							{
								"value": "64",
								"label": "64"
							},
							{
								"value": "65",
								"label": "65"
							},
							{
								"value": "66",
								"label": "66"
							},
							{
								"value": "67",
								"label": "67"
							},
							{
								"value": "68",
								"label": "68"
							},
							{
								"value": "69",
								"label": "69"
							},
							{
								"value": "70",
								"label": "70"
							},
							{
								"value": "71",
								"label": "71"
							},
							{
								"value": "72",
								"label": "72"
							},
							{
								"value": "73",
								"label": "73"
							},
							{
								"value": "74",
								"label": "74"
							},
							{
								"value": "75",
								"label": "75"
							},
							{
								"value": "76",
								"label": "76"
							},
							{
								"value": "77",
								"label": "77"
							},
							{
								"value": "78",
								"label": "78"
							},
							{
								"value": "79",
								"label": "79"
							},
							{
								"value": "80",
								"label": "80"
							},
							{
								"value": "81",
								"label": "81"
							},
							{
								"value": "82",
								"label": "82"
							},
							{
								"value": "83",
								"label": "83"
							},
							{
								"value": "84",
								"label": "84"
							},
							{
								"value": "85",
								"label": "85"
							},
							{
								"value": "86",
								"label": "86"
							},
							{
								"value": "87",
								"label": "87"
							},
							{
								"value": "88",
								"label": "88"
							},
							{
								"value": "89",
								"label": "89"
							},
							{
								"value": "90",
								"label": "90"
							},
							{
								"value": "91",
								"label": "91"
							},
							{
								"value": "92",
								"label": "92"
							},
							{
								"value": "93",
								"label": "93"
							},
							{
								"value": "94",
								"label": "94"
							},
							{
								"value": "95",
								"label": "95"
							},
							{
								"value": "96",
								"label": "96"
							},
							{
								"value": "97",
								"label": "97"
							},
							{
								"value": "98",
								"label": "98"
							},
							{
								"value": "99",
								"label": "99"
							},
							{
								"value": "100",
								"label": "100"
							},
							{
								"value": "101",
								"label": "101"
							},
							{
								"value": "102",
								"label": "102"
							},
							{
								"value": "103",
								"label": "103"
							},
							{
								"value": "104",
								"label": "104"
							},
							{
								"value": "105",
								"label": "105"
							},
							{
								"value": "106",
								"label": "106"
							},
							{
								"value": "107",
								"label": "107"
							},
							{
								"value": "108",
								"label": "108"
							},
							{
								"value": "109",
								"label": "109"
							},
							{
								"value": "110",
								"label": "110"
							},
							{
								"value": "111",
								"label": "111"
							},
							{
								"value": "112",
								"label": "112"
							},
							{
								"value": "113",
								"label": "113"
							},
							{
								"value": "114",
								"label": "114"
							},
							{
								"value": "115",
								"label": "115"
							},
							{
								"value": "116",
								"label": "116"
							},
							{
								"value": "117",
								"label": "117"
							},
							{
								"value": "118",
								"label": "118"
							},
							{
								"value": "119",
								"label": "119"
							},
							{
								"value": "120",
								"label": "120"
							},
							{
								"value": "121",
								"label": "121"
							},
							{
								"value": "122",
								"label": "122"
							},
							{
								"value": "123",
								"label": "123"
							},
							{
								"value": "124",
								"label": "124"
							},
							{
								"value": "125",
								"label": "125"
							},
							{
								"value": "126",
								"label": "126"
							},
							{
								"value": "127",
								"label": "127"
							},
							{
								"value": "128",
								"label": "128"
							},
							{
								"value": "129",
								"label": "129"
							},
							{
								"value": "130",
								"label": "130"
							},
							{
								"value": "131",
								"label": "131"
							},
							{
								"value": "132",
								"label": "132"
							},
							{
								"value": "133",
								"label": "133"
							},
							{
								"value": "134",
								"label": "134"
							},
							{
								"value": "135",
								"label": "135"
							},
							{
								"value": "136",
								"label": "136"
							},
							{
								"value": "137",
								"label": "137"
							},
							{
								"value": "138",
								"label": "138"
							},
							{
								"value": "139",
								"label": "139"
							},
							{
								"value": "140",
								"label": "140"
							},
							{
								"value": "141",
								"label": "141"
							},
							{
								"value": "142",
								"label": "142"
							},
							{
								"value": "143",
								"label": "143"
							},
							{
								"value": "144",
								"label": "144"
							},
							{
								"value": "145",
								"label": "145"
							},
							{
								"value": "146",
								"label": "146"
							},
							{
								"value": "147",
								"label": "147"
							},
							{
								"value": "148",
								"label": "148"
							},
							{
								"value": "149",
								"label": "149"
							},
							{
								"value": "150",
								"label": "150"
							},
							{
								"value": "151",
								"label": "151"
							},
							{
								"value": "152",
								"label": "152"
							},
							{
								"value": "153",
								"label": "153"
							},
							{
								"value": "154",
								"label": "154"
							},
							{
								"value": "155",
								"label": "155"
							},
							{
								"value": "156",
								"label": "156"
							},
							{
								"value": "157",
								"label": "157"
							},
							{
								"value": "158",
								"label": "158"
							},
							{
								"value": "159",
								"label": "159"
							},
							{
								"value": "160",
								"label": "160"
							},
							{
								"value": "161",
								"label": "161"
							},
							{
								"value": "162",
								"label": "162"
							},
							{
								"value": "163",
								"label": "163"
							},
							{
								"value": "164",
								"label": "164"
							},
							{
								"value": "165",
								"label": "165"
							},
							{
								"value": "166",
								"label": "166"
							},
							{
								"value": "167",
								"label": "167"
							},
							{
								"value": "168",
								"label": "168"
							},
							{
								"value": "169",
								"label": "169"
							},
							{
								"value": "170",
								"label": "170"
							},
							{
								"value": "171",
								"label": "171"
							},
							{
								"value": "172",
								"label": "172"
							},
							{
								"value": "173",
								"label": "173"
							},
							{
								"value": "174",
								"label": "174"
							},
							{
								"value": "175",
								"label": "175"
							},
							{
								"value": "176",
								"label": "176"
							},
							{
								"value": "177",
								"label": "177"
							},
							{
								"value": "178",
								"label": "178"
							},
							{
								"value": "179",
								"label": "179"
							},
							{
								"value": "180",
								"label": "180"
							},
							{
								"value": "181",
								"label": "181"
							},
							{
								"value": "182",
								"label": "182"
							},
							{
								"value": "183",
								"label": "183"
							},
							{
								"value": "184",
								"label": "184"
							},
							{
								"value": "185",
								"label": "185"
							},
							{
								"value": "186",
								"label": "186"
							},
							{
								"value": "187",
								"label": "187"
							},
							{
								"value": "188",
								"label": "188"
							},
							{
								"value": "189",
								"label": "189"
							},
							{
								"value": "190",
								"label": "190"
							},
							{
								"value": "191",
								"label": "191"
							},
							{
								"value": "192",
								"label": "192"
							},
							{
								"value": "193",
								"label": "193"
							},
							{
								"value": "194",
								"label": "194"
							},
							{
								"value": "195",
								"label": "195"
							},
							{
								"value": "196",
								"label": "196"
							},
							{
								"value": "197",
								"label": "197"
							},
							{
								"value": "198",
								"label": "198"
							},
							{
								"value": "199",
								"label": "199"
							},
							{
								"value": "200",
								"label": "200"
							},
							{
								"value": "201",
								"label": "201"
							},
							{
								"value": "202",
								"label": "202"
							},
							{
								"value": "203",
								"label": "203"
							},
							{
								"value": "204",
								"label": "204"
							},
							{
								"value": "205",
								"label": "205"
							},
							{
								"value": "206",
								"label": "206"
							},
							{
								"value": "207",
								"label": "207"
							},
							{
								"value": "208",
								"label": "208"
							},
							{
								"value": "209",
								"label": "209"
							},
							{
								"value": "210",
								"label": "210"
							},
							{
								"value": "211",
								"label": "211"
							},
							{
								"value": "212",
								"label": "212"
							},
							{
								"value": "213",
								"label": "213"
							},
							{
								"value": "214",
								"label": "214"
							},
							{
								"value": "215",
								"label": "215"
							},
							{
								"value": "216",
								"label": "216"
							},
							{
								"value": "217",
								"label": "217"
							},
							{
								"value": "218",
								"label": "218"
							},
							{
								"value": "219",
								"label": "219"
							},
							{
								"value": "220",
								"label": "220"
							},
							{
								"value": "221",
								"label": "221"
							},
							{
								"value": "222",
								"label": "222"
							},
							{
								"value": "223",
								"label": "223"
							},
							{
								"value": "224",
								"label": "224"
							},
							{
								"value": "225",
								"label": "225"
							},
							{
								"value": "226",
								"label": "226"
							},
							{
								"value": "227",
								"label": "227"
							},
							{
								"value": "228",
								"label": "228"
							},
							{
								"value": "229",
								"label": "229"
							},
							{
								"value": "230",
								"label": "230"
							},
							{
								"value": "231",
								"label": "231"
							},
							{
								"value": "232",
								"label": "232"
							},
							{
								"value": "233",
								"label": "233"
							},
							{
								"value": "234",
								"label": "234"
							},
							{
								"value": "235",
								"label": "235"
							},
							{
								"value": "236",
								"label": "236"
							},
							{
								"value": "237",
								"label": "237"
							},
							{
								"value": "238",
								"label": "238"
							},
							{
								"value": "239",
								"label": "239"
							},
							{
								"value": "240",
								"label": "240"
							},
							{
								"value": "241",
								"label": "241"
							},
							{
								"value": "242",
								"label": "242"
							},
							{
								"value": "243",
								"label": "243"
							},
							{
								"value": "244",
								"label": "244"
							},
							{
								"value": "245",
								"label": "245"
							},
							{
								"value": "246",
								"label": "246"
							},
							{
								"value": "247",
								"label": "247"
							},
							{
								"value": "248",
								"label": "248"
							},
							{
								"value": "249",
								"label": "249"
							},
							{
								"value": "250",
								"label": "250"
							},
							{
								"value": "251",
								"label": "251"
							},
							{
								"value": "252",
								"label": "252"
							},
							{
								"value": "253",
								"label": "253"
							},
							{
								"value": "254",
								"label": "254"
							}
						],
						"visibleWhen": {
							"field": "mode",
							"equals": "carp"
						},
						"help": "0 usually makes this member the master; the lowest base and skew in the cluster wins."
					},
					{
						"name": "password",
						"type": "secret",
						"label": "Virtual IP password",
						"width": "half",
						"visibleWhen": {
							"field": "mode",
							"equals": "carp"
						},
						"autocomplete": "new-password",
						"help": "Shared by the members of the VHID group. Never shown again; leave it empty to keep the current password.",
						"errorMatch": [
							"carp password",
							"confirm password"
						]
					}
				]
			}
		],
		"resource": "firewall/virtual_ips"
	};

	/* ---------------------------------------------------------------- schedules */

	var DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	var MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
	var pad = function (t) { var p = String(t || '').split(':'); return (p[0].length < 2 ? '0' : '') + p[0] + ':' + (p[1] || '00'); };
	var SCHEDULES = [
		{ name: 'Office', descr: 'Working hours', used_by: 2, ranges: [{ weekdays: ['1', '2', '3', '4', '5'], dates: '', start: '08:00', stop: '17:00', description: 'Day' }] },
		{ name: 'KidsBedtime', descr: 'No gaming at night', used_by: 1, ranges: [
			{ weekdays: ['1', '2', '3', '4', '7'], dates: '', start: '21:00', stop: '23:59', description: 'School nights' },
			{ weekdays: ['5', '6'], dates: '', start: '23:00', stop: '23:59', description: 'Weekend' }] },
		{ name: 'Holidays', descr: 'Closed', used_by: 0, ranges: [{ weekdays: [], dates: '12-24, 12-25, 12-26', start: '00:00', stop: '23:59', description: '' }] }
	];
	function dayRun(days) {
		var n = days.map(Number).sort(), out = [], i = 0;
		while (i < n.length) {
			var j = i;
			while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++;
			out.push(j - i >= 2 ? DAYS[n[i]] + '–' + DAYS[n[j]] : n.slice(i, j + 1).map(function (d) { return DAYS[d]; }).join(', '));
			i = j + 1;
		}
		return out.join(', ');
	}
	function rangeText(r) {
		var when = (r.weekdays && r.weekdays.length) ? dayRun(r.weekdays) : String(r.dates || '').split(/\s*,\s*/).filter(Boolean).map(function (d) {
			var p = d.split('-'); return MONTHS[+p[0]] + ' ' + (+p[1]);
		}).join(', ');
		return when + ' ' + pad(r.start) + '–' + pad(r.stop) + (r.description ? ' (' + r.description + ')' : '');
	}
	function activeNow(s) {
		var d = new Date(), wd = String(((d.getDay() + 6) % 7) + 1), md = (d.getMonth() + 1) + '-' + d.getDate(), hm = pad(d.getHours() + ':' + d.getMinutes());
		return s.ranges.some(function (r) {
			var day = (r.weekdays || []).indexOf(wd) >= 0 || String(r.dates || '').split(/\s*,\s*/).some(function (x) { var p = x.split('-'); return (+p[0]) + '-' + (+p[1]) === md; });
			return day && pad(r.start) <= hm && hm <= pad(r.stop);
		});
	}
	function schedOut(s) {
		return {
			name: s.name, description: s.descr,
			ranges: s.ranges.map(function (r) { return { start: r.start, stop: r.stop, description: r.description, weekdays: r.weekdays.map(Number), dates: r.dates ? r.dates.split(/\s*,\s*/) : [] }; }),
			descr: s.descr,
			fields: { name: s.name, descr: s.descr, ranges: clone(s.ranges) },
			display: { ranges: s.ranges.map(rangeText), active: activeNow(s), used_by: s.used_by, description: s.descr }
		};
	}
	function findSched(name) { return SCHEDULES.find(function (s) { return s.name === name; }); }
	function schedCheck(b, old) {
		var e = {}, name = String(b.name || '');
		if (!/^[A-Za-z0-9_]{1,32}$/.test(name)) e.name = 'Schedule name cannot exceed 32 characters and may only contain the characters a-z, A-Z, 0-9 and _.';
		else if (findSched(name) && (!old || old.name !== name)) e.name = 'A schedule with this name already exists.';
		else if (old && old.name !== name && old.used_by) e.name = 'The schedule is used by firewall rules and cannot be renamed.';
		var ranges = Array.isArray(b.ranges) ? b.ranges : [];
		if (!ranges.length) e.ranges = 'The schedule must have at least one time range configured.';
		ranges.forEach(function (r, i) {
			var hasDays = r.weekdays && r.weekdays.length, hasDates = String(r.dates || '').trim() !== '';
			if (!hasDays && !hasDates) e['ranges.' + i + '.weekdays'] = 'Choose weekdays or enter dates for each time range.';
			if (hasDays && hasDates) e['ranges.' + i + '.dates'] = 'A time range has weekdays or dates, not both.';
			if (hasDates && !/^\s*\d{1,2}-\d{1,2}(\s*,\s*\d{1,2}-\d{1,2})*\s*$/.test(r.dates)) e['ranges.' + i + '.dates'] = 'Invalid schedule specification "' + r.dates + '".';
			if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(r.start || '')) e['ranges.' + i + '.start'] = 'Invalid start time "' + (r.start || '') + '".';
			if (!/^([01]?\d|2[0-4]):[0-5]\d$/.test(r.stop || '')) e['ranges.' + i + '.stop'] = 'Invalid stop time "' + (r.stop || '') + '".';
			else if (pad(r.start) > pad(r.stop)) e['ranges.' + i + '.stop'] = 'The start time must be before the stop time.';
		});
		return Object.keys(e).length ? e : null;
	}
	function schedFrom(b, old) {
		return { name: String(b.name), descr: String(b.descr != null ? b.descr : (b.description || '')), used_by: old ? old.used_by : 0,
			ranges: (b.ranges || []).map(function (r) { return { weekdays: (r.weekdays || []).map(String), dates: String(r.dates || ''), start: pad(r.start), stop: pad(r.stop), description: String(r.description || '') }; }) };
	}

	M.route('GET', '/api/v1/schema/firewall/schedules', function () { return M.ok(clone(SCHEDULE_SCHEMA)); });
	M.route('GET', '/api/v1/firewall/schedules', function () { return M.ok(SCHEDULES.map(schedOut)); });
	M.route('GET', '/api/v1/firewall/schedules/{name}', function (p) {
		var s = findSched(p.name);
		return s ? M.ok(schedOut(s)) : M.err(404, 'Schedule not found.');
	});
	M.route('POST', '/api/v1/firewall/schedules', function (p, q, b) {
		b = b || {};
		var e = schedCheck(b, null);
		if (e) return M.err(422, INVALID, e);
		var s = schedFrom(b, null);
		SCHEDULES.push(s);
		return Object.assign(M.ok(schedOut(s)), { status: 201 });
	});
	M.route('PUT', '/api/v1/firewall/schedules/{name}', function (p, q, b) {
		var old = findSched(p.name);
		if (!old) return M.err(404, 'Schedule not found.');
		var merged = Object.assign({ name: old.name, descr: old.descr, ranges: clone(old.ranges) }, b || {});
		var e = schedCheck(merged, old);
		if (e) return M.err(422, INVALID, e);
		var s = schedFrom(merged, old);
		SCHEDULES[SCHEDULES.indexOf(old)] = s;
		return M.ok(schedOut(s));
	});
	M.route('DELETE', '/api/v1/firewall/schedules/{name}', function (p) {
		var s = findSched(p.name);
		if (!s) return M.err(404, 'Schedule not found.');
		if (s.used_by) return M.err(409, 'Schedule ' + s.name + ' cannot be deleted: it is used by firewall rule "Allow office hours".');
		SCHEDULES.splice(SCHEDULES.indexOf(s), 1);
		return M.ok({ deleted: s.name });
	});

	/* ---------------------------------------------------------------- virtual IPs */

	var TYPE_LABEL = { ipalias: 'IP Alias', carp: 'CARP', proxyarp: 'Proxy ARP', other: 'Other' };
	var VIPS = [
		{ mode: 'carp', interface: 'wan', subnet: '198.51.100.10', subnet_bits: '24', type: 'single', vhid: '5', advbase: '1', advskew: '0', password: 'secret', descr: 'Cluster WAN', uniqid: '6705a1b2c3d41' },
		{ mode: 'carp', interface: 'lan', subnet: '192.168.1.1', subnet_bits: '24', type: 'single', vhid: '6', advbase: '1', advskew: '0', password: 'secret', descr: 'Cluster LAN gateway', uniqid: '6705a1b2c3d42' },
		{ mode: 'ipalias', interface: 'wan', subnet: '198.51.100.11', subnet_bits: '32', type: 'single', descr: 'Mail server', uniqid: '6705a1b2c3d43' },
		{ mode: 'proxyarp', interface: 'wan', subnet: '198.51.100.32', subnet_bits: '28', type: 'network', noexpand: true, descr: 'Public block', uniqid: '6705a1b2c3d44' }
	];
	function ifLabel(id) {
		var i = M.interfaces.find(function (x) { return x.id === id; });
		return i ? i.descr : (id === 'lo0' ? 'Localhost' : id);
	}
	var FORM = ['mode', 'interface', 'type', 'subnet', 'subnet_bits', 'descr', 'vhid', 'advbase', 'advskew', 'uniqid'];
	function vipOut(v, id) {
		var out = { id: id }, f = {};
		Object.keys(v).forEach(function (k) { if (k !== 'password') out[k] = v[k]; });
		FORM.forEach(function (k) { if (v[k] != null && v[k] !== '') f[k] = String(v[k]); });
		if (v.noexpand) f.noexpand = 'yes';
		out.fields = f;
		out.display = { type: TYPE_LABEL[v.mode] || v.mode, interface: ifLabel(v.interface), address: v.subnet + '/' + v.subnet_bits,
			vhid: v.mode === 'carp' ? String(v.vhid) : '', description: v.descr || '' };
		return out;
	}
	function vipSchema() {
		var s = clone(VIP_SCHEMA);
		var opts = M.interfaces.map(function (i) { return { value: i.id, label: i.descr }; }).concat([{ value: 'lo0', label: 'Localhost' }]);
		s.sections.forEach(function (sec) { sec.fields.forEach(function (f) { if (f.name === 'interface') f.options = opts; }); });
		return s;
	}
	function vipCheck(n, id) {
		var e = {};
		if (!TYPE_LABEL[n.mode]) e.mode = 'The field Type is required.';
		if (!V4.test(n.subnet || '')) e.subnet = 'A valid IP address must be specified.';
		var bits = +n.subnet_bits;
		if (!(bits >= 1 && bits <= 32)) e.subnet_bits = 'A valid subnet bit count must be specified.';
		if (n.mode === 'carp') {
			if (!(+n.vhid >= 1 && +n.vhid <= 255)) e.vhid = 'A VHID must be a number between 1 and 255.';
			else if (VIPS.some(function (v, i) { return i !== id && v.mode === 'carp' && v.interface === n.interface && String(v.vhid) === String(n.vhid); }))
				e.vhid = 'VHID ' + n.vhid + ' is already in use on interface ' + ifLabel(n.interface) + '. Pick a unique number on this interface.';
			if (!n.password) e.password = 'You must specify a CARP password that is shared between the two VHID members.';
			if (n.interface === 'lo0') e.interface = 'For this type of vip localhost is not allowed.';
		}
		if (VIPS.some(function (v, i) { return i !== id && v.subnet === n.subnet; })) e.subnet = 'There is already a virtual IP with this address.';
		return Object.keys(e).length ? e : null;
	}
	function vipFrom(b, old) {
		var n = Object.assign({}, old || { type: 'single', uniqid: Date.now().toString(16) });
		Object.keys(b).forEach(function (k) {
			if (k === 'password' && (b[k] === '' || b[k] == null)) return;
			if (b[k] === false) delete n[k]; else n[k] = (k === 'noexpand') ? true : b[k];
		});
		if (n.mode === 'ipalias' || n.mode === 'carp') n.type = 'single';
		if (n.mode !== 'carp') ['vhid', 'advbase', 'advskew', 'password'].forEach(function (k) { delete n[k]; });
		return n;
	}

	M.route('GET', '/api/v1/schema/firewall/virtual_ips', function () { return M.ok(vipSchema()); });
	M.route('GET', '/api/v1/firewall/virtual-ips', function () { return M.ok(VIPS.map(vipOut)); });
	M.route('GET', '/api/v1/firewall/virtual-ips/{id}', function (p) {
		var id = +p.id;
		return VIPS[id] ? M.ok(vipOut(VIPS[id], id)) : M.err(404, 'Virtual IP not found.');
	});
	M.route('POST', '/api/v1/firewall/virtual-ips', function (p, q, b) {
		var n = vipFrom(b || {}, null);
		var e = vipCheck(n, -1);
		if (e) return M.err(422, INVALID, e);
		VIPS.push(n);
		M.markPending('virtual_ips');
		return Object.assign(M.ok(vipOut(n, VIPS.length - 1)), { status: 201 });
	});
	M.route('PUT', '/api/v1/firewall/virtual-ips/{id}', function (p, q, b) {
		var id = +p.id;
		if (!VIPS[id]) return M.err(404, 'Virtual IP not found.');
		var n = vipFrom(b || {}, VIPS[id]);
		var e = vipCheck(n, id);
		if (e) return M.err(422, INVALID, e);
		VIPS[id] = n;
		M.markPending('virtual_ips');
		return M.ok(vipOut(n, id));
	});
	M.route('DELETE', '/api/v1/firewall/virtual-ips/{id}', function (p) {
		var id = +p.id;
		if (!VIPS[id]) return M.err(404, 'Virtual IP not found.');
		VIPS.splice(id, 1);
		M.markPending('virtual_ips');
		return M.ok({ deleted: id });
	});
	M.route('POST', '/api/v1/firewall/virtual-ips/apply', function () {
		M.clearPending('virtual_ips');
		return M.ok({ applied: true, pending: M.pending() });
	});
})(window.FSMock);
