<?php
/*
 * Page.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI;

/*
 * A page: a short definition that composes catalogue elements (docs/PAGES.md).
 * Special pages extend Page and write build(); the patterns (ResourcePage,
 * SettingsPage, …) will build from their constants.
 *
 * Where a page sits in the menus, and the privilege that opens it, come
 * from app/nav.json (one source for menus and access); a page class only
 * overrides PRIV for routes that are not in the navigation.
 */
abstract class Page {
	const ROUTE = '';
	const TITLE = '';
	const PRIV = null;

	protected Session $session;
	protected Nav $nav;
	protected array $entry;
	/* What match() found in the route (patterns: view, key). */
	protected array $params;

	public function __construct(Session $session, Nav $nav, array $entry, array $params = array()) {
		$this->session = $session;
		$this->nav = $nav;
		$this->entry = $entry;
		$this->params = $params;
	}

	/* Does this page serve $route? Parameters for the page, or null. Patterns add sub-routes (ResourcePage: /new, /edit/{key}). */
	public static function match(string $route): ?array {
		return ($route === static::ROUTE) ? array() : null;
	}

	public function title(): string {
		return (static::TITLE !== '') ? gettext(static::TITLE) : (string)($this->entry['title'] ?? '');
	}

	abstract public function build(Ui $ui): void;

	/* The standard page header: breadcrumb from the navigation, then the title. */
	protected function header(Ui $ui): Element {
		return $ui->pageHeader($this->title())->breadcrumb($this->nav->crumbs());
	}
}
