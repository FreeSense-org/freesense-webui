<?php
/*
 * SignIn.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI;

/*
 * The sign-in page. Authentication, session and logging are the backend's
 * (webgui_session_signin(): authentication server, then local database;
 * failed attempts are logged for login protection). The form is protected
 * with a double-submit token: a random cookie only this path receives,
 * repeated in a hidden field.
 */
final class SignIn {
	private const COOKIE = 'fs_signin';

	public static function handle(string $method): void {
		$next = Url::next((string)($_REQUEST['next'] ?? ''));
		if (($method !== 'GET') && ($method !== 'HEAD') && ($method !== 'POST')) {
			header('Allow: GET, HEAD, POST');
			App::plain(405, gettext('Method not allowed.'));
			return;
		}
		if ($method !== 'POST') {
			if (Session::current() !== null) {
				App::redirect($next);
				return;
			}
			self::form($next, '', '');
			return;
		}

		$username = trim((string)($_POST['username'] ?? ''));
		$password = (string)($_POST['password'] ?? '');
		$cookie = (string)($_COOKIE[self::COOKIE] ?? '');
		$given = (string)($_POST['csrf'] ?? '');
		if (($cookie === '') || !hash_equals($cookie, $given)) {
			self::form($next, $username, gettext('The sign-in form expired. Try again.'), 400);
			return;
		}
		if (($username === '') || ($password === '')) {
			self::form($next, $username, gettext('Enter your username and password.'), 400);
			return;
		}
		if (!Session::signIn($username, $password)) {
			self::form($next, $username, gettext('Username or password incorrect.'), 401);
			return;
		}
		self::cookie('', time() - 3600);
		/* Without a page to return to, open the user's start page. */
		if (trim((string)($_REQUEST['next'] ?? '')) === '') {
			$start = (string)(webui_prefs_get($username)['start_page'] ?? '/');
			$next = Url::next(Url::page(($start !== '' && $start[0] === '/') ? $start : '/'));
		}
		App::redirect($next);
	}

	private static function form(string $next, string $username, string $error, int $status = 200): void {
		$token = bin2hex(random_bytes(32));
		self::cookie($token, 0);
		$style = Shell::style(array());
		http_response_code($status);
		header('Content-Type: text/html; charset=utf-8');
		header('X-Frame-Options: DENY');
		echo Shell::template('signin', $style + array(
			'host' => Shell::host(),
			'csrf' => $token,
			'next' => $next,
			'username' => $username,
			'error' => $error,
			'action' => Url::page('/signin'),
		));
	}

	private static function cookie(string $value, int $expires): void {
		setcookie(self::COOKIE, $value, array(
			'expires' => $expires,
			'path' => Url::page('/signin'),
			'secure' => !empty($_SERVER['HTTPS']) && ($_SERVER['HTTPS'] !== 'off'),
			'httponly' => true,
			'samesite' => 'Strict',
		));
	}
}
