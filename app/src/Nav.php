<?php
/*
 * Nav.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI;

/*
 * The navigation model (app/nav.json, docs/NAVIGATION.md) for one user:
 * entries the user may not open, and package entries whose package is not
 * installed, are left out; a multi-page feature keeps the pages that remain.
 * Renders the top-bar areas with their mega dropdowns, the phone drawer and
 * the card menu. The markup matches gallery/app/render.mjs and app-shell.js.
 */
final class Nav {
	private array $model;
	private ?array $at = null;

	/* @param callable $allowed fn(array $entry): bool */
	public function __construct(array $raw, callable $allowed) {
		$this->model = self::filter($raw, $allowed);
	}

	public static function load(): array {
		$nav = json_decode((string)file_get_contents(FS_WEBUI_APP . '/nav.json'), true);
		return is_array($nav) ? $nav : array('areas' => array());
	}

	/* Every route of the model with its entry (pages included), for privilege checks and placeholders. */
	public static function entries(array $raw): array {
		$out = array();
		foreach ($raw['areas'] as $a) {
			if (isset($a['href'])) {
				$out[$a['href']] = $a + array('area' => $a['id']);
			}
			foreach ($a['groups'] ?? array() as $g) {
				foreach ($g['items'] as $it) {
					$out[$it['href']] = $it + array('area' => $a['id']);
					foreach ($it['pages'] ?? array() as $p) {
						$out[$p['href']] = $p + array('area' => $a['id']);
					}
				}
			}
		}
		foreach ($raw['other'] ?? array() as $o) {
			$out[$o['href']] = $o + array('area' => '');
		}
		return $out;
	}

	private static function filter(array $raw, callable $allowed): array {
		$out = array('areas' => array(), 'other' => array());
		foreach ($raw['areas'] as $a) {
			if (isset($a['href'])) {
				if ($allowed($a)) {
					$out['areas'][] = self::linked($a);
				}
				continue;
			}
			$groups = array();
			foreach ($a['groups'] ?? array() as $g) {
				$items = array();
				foreach ($g['items'] as $it) {
					if (isset($it['pages'])) {
						$it['pages'] = array_values(array_map(array(self::class, 'linked'), array_filter($it['pages'], $allowed)));
						if (empty($it['pages'])) {
							continue;
						}
						/* The feature opens on its first page the user may see. */
						if (!$allowed($it)) {
							$it['href'] = $it['pages'][0]['href'];
						} else {
							$it = self::linked($it);
						}
						$items[] = $it;
					} elseif ($allowed($it)) {
						$items[] = self::linked($it);
					}
				}
				if ($items) {
					$g['items'] = $items;
					$groups[] = $g;
				}
			}
			if ($groups) {
				$a['groups'] = $groups;
				$out['areas'][] = $a;
			}
		}
		foreach ($raw['other'] ?? array() as $o) {
			if ($allowed($o)) {
				$out['other'][] = self::linked($o);
			}
		}
		return $out;
	}

	/* Public view of an entry: href under the WebUI base, no privilege/package internals. */
	private static function linked(array $e): array {
		unset($e['priv'], $e['package']);
		$e['href'] = Url::page($e['href']);
		return $e;
	}

	/* The model sent to the browser (<script id="fs-nav">). */
	public function model(): array {
		return $this->model;
	}

	/* URL of the first page in the menus, or null when the user may open none. */
	public function first(): ?string {
		foreach ($this->model['areas'] as $a) {
			if (isset($a['href'])) {
				return $a['href'];
			}
			return $a['groups'][0]['items'][0]['href'];
		}
		return null;
	}

	/* Where a route lives: ['area' => …, 'item' => …, 'page' => …], or null. */
	public function locate(string $route): ?array {
		$href = Url::page($route);
		foreach ($this->model['areas'] as $a) {
			if (isset($a['href']) && ($a['href'] === $href)) {
				return $this->at = array('area' => $a, 'item' => null, 'page' => null);
			}
			foreach ($a['groups'] ?? array() as $g) {
				foreach ($g['items'] as $it) {
					foreach ($it['pages'] ?? array() as $p) {
						if ($p['href'] === $href) {
							return $this->at = array('area' => $a, 'item' => $it, 'page' => $p);
						}
					}
					if ($it['href'] === $href) {
						return $this->at = array('area' => $a, 'item' => $it, 'page' => null);
					}
				}
			}
		}
		foreach ($this->model['other'] as $o) {
			if ($o['href'] === $href) {
				return $this->at = array('area' => null, 'item' => $o, 'page' => null);
			}
		}
		return $this->at = null;
	}

	public function areas(): string {
		$out = '';
		foreach ($this->model['areas'] as $a) {
			$on = ($this->at !== null) && (($this->at['area']['id'] ?? null) === $a['id']);
			if (!isset($a['groups'])) {
				$out .= '<a class="fs-area' . ($on ? ' is-active' : '') . '" data-fs-nav data-fs-area="' . Html::e($a['id']) . '" href="' . Html::e($a['href']) . '"' .
				    ($on ? ' aria-current="page"' : '') . '>' . Html::icon($a['icon']) . '<span>' . Html::e($a['title']) . '</span></a>';
				continue;
			}
			$out .= '<div class="fs-area-wrap"><button type="button" class="fs-area' . ($on ? ' is-active' : '') . '" data-fs-area="' . Html::e($a['id']) .
			    '" aria-expanded="false" aria-controls="fs-mega-' . Html::e($a['id']) . '">' . Html::icon($a['icon']) . '<span>' . Html::e($a['title']) .
			    '</span><i class="fa-solid fa-chevron-down fs-area-caret" aria-hidden="true"></i></button>' . $this->mega($a) . '</div>';
		}
		return $out;
	}

