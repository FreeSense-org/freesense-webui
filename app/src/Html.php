<?php
/*
 * Html.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI;

/* Escaping helpers. Every value that reaches markup goes through one of these. */
final class Html {
	public static function e($value): string {
		return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
	}

	/* JSON for an HTML attribute (escape the result with e()). */
	public static function json($value): string {
		return (string)json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
	}

	/* JSON inside <script type="application/json">: nothing can close the tag. */
	public static function scriptJson($value): string {
		return (string)json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE |
		    JSON_HEX_TAG | JSON_HEX_AMP);
	}

	public static function icon(string $name): string {
		return '<i class="fa-solid fa-' . self::e($name) . '" aria-hidden="true"></i>';
	}

	/* An element container: FS.el renders it from its config. */
	public static function element(string $name, array $config, array $attrs = array()): string {
		$out = '<div data-fs-el="' . self::e($name) . '"';
		if (!empty($config)) {
			$out .= ' data-fs-config="' . self::e(self::json($config)) . '"';
		}
		foreach ($attrs as $k => $v) {
			$out .= ' ' . self::e($k) . '="' . self::e($v) . '"';
		}
		return $out . '></div>';
	}
}
