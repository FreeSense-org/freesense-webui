<?php
/*
 * Session.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI;

/*
 * The signed-in GUI session, shared with the 1.x GUI and the API session
 * bridge. Only the backend's own rules decide: restapi_session_problem()
 * (signed in, protocol, address, timeout), restapi_session_user() (account
 * still active), getAllowedPages() (privileges, LDAP/RADIUS groups), and
 * webgui_session_signin()/signout().
 */
final class Session {
	private string $username;
	private array $pages;
	private string $csrf;

	private function __construct(string $username, array $pages, string $csrf) {
		$this->username = $username;
		$this->pages = $pages;
		$this->csrf = $csrf;
	}

	/*
	 * The session of this page load, or null when it is not usable. Like a
	 * 1.x page load it counts as activity (last_access) and refreshes the
	 * user's privileges; it also makes sure the session has a WebUI token.
	 */
	public static function current(): ?self {
		$id = restapi_session_cookie_id();
		if ($id === null) {
			return null;
		}
		$s = restapi_session_read($id);
		if (restapi_session_problem($s, (string)($_SERVER['REMOTE_ADDR'] ?? '')) !== null) {
			return null;
		}
		try {
			restapi_session_user($s);
		} catch (\RestApiError $e) {
			return null;
		}

		phpsession_begin();
		if (($_SESSION['Username'] ?? null) !== $s['Username']) {
			phpsession_end();
			return null;
		}
		$_SESSION['last_access'] = time();
		if (empty($_SESSION[RESTAPI_SESSION_TOKEN_KEY]) || !is_string($_SESSION[RESTAPI_SESSION_TOKEN_KEY])) {
			$_SESSION[RESTAPI_SESSION_TOKEN_KEY] = bin2hex(random_bytes(32));
		}
		$csrf = $_SESSION[RESTAPI_SESSION_TOKEN_KEY];
		$attributes = is_array($_SESSION['user_radius_attributes'] ?? null) ? $_SESSION['user_radius_attributes'] : array();
		phpsession_end(true);

		$pages = getAllowedPages((string)$s['Username'], $attributes);
		return new self((string)$s['Username'], is_array($pages) ? $pages : array(), $csrf);
	}

	public function username(): string {
		return $this->username;
	}

	public function csrf(): string {
		return $this->csrf;
	}

	/*
	 * May the user open a page that needs the 1.x privilege $priv? null means
	 * every signed-in user. A privilege matches when the user holds one of its
	 * patterns (what getPrivPages() collects) or all pages.
	 */
	public function may(?string $priv): bool {
		if ($priv === null) {
			return true;
		}
		if (in_array('*', $this->pages, true)) {
			return true;
		}
		global $priv_list;
		$match = (array)($priv_list[$priv]['match'] ?? array());
		return !empty($match) && !empty(array_intersect($match, $this->pages));
	}

	/* Sign in from the WebUI sign-in page. On failure the reason was logged (login protection reads it). */
	public static function signIn(string $username, string $password): bool {
		phpsession_begin();
		if (webgui_session_signin($username, $password)) {
			return true;
		}
		$_SESSION = array();
		phpsession_end();
		return false;
	}
}
