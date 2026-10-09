<?php
/*
 * App.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI;

use FreeSense\WebUI\Pages\NotBuilt;

/*
 * The router. /signin is public; every other route needs a usable GUI
 * session and the privilege its navigation entry (or page class) names.
 * Pages render as frames: the shell plus element containers.
 */
final class App {
	public static function run(): void {
		$method = (string)($_SERVER['REQUEST_METHOD'] ?? 'GET');
		$route = Url::route((string)parse_url((string)($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH));
		header('X-Content-Type-Options: nosniff');
		header('Referrer-Policy: same-origin');
		header('Cache-Control: no-store');

		if ($route === null) {
			self::plain(404, gettext('Page not found.'));
			return;
		}
		if (!defined('RESTAPI_LEVEL') || (RESTAPI_LEVEL < FS_WEBUI_API_LEVEL)) {
			self::plain(503, sprintf(gettext('This WebUI needs FreeSense REST API level %d; this firewall has level %d. Update FreeSense.'),
			    FS_WEBUI_API_LEVEL, defined('RESTAPI_LEVEL') ? RESTAPI_LEVEL : 0));
			return;
		}
		if ($route === '/signin') {
			SignIn::handle($method);
			return;
		}

		$session = Session::current();
		if ($session === null) {
			self::redirect(Url::page('/signin') . '?next=' . rawurlencode((string)($_SERVER['REQUEST_URI'] ?? '')));
			return;
		}
		if (($method !== 'GET') && ($method !== 'HEAD')) {
			header('Allow: GET, HEAD');
			self::plain(405, gettext('Pages are only read; changes go through the API.'));
			return;
		}

		$raw = Nav::load();
		$allowed = function (array $entry) use ($session): bool {
			if (!empty($entry['package']) && !is_package_installed((string)$entry['package'])) {
				return false;
			}
			return $session->may(array_key_exists('priv', $entry) ? $entry['priv'] : 'page-all');
		};
		$nav = new Nav($raw, $allowed);
		$entries = Nav::entries($raw);
		/* The page serving the route, and the navigation entry it belongs to (sub-routes belong to their page's entry). */
		$class = null;
		$params = array();
		foreach (require FS_WEBUI_APP . '/pages.php' as $candidate) {
			if (($p = $candidate::match($route)) !== null) {
				list($class, $params) = array($candidate, $p);
				break;
			}
		}
		$home = ($class !== null) ? $class::ROUTE : $route;

		$status = 200;
		if (isset($entries[$home]) && !empty($entries[$home]['package']) && !is_package_installed((string)$entries[$home]['package'])) {
			$status = 404;
		} elseif (isset($entries[$home])) {
			$entry = $entries[$home];
			$class = $class ?? NotBuilt::class;
			if (!$allowed($entry)) {
				$status = 403;
			}
		} elseif ($class !== null) {
			$entry = array('title' => '', 'priv' => $class::PRIV);
			if (!$allowed($entry)) {
				$status = 403;
			}
		} else {
			$status = 404;
		}

		/* Users without the dashboard start on the first page they may open. */
		if (($route === '/') && ($status === 403) && (($first = $nav->first()) !== null)) {
			self::redirect($first);
			return;
		}

		$nav->locate($home);
		$ui = new Ui(Assets::elements());
		if ($status === 200) {
			try {
				$page = new $class($session, $nav, $entry, $params);
				$page->build($ui);
				$title = $page->title();
			} catch (\Throwable $e) {
				log_error(sprintf('WebUI: page %s failed: %s', $route, $e->getMessage()));
				$status = 500;
				$ui = new Ui(Assets::elements());
			}
		}
		if ($status !== 200) {
			$title = self::message($ui, $status);
		}

		http_response_code($status);
		header('Content-Type: text/html; charset=utf-8');
		echo Shell::render($session, $nav, $route, $title, $ui->html());
	}

	/* A 403/404/500 page inside the shell. Returns its title. */
	private static function message(Ui $ui, int $status): string {
		$m = array(
			403 => array('lock', gettext('No access'), gettext('Your account does not have the privilege for this page. An administrator can grant it in System > Users & groups.')),
			404 => array('map-signs', gettext('Page not found'), gettext('This address does not exist in FreeSense. Use the menu or search to find the page.')),
			500 => array('triangle-exclamation', gettext('This page failed'), gettext('Something went wrong while building this page; the details are in the system log.')),
		)[$status];
		$ui->add($ui->pageHeader($m[1]), $ui->emptyState(array('icon' => $m[0], 'title' => $m[1], 'text' => $m[2], 'size' => 'lg',
		    'action' => array('label' => gettext('Go to the dashboard'), 'icon' => 'gauge-high', 'href' => Url::page('/')))));
		return $m[1];
	}

	public static function redirect(string $to): void {
		http_response_code(303);
		header('Location: ' . $to);
	}

	public static function plain(int $status, string $text): void {
		http_response_code($status);
		header('Content-Type: text/plain; charset=utf-8');
		echo $text, "\n";
	}
}
