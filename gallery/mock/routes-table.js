/*
 * routes-table.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Mock routes for the data-table fixtures:
 *   POST   /api/v1/firewall/rules/{id}/duplicate   copy a rule below the original
 *   POST   /api/v1/status/dhcp-leases/release      release leases {ids: [mac…]} (one call)
 *   GET    /api/v1/gallery/table/clients           500 clients with a live rate; with ?page=&limit=
 *                                                  it pages, searches (q), sorts (sort, dir) and
 *                                                  filters (iface) on the server: {data, meta:{total}}
 *   PATCH  /api/v1/gallery/table/clients/{id}      {enabled}; id 7 always fails (rollback demo)
 *   DELETE /api/v1/gallery/table/clients/{id}
 *   GET    /api/v1/gallery/table/slow              interfaces after 4 s
 *   GET    /api/v1/gallery/table/flaky?k=…         answers once per key, then 503 (stale)
 *   GET    /api/v1/gallery/table/long              rows with long, unbroken text
 */
(function (M, $) {
	'use strict';

	var none = new URLSearchParams();
	var call = function (method, path, body) { return M.dispatch(method, path, none, body || null); };

	/* -------------------------------------------------- firewall rules */
	M.route('POST', '/api/v1/firewall/rules/{id}/duplicate', function (p) {
		var got = call('GET', '/api/v1/firewall/rules/' + p.id);
		if (got.status !== 200) return got;
		var src = got.body.data;
		if (src.system) return M.err(409, 'System rules cannot be duplicated.');
		var copy = $.extend({}, src, { hits: 0, states: 0, bytes: 0, descr: (src.descr || '').slice(0, 44) + ' (copy)' });
		delete copy.id;
		delete copy.tracker;
		delete copy.position;
		var made = call('POST', '/api/v1/firewall/rules', copy);
		if (made.status !== 200) return made;
		var q = new URLSearchParams({ interface: src.interface });
		var list = M.dispatch('GET', '/api/v1/firewall/rules', q, null).body.data.map(function (r) { return r.id; });
		var newId = made.body.data.id;
		list = list.filter(function (id) { return id !== newId; });
		list.splice(list.indexOf(src.id) + 1, 0, newId);
		call('POST', '/api/v1/firewall/rules/order', { interface: src.interface, ids: list });
		return M.ok(made.body.data, { pending: true, message: 'Rule duplicated' });
	});

	/* -------------------------------------------------------- leases */
	M.route('POST', '/api/v1/status/dhcp-leases/release', function (p, q, b) {
		var n = ((b && b.ids) || []).length;
		if (!n) return M.err(422, 'Choose at least one lease.');
		return M.ok(null, { message: n === 1 ? '1 lease released' : n + ' leases released' });
	});

	/* ------------------------------------------------------- clients */
	var IF = ['LAN', 'LAN', 'LAN', 'GUEST', 'IOT', 'IOT', 'DMZ'];
	var NET = { LAN: '192.168.1.', GUEST: '10.20.0.', IOT: '10.30.0.', DMZ: '172.16.40.' };
	var VENDOR = ['Apple', 'Synology', 'Raspberry Pi', 'Espressif', 'Intel', 'Google', 'VMware', 'Brother', 'Sonos', 'Ubiquiti', 'Samsung', 'Lenovo'];
	var KIND = ['laptop', 'phone', 'tv', 'sensor', 'plug', 'camera', 'server', 'printer', 'tablet', 'speaker'];
	var hex = function (n) { return ('0' + (n & 255).toString(16)).slice(-2); };
	var CLIENTS = [];
	for (var i = 1; i <= 500; i++) {
		var ifc = IF[(i * 3 + (i >> 2)) % IF.length];
		CLIENTS.push({
			id: i,
			hostname: KIND[i % KIND.length] + '-' + ('00' + i).slice(-3),
			ip: NET[ifc] + (10 + (i % 240)),
			mac: ['3c', hex(i * 13), hex(i * 7), hex(i), hex(i * 3), hex(i * 11)].join(':'),
			iface: ifc,
			vendor: VENDOR[(i * 5) % VENDOR.length],
			enabled: i % 9 !== 0,
			tags: i % 4 === 0 ? ['static'] : (i % 6 === 0 ? ['static', 'reserved'] : []),
			bytes: Math.round(Math.pow((i * 7919) % 1000 / 1000, 3) * 8e10 + 1e5),
			rate: 0,
			last_seen: new Date(Date.now() - ((i * 977) % 86400) * 1000).toISOString()
		});
	}
	function tick() {
		var now = Date.now();
		CLIENTS.forEach(function (c, n) {
			if (!c.enabled) { c.rate = 0; return; }
			var base = (n % 17 === 0) ? 4e7 : (n % 5 === 0 ? 2e6 : 2e4);
			c.rate = Math.round(base * (0.3 + Math.random() * 1.4));
			c.bytes += Math.round(c.rate / 8);
			if (Math.random() < 0.02) c.last_seen = new Date(now).toISOString();
		});
	}
	tick();

	M.route('GET', '/api/v1/gallery/table/clients', function (p, q) {
		tick();
		var rows = CLIENTS;
		if (!q.get('page')) return M.ok(rows.map(function (r) { return $.extend({}, r); }));
		var s = (q.get('q') || '').toLowerCase();
		var iface = q.get('iface');
		if (s) rows = rows.filter(function (r) { return (r.hostname + ' ' + r.ip + ' ' + r.mac + ' ' + r.vendor).toLowerCase().indexOf(s) >= 0; });
		if (iface) rows = rows.filter(function (r) { return iface.split(',').indexOf(r.iface) >= 0; });
		var sort = q.get('sort'), dir = q.get('dir') === 'desc' ? -1 : 1;
		if (sort) {
			rows = rows.slice().sort(function (a, b) {
				var x = a[sort], y = b[sort];
				if (typeof x === 'number') return (x - y) * dir;
				return String(x).localeCompare(String(y), undefined, { numeric: true }) * dir;
			});
		}
		var limit = Math.min(+q.get('limit') || 25, 200);
		var page = Math.max(1, +q.get('page') || 1);
		return M.ok(rows.slice((page - 1) * limit, page * limit).map(function (r) { return $.extend({}, r); }), { total: rows.length, page: page, limit: limit });
	});
	M.route('PATCH', '/api/v1/gallery/table/clients/{id}', function (p, q, b) {
		var c = CLIENTS.find(function (x) { return String(x.id) === p.id; });
		if (!c) return M.err(404, 'No such client.');
		if (c.id === 7) return M.err(503, 'The DHCP service did not accept the change (simulated).');
		$.extend(c, b || {});
		return M.ok(c, { pending: true });
	});
	M.route('DELETE', '/api/v1/gallery/table/clients/{id}', function (p) {
		var n = CLIENTS.findIndex(function (x) { return String(x.id) === p.id; });
		if (n < 0) return M.err(404, 'No such client.');
		CLIENTS.splice(n, 1);
		return M.ok(null, { pending: true });
	});

	/* ------------------------------------------------- slow, flaky, long */
	M.route('GET', '/api/v1/gallery/table/slow', function () {
		return Object.assign(call('GET', '/api/v1/status/interfaces'), { delay: 4000 });
	});
	var seen = {};
	M.route('GET', '/api/v1/gallery/table/flaky', function (p, q) {
		var k = q.get('k') || 'default';
		seen[k] = (seen[k] || 0) + 1;
		if (seen[k] > 1) return M.err(503, 'The service stopped answering (simulated).');
		return call('GET', '/api/v1/status/gateways');
	});
	M.route('GET', '/api/v1/gallery/table/long', function () {
		return M.ok([
			{ id: 1, name: 'CORPORATE_PARTNER_NETWORKS_EMEA_AND_APAC_REGIONAL_OFFICES', type: 'network', descr: 'Every partner network that may reach the extranet portal, merged from the quarterly access review and the regional office lists.', count: 412 },
			{ id: 2, name: 'https://feeds.example.org/blocklists/v2/aggregated/high-confidence/ipv4-and-ipv6.txt', type: 'urltable', descr: 'Aggregated feed', count: 120332 },
			{ id: 3, name: 'X', type: 'host', descr: '', count: 1 }
		]);
	});
})(window.FSMock, jQuery);
