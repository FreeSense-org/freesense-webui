/*
 * routes-layout.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Mock routes for the page & layout element fixtures:
 *   GET /api/v1/vpn/wireguard/peers/{id}   one WireGuard peer (detail views)
 *   GET /api/v1/gallery/layout/flaky?k=…   answers once per key, then 503
 *                                          (keeps the last render, marked stale)
 */
(function (M) {
	'use strict';
	var T0 = Date.now();
	var PEERS = {
		'office-gw': { id: 'office-gw', name: 'office-gw', descr: 'Office site gateway', tunnel: 'wg0', enabled: true, status: 'up',
			public_key: 'q9Hk2Z0xS7mKc1v4uYtL3aW8nB5eR6pD0fG2hJ4kM1s=', endpoint: '198.51.100.20:51820', allowed_ips: ['10.99.0.2/32', '192.168.50.0/24'],
			keepalive: 25, handshake_age: 38, rx: 9.2e9, tx: 3.1e9 },
		'pixel-9': { id: 'pixel-9', name: 'pixel-9', descr: 'Claire’s phone', tunnel: 'wg0', enabled: true, status: 'up',
			public_key: 'Zb3nV8cX1qW5eR7tY9uI0oP2aS4dF6gH8jK0lM2nB4c=', endpoint: '192.0.2.88:40112', allowed_ips: ['10.99.0.10/32'],
			keepalive: 0, handshake_age: 112, rx: 1.1e8, tx: 9.9e8 }
	};
	M.route('GET', '/api/v1/vpn/wireguard/peers/{id}', function (p) {
		var peer = PEERS[p.id];
		if (!peer) return M.err(404, 'No such peer.');
		var age = (peer.handshake_age + Math.floor((Date.now() - T0) / 1000)) % 130;
		peer.rx += Math.round(Math.random() * 2e6);
		peer.tx += Math.round(Math.random() * 8e5);
		return M.ok(Object.assign({}, peer, { latest_handshake: new Date(Date.now() - age * 1000).toISOString() }));
	});

	var seen = {};
	M.route('GET', '/api/v1/gallery/layout/flaky', function (p, q) {
		var k = (q && q.get && q.get('k')) || 'default';
		seen[k] = (seen[k] || 0) + 1;
		if (seen[k] > 1) return M.err(503, 'The service stopped answering (simulated).');
		return M.ok({ hostname: 'fw01.home.arpa', version: '1.1.0-DEV', uptime: 1043200, last_check: new Date(Date.now() - 95000).toISOString() });
	});
})(window.FSMock);
