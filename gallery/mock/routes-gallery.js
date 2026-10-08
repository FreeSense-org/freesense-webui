/*
 * routes-gallery.js
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Test routes for element fixtures:
 *   /api/v1/gallery/empty      → data: []
 *   /api/v1/gallery/fail       → 503
 *   /api/v1/gallery/forbidden  → 403
 *   /api/v1/gallery/slow       → answers after 5 s (keeps skeletons visible)
 */
(function (M) {
	'use strict';
	M.route('GET', '/api/v1/gallery/empty', function () { return M.ok([]); });
	M.route('GET', '/api/v1/gallery/fail', function () { return M.err(503, 'The service is not responding (simulated).'); });
	M.route('GET', '/api/v1/gallery/forbidden', function () { return M.err(403, 'You do not have the privilege to view this (simulated).'); });
	M.route('GET', '/api/v1/gallery/slow', function () { return Object.assign(M.ok([{ name: 'ready' }]), { delay: 5000 }); });
})(window.FSMock);
