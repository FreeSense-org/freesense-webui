<?php
/*
 * backend.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Stand-ins for the firewall's backend functions the app calls, for the
 * local preview only: one signed-in admin ("admin", every privilege),
 * every package installed, default preferences (the theme picker still
 * switches in the browser), host fw01.home.arpa.
 */

define('RESTAPI_LEVEL', FS_WEBUI_API_LEVEL);
define('RESTAPI_SESSION_TOKEN_KEY', 'fs_webui_csrf');

$GLOBALS['priv_list'] = array();
$GLOBALS['fs_dev_session'] = array('Logged_In' => 'True', 'Username' => 'admin', 'last_access' => time(),
    RESTAPI_SESSION_TOKEN_KEY => 'preview');

class RestApiError extends Exception {
}

function gettext($s) {
	return $s;
}

function config_get_path($path, $default = null) {
	return array('system/hostname' => 'fw01', 'system/domain' => 'home.arpa')[$path] ?? $default;
}

function log_error($msg) {
	error_log($msg);
}

function restapi_session_cookie_id() {
	return 'preview';
}

function restapi_session_read($id) {
	return $GLOBALS['fs_dev_session'];
}

function restapi_session_problem(array $s, $remote_ip, $now = null) {
	return null;
}

function restapi_session_user(array $s) {
	return array('name' => $s['Username'], 'uid' => '0');
}

function phpsession_begin() {
	$_SESSION = $GLOBALS['fs_dev_session'];
}

function phpsession_end($write = false) {
	if ($write) {
		$GLOBALS['fs_dev_session'] = $_SESSION;
	}
}

function getAllowedPages($username, &$attributes = array()) {
	return array('*');
}

function is_package_installed($name) {
	return true;
}

function webui_prefs_get($username) {
	return array('theme' => 'freesense', 'mode' => 'auto', 'accent' => '', 'density' => 'comfortable', 'start_page' => '/');
}

function webgui_session_signin($username, $password) {
	return true;
}
