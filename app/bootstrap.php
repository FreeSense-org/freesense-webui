<?php
/*
 * bootstrap.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * WebUI 2.0 bootstrap. The FreeSense-webui port installs the app to
 * /usr/local/share/freesense-webui/app and the web root to /usr/local/www-ui
 * (index.php, ui/ = built engine, themes/).
 *
 * The app renders page frames only: the shell, and elements as containers
 * with their config. It reads the signed-in GUI session, privileges and
 * preferences from the backend libraries; every piece of data on a page is
 * loaded by its elements from /api/v1.
 */

declare(strict_types=1);

define('FS_WEBUI_APP', __DIR__);
define('FS_WEBUI_PUBLIC', getenv('FS_WEBUI_PUBLIC') ?: '/usr/local/www-ui');
/* Where pages live: /next while WebUI 2.0 runs next to the 1.x GUI, '' after the cutover. Assets are always /ui/ and /themes/. */
define('FS_WEBUI_BASE', rtrim((string)(getenv('FS_WEBUI_BASE') ?: '/next'), '/'));
/* The API level this WebUI needs (RESTAPI_LEVEL, GET /api/v1/meta). */
define('FS_WEBUI_API_LEVEL', 6);

spl_autoload_register(function (string $class): void {
	$prefix = 'FreeSense\\WebUI\\';
	if (strncmp($class, $prefix, strlen($prefix)) !== 0) {
		return;
	}
	$rel = str_replace('\\', '/', substr($class, strlen($prefix)));
	$file = (strncmp($rel, 'Pages/', 6) === 0) ? FS_WEBUI_APP . '/pages/' . substr($rel, 6) . '.php' : FS_WEBUI_APP . "/src/{$rel}.php";
	if (is_file($file)) {
		require $file;
	}
});

/* Backend libraries (freesense /etc/inc). Tests define FS_WEBUI_NO_BACKEND and stub what they need. */
if (!defined('FS_WEBUI_NO_BACKEND')) {
	set_include_path(get_include_path() . PATH_SEPARATOR . '/etc/inc');
	require_once('config.inc');
	require_once('auth.inc');
	require_once('priv.inc');
	require_once('pkg-utils.inc');
	require_once('restapi_session.inc');
	require_once('webui_prefs.inc');
}
