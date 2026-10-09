<?php
/*
 * router.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Local preview of the PHP app (never installed): `npm run preview`.
 * Runs the real router, pages and shell under PHP's built-in server with
 * backend.php standing in for the firewall (a signed-in admin with every
 * privilege). The gallery server proxies /next/ here and injects the mock
 * API, so pages render with demo data at http://localhost:8770/next/.
 */

define('FS_WEBUI_NO_BACKEND', true);
putenv('FS_WEBUI_PUBLIC=' . dirname(__DIR__, 2) . '/dist/public');
require dirname(__DIR__) . '/bootstrap.php';
require __DIR__ . '/backend.php';

FreeSense\WebUI\App::run();
