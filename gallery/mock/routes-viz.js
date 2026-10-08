/*
 * routes-viz.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Mock routes for the data-visualisation elements (stat-tile, meter, ring,
 * sparkline, chart, topology):
 *   /api/v1/status/system/history?range=      {t, cpu, mem}  (pct, RRD-style)
 *   /api/v1/status/gateways/history?range=    {t, <gateway name>: rtt ms …}
 *   /api/v1/gallery/viz-stale?id=             succeeds twice per id, then 503 (stale state)
 */
(function (M) {
	'use strict';

	var STEPS = { '10m': [120, 5], '1h': [180, 20], '24h': [288, 300], '7d': [336, 1800], '30d': [360, 7200] };
	var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
	var rnd = function (a, b) { return a + Math.random() * (b - a); };

	function axis(range) {
		var cfg = STEPS[range] || STEPS['1h'];
		var now = Math.floor(Date.now() / 1000), t = [];
		for (var p = cfg[0]; p > 0; p--) t.push(now - p * cfg[1]);
		return { t: t, step: cfg[1] };
	}
	function walk(n, start, target, jitter, lo, hi, spike) {
		var v = start, out = [];
		for (var i = 0; i < n; i++) {
			v = clamp(v + rnd(-jitter, jitter) + (target - v) * 0.15 + (Math.random() < (spike || 0) ? jitter * 6 : 0), lo, hi);
			out.push(Math.round(v * 10) / 10);
		}
		return out;
	}

	M.route('GET', '/api/v1/status/system/history', function (p, q) {
		var range = q.get('range') || '1h';
		var a = axis(range);
		return M.ok({ step: a.step, t: a.t, cpu: walk(a.t.length, 14, 16, 5, 2, 99, 0.03), mem: walk(a.t.length, 38, 40, 0.5, 30, 70) }, { range: range, source: 'rrd' });
	});

	M.route('GET', '/api/v1/status/gateways/history', function (p, q) {
		var range = q.get('range') || '1h';
		var a = axis(range);
		return M.ok({ step: a.step, t: a.t, WAN_DHCP: walk(a.t.length, 8.4, 8.5, 1.2, 4, 120, 0.03), WAN_DHCP6: walk(a.t.length, 9.1, 9.2, 1.2, 4, 120, 0.03), WG_SITE_GW: walk(a.t.length, 21.8, 22, 1.5, 6, 120, 0.02) }, { range: range, source: 'rrd' });
	});

	var calls = {};
	M.route('GET', '/api/v1/gallery/viz-stale', function (p, q) {
		var id = q.get('id') || 'default';
		calls[id] = (calls[id] || 0) + 1;
		if (calls[id] > 2) return M.err(503, 'The source stopped answering (simulated).');
		return M.ok({ value: Math.round(rnd(40, 60)), in_bps: Math.round(rnd(1.2e8, 2e8)), t: [], series: [] });
	});
})(window.FSMock);