	private function mega(array $a): string {
		$groups = '';
		foreach ($a['groups'] as $g) {
			$groups .= '<section class="fs-mega-group"><h3 class="fs-mega-group-title">' . Html::icon($g['icon']) . Html::e($g['title']) . '</h3><ul>';
			foreach ($g['items'] as $it) {
				$cur = ($this->at !== null) && (($this->at['item']['href'] ?? null) === $it['href']);
				$groups .= '<li><a class="fs-mega-link" data-fs-nav href="' . Html::e($it['href']) . '"' . ($cur ? ' aria-current="page"' : '') . '>' .
				    Html::icon($it['icon']) . '<span>' . Html::e($it['title']) . '</span>' .
				    (isset($it['pages']) ? '<small>' . Html::e(sprintf(gettext('%d pages'), count($it['pages']))) . '</small>' : '') . '</a></li>';
			}
			$groups .= '</ul></section>';
		}
		$title = Html::e($a['title']);
		return '<div class="fs-mega" id="fs-mega-' . Html::e($a['id']) . '" role="region" aria-label="' . $title . '" hidden>' .
		    '<div class="fs-mega-head"><h2 class="fs-mega-title">' . Html::icon($a['icon']) . $title . '</h2>' .
		    '<label class="fs-mega-filter"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" placeholder="' .
		    Html::e(sprintf(gettext('Filter %s…'), $a['title'])) . '" aria-label="' . Html::e(sprintf(gettext('Filter %s pages'), $a['title'])) .
		    '" autocomplete="off"></label></div><div class="fs-mega-body">' . $groups . '</div><p class="fs-mega-empty" hidden>' .
		    Html::e(sprintf(gettext('No %s pages match.'), $a['title'])) . '</p></div>';
	}

	public function drawer(): string {
		$out = '<div class="fs-navdrawer-head"><span class="fs-brand-mark" aria-hidden="true">FS</span><strong>FreeSense</strong>' .
		    '<button type="button" class="fs-tb-btn" data-fs-shell="drawer-close" aria-label="' . Html::e(gettext('Close menu')) . '">' .
		    '<i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>';
		foreach ($this->model['areas'] as $a) {
			if (!isset($a['groups'])) {
				$out .= '<a class="fs-navdrawer-area" data-fs-nav href="' . Html::e($a['href']) . '">' . Html::icon($a['icon']) . '<span>' . Html::e($a['title']) . '</span></a>';
				continue;
			}
			$open = ($this->at !== null) && (($this->at['area']['id'] ?? null) === $a['id']);
			$out .= '<details class="fs-navdrawer-group"' . ($open ? ' open' : '') . '><summary class="fs-navdrawer-area">' . Html::icon($a['icon']) .
			    '<span>' . Html::e($a['title']) . '</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary>';
			foreach ($a['groups'] as $g) {
				$out .= '<div class="fs-navdrawer-sub">' . Html::e($g['title']) . '</div>';
				foreach ($g['items'] as $it) {
					$cur = ($this->at !== null) && (($this->at['item']['href'] ?? null) === $it['href']);
					$out .= '<a class="fs-navdrawer-link" data-fs-nav href="' . Html::e($it['href']) . '"' . ($cur ? ' aria-current="page"' : '') . '>' . Html::e($it['title']) . '</a>';
				}
			}
			$out .= '</details>';
		}
		return $out;
	}

	/* The card menu of a multi-page feature, or '' (full-width layout). */
	public function menu(): string {
		$it = $this->at['item'] ?? null;
		if (!$it || empty($it['pages'])) {
			return '';
		}
		$out = '<div class="fs-pagemenu-head">' . Html::icon($it['icon']) . '<h2 class="fs-pagemenu-title">' . Html::e($it['title']) . '</h2></div><ul class="fs-pagemenu-list">';
		foreach ($it['pages'] as $p) {
			$cur = ($this->at['page']['href'] ?? null) === $p['href'];
			$out .= '<li><a class="fs-pagemenu-item" data-fs-nav href="' . Html::e($p['href']) . '"' . ($cur ? ' aria-current="page"' : '') . '>' .
			    Html::icon($p['icon']) . '<span>' . Html::e($p['title']) . '</span></a></li>';
		}
		return $out . '</ul>';
	}

	public function menuTitle(): string {
		$it = $this->at['item'] ?? null;
		return ($it && !empty($it['pages'])) ? (string)$it['title'] : '';
	}

	public function areaId(): string {
		return (string)($this->at['area']['id'] ?? '');
	}

	/* Breadcrumb of the current location: area / feature (multi-page) / page. */
	public function crumbs(): array {
		$out = array();
		if (!empty($this->at['area']['groups'])) {
			$out[] = array((string)$this->at['area']['title']);
		}
		if (!empty($this->at['page'])) {
			$out[] = array((string)$this->at['item']['title'], (string)$this->at['item']['href']);
		}
		return $out;
	}
}
