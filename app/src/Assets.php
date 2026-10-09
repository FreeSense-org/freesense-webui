<?php
/*
 * Assets.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI;

/*
 * The built engine and the installed themes: URLs cache-busted with the
 * hashes in ui/manifest.json, the element catalogue, theme skins.
 */
final class Assets {
	private static ?array $manifest = null;

	public static function manifest(): array {
		if (self::$manifest === null) {
			$m = json_decode((string)@file_get_contents(FS_WEBUI_PUBLIC . '/ui/manifest.json'), true);
			self::$manifest = is_array($m) ? $m : array();
		}
		return self::$manifest;
	}

	/* URL of a published file: 'ui/fs-ui.css' → '/ui/fs-ui.css?v=<hash>'. */
	public static function url(string $file): string {
		$hash = (string)(self::manifest()['files'][$file] ?? '');
		return '/' . $file . (($hash !== '') ? '?v=' . substr($hash, 0, 12) : '');
	}

	public static function version(): string {
		return (string)(self::manifest()['version'] ?? '0');
	}

	/* Names of the elements pages may use. */
	public static function elements(): array {
		return array_values(array_map('strval', (array)(self::manifest()['elements'] ?? array())));
	}

	/* Installed themes: built-in ones and theme packages (a folder with theme.css and theme.json). */
	public static function themes(): array {
		$out = array();
		foreach ((array)glob(FS_WEBUI_PUBLIC . '/themes/*/theme.json') as $file) {
			$name = basename(dirname($file));
			if (preg_match('/^[a-z][a-z0-9-]{1,39}$/', $name) && is_file(dirname($file) . '/theme.css')) {
				$out[] = $name;
			}
		}
		sort($out);
		return $out;
	}

	/* theme.json of an installed theme (accents, skin, …), or an empty array. */
	public static function theme(string $name): array {
		if (!in_array($name, self::themes(), true)) {
			return array();
		}
		$meta = json_decode((string)@file_get_contents(FS_WEBUI_PUBLIC . "/themes/{$name}/theme.json"), true);
		return is_array($meta) ? $meta : array();
	}
}
