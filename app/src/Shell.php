<?php
/*
 * Shell.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI;

/* Renders the page frame around a page's elements, in the user's theme style. */
final class Shell {
	public static function render(Session $session, Nav $nav, string $route, string $title, string $main): string {
		$p = self::style(webui_prefs_get($session->username()));
		$layout = ($nav->menu() !== '') ? 'menu' : 'full';
		return self::template('shell', $p + array(
			'title' => $title,
			'host' => self::host(),
			'csrf' => $session->csrf(),
			'login' => Url::page('/signin'),
			'home' => Url::page('/'),
			'layout' => $layout,
			'area' => $nav->areaId(),
			'page' => ltrim($route, '/') ?: 'dashboard',
			'areas' => $nav->areas(),
			'drawer' => $nav->drawer(),
			'menu' => $nav->menu(),
			'menuTitle' => $nav->menuTitle(),
			'main' => $main,
			'nav' => $nav->model(),
			'signOut' => array('path' => '/v1/me/signout', 'redirect' => Url::page('/signin')),
			'profileLinks' => array('profile' => Url::page('/me'), 'appearance' => Url::page('/me') . '#appearance', 'sessions' => Url::page('/me') . '#sessions'),
			'js' => Assets::url('ui/fs-ui.js'),
		));
	}

	/* Theme, mode, accent, density and skin from the user's preferences, falling back to the defaults of the theme. */
	public static function style(array $prefs): array {
		$themes = Assets::themes();
		$theme = in_array($prefs['theme'] ?? '', $themes, true) ? $prefs['theme'] : (in_array('freesense', $themes, true) ? 'freesense' : ($themes[0] ?? 'freesense'));
		$meta = Assets::theme($theme);
		$mode = in_array($prefs['mode'] ?? '', array('light', 'dark', 'auto'), true) ? $prefs['mode'] : (string)($meta['defaultMode'] ?? 'auto');
		$accents = is_array($meta['accents'] ?? null) ? $meta['accents'] : array();
		$accent = isset($accents[$prefs['accent'] ?? '']) ? $prefs['accent'] : (string)($meta['defaultAccent'] ?? array_key_first($accents) ?? '');
		$skin = (is_array($meta['skin'] ?? null) ? $meta['skin'] : array()) +
		    array('topbar' => 'surface', 'sectionMenu' => 'surface', 'cards' => 'outlined', 'tables' => 'lines', 'buttons' => 'rounded');
		return array(
			'lang' => 'en',
			'theme' => $theme,
			'mode' => $mode,
			'bsTheme' => ($mode === 'dark') ? 'dark' : 'light',
			'accent' => $accent,
			'density' => in_array($prefs['density'] ?? '', array('comfortable', 'compact'), true) ? $prefs['density'] : 'comfortable',
			'skin' => $skin,
			'css' => Assets::url('ui/fs-ui.css'),
			'themeCss' => Assets::url("themes/{$theme}/theme.css"),
		);
	}

	public static function host(): string {
		return trim(config_get_path('system/hostname', '') . '.' . config_get_path('system/domain', ''), '.') ?: 'FreeSense';
	}

	public static function template(string $name, array $v): string {
		ob_start();
		try {
			include FS_WEBUI_APP . "/templates/{$name}.php";
		} finally {
			$out = (string)ob_get_clean();
		}
		return $out;
	}
}
