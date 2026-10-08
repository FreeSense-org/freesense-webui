/*
 * routes-dashboard.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Gallery mock routes for the dashboard group. The layout itself uses the
 * core routes (GET/PUT/DELETE /api/v1/dashboard/layout?style=, kept in
 * localStorage). This file adds:
 *   PUT /api/v1/dashboard/layout/widgets/{id}?style=   {type, settings}
 *       validates one widget's settings (422 with fields) and stores them in
 *       the saved layout; answers {id, type, settings}.
 */
(function (M) {
	'use strict';

	var KEY = 'fs-demo-layout:';

	M.route('PUT', '/api/v1/dashboard/layout/widgets/{id}', function (p, q, body) {
		var b = body || {};
		var s = b.settings || {};
		var fields = {};
		if (s.title && String(s.title).length > 40) fields.title = 'Use 40 characters or fewer.';
		if (s.limit != null && (s.limit < 1 || s.limit > 30)) fields.limit = 'Enter a number from 1 to 30.';
		if (s.count != null && (s.count < 1 || s.count > 20)) fields.count = 'Enter a number from 1 to 20.';
		if (s.warn != null && s.crit != null && +s.warn >= +s.crit) fields.crit = 'The critical level must be above the warning level.';
		if (s.path != null && !/^\/(api\/)?v1\/[\w\-/.]+$/.test(String(s.path))) fields.path = 'Enter an API path such as /v1/status/system.';
		if (Object.keys(fields).length) return M.err(422, 'Check the highlighted settings.', fields);

		var style = q.get('style') || 'default';
		try {
			var list = JSON.parse(localStorage.getItem(KEY + style));
			if (Array.isArray(list)) {
				list.forEach(function (w) { if (w.id === p.id) w.settings = s; });
				localStorage.setItem(KEY + style, JSON.stringify(list));
			}
		} catch (e) { /* storage unavailable */ }
		return M.ok({ id: p.id, type: b.type || null, settings: s }, { message: 'Widget settings saved' });
	});
})(window.FSMock);
