<?php
/*
 * Url.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI;

final class Url {
	/* A page URL from its route ('/security/aliases' → '/next/security/aliases'); other URLs pass unchanged. */
	public static function page(string $route): string {
		if (($route === '') || ($route[0] !== '/') || (strncmp($route, '//', 2) === 0) || self::foreign($route)) {
			return $route;
		}
		return FS_WEBUI_BASE . (($route === '/') ? '/' : $route);
	}

	/* The route of a request path ('/next/security/aliases/' → '/security/aliases'), or null outside the WebUI. */
	public static function route(string $path): ?string {
		$base = FS_WEBUI_BASE;
		if ($base !== '') {
			if (($path !== $base) && (strncmp($path, $base . '/', strlen($base) + 1) !== 0)) {
				return null;
			}
			$path = substr($path, strlen($base));
		}
		$path = '/' . trim($path, '/');
		return preg_match('#^/[a-z0-9/_-]*$#', $path) ? $path : null;
	}

	/* A safe local redirect target (sign-in "next"): a WebUI page, never another host. */
	public static function next(?string $target): string {
		$target = (string)$target;
		$path = (string)parse_url($target, PHP_URL_PATH);
		if (($target === '') || ($target[0] !== '/') || (strncmp($target, '//', 2) === 0) || (strpos($target, '\\') !== false) ||
		    (self::route($path) === null)) {
			return self::page('/');
		}
		return $target;
	}

	private static function foreign(string $route): bool {
		return (strncmp($route, '/api/', 5) === 0) || (strncmp($route, '/ui/', 4) === 0) || (strncmp($route, '/themes/', 8) === 0) ||
		    ((FS_WEBUI_BASE !== '') && (($route === FS_WEBUI_BASE) || (strncmp($route, FS_WEBUI_BASE . '/', strlen(FS_WEBUI_BASE) + 1) === 0)));
	}
}
