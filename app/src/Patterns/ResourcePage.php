<?php
/*
 * ResourcePage.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Patterns;

use FreeSense\WebUI\Element;
use FreeSense\WebUI\Page;
use FreeSense\WebUI\Ui;
use FreeSense\WebUI\Url;

/*
 * One API resource with a list and an editor:
 *   ROUTE                the list (search, filters, live table, row actions)
 *   ROUTE/new            the editor for a new item (POST)
 *   ROUTE/edit/{key}     the editor for an item (GET + PUT)
 * Fields come from GET /api/v1/schema/{RESOURCE}. With APPLY, changes wait
 * behind the apply bar until the user applies them.
 *
 *   final class Aliases extends ResourcePage {
 *       const ROUTE = '/security/aliases';
 *       const RESOURCE = 'firewall/aliases';
 *       const KEY = 'name';
 *       protected function columns(): array { return [...]; }
 *   }
 */
abstract class ResourcePage extends Page {
	/* API path below /v1 and schema name. */
	const RESOURCE = '';
	/* The field that names an item (and its URL). */
	const KEY = 'name';
	/* The firewall subsystem whose changes need Apply ('aliases', 'rules', …), or null. */
	const APPLY = null;
	/* Schema name when it differs from RESOURCE (e.g. firewall/virtual_ips for firewall/virtual-ips). */
	const SCHEMA = null;
	/* The key of an item's editor values when the API nests them (e.g. "fields"), or null. */
	const LOAD_FIELD = null;

	/* One item, lower case: "alias". */
	abstract protected function noun(): string;

	/* data-table columns of the list. */
	abstract protected function columns(): array;

	/* data-table filters + toolbar filter definitions: [[toolbarFilter, tableFilter], …]. */
	protected function filters(): array {
		return array();
	}

	protected function sort(): ?array {
		return array('field' => static::KEY, 'dir' => 'asc');
	}

	public static function match(string $route): ?array {
		if ($route === static::ROUTE) {
			return array('view' => 'list');
		}
		if ($route === static::ROUTE . '/new') {
			return array('view' => 'new');
		}
		$prefix = static::ROUTE . '/edit/';
		if ((strncmp($route, $prefix, strlen($prefix)) === 0) && preg_match('/^[A-Za-z0-9_.-]{1,64}$/', substr($route, strlen($prefix)))) {
			return array('view' => 'edit', 'key' => substr($route, strlen($prefix)));
		}
		return null;
	}

	public function title(): string {
		switch ($this->params['view'] ?? 'list') {
			case 'new':
				return sprintf(gettext('New %s'), $this->noun());
			case 'edit':
				return (string)$this->params['key'];
			default:
				return parent::title();
		}
	}

	public function build(Ui $ui): void {
		if (($this->params['view'] ?? 'list') === 'list') {
			$this->buildList($ui);
		} else {
			$this->buildEditor($ui);
		}
	}

	protected function api(string $suffix = ''): string {
		return '/v1/' . static::RESOURCE . $suffix;
	}

	protected function buildList(Ui $ui): void {
		$new = static::ROUTE . '/new';
		$key = '{' . static::KEY . '}';
		$toolbar = array('search' => true);
		$tableFilters = array();
		foreach ($this->filters() as $f) {
			$toolbar['filters'][] = $f[0];
			$tableFilters[] = $f[1];
		}
		$table = $ui->dataTable()
			->source(array('path' => $this->api()))
			->key(static::KEY)
			->label(parent::title())
			->columns($this->columns())
			->toolbar($toolbar)
			->paging(array('mode' => 'client', 'size' => 25, 'sizes' => array(25, 50, 100)))
			->rowLink(Url::page(static::ROUTE . "/edit/{$key}"))
			->rowActions(array(
				array('id' => 'edit', 'label' => gettext('Edit'), 'icon' => 'pen', 'inline' => true, 'href' => Url::page(static::ROUTE . "/edit/{$key}")),
				array('id' => 'delete', 'label' => gettext('Delete'), 'icon' => 'trash', 'danger' => true, 'api' => array(
					'method' => 'DELETE',
					'path' => $this->api("/{$key}"),
					'pending' => static::APPLY !== null,
					'success' => sprintf(gettext('Deleted %s'), $key),
					'confirm' => array('title' => sprintf(gettext('Delete %s?'), $key), 'confirmLabel' => gettext('Delete'), 'danger' => true,
					    'text' => gettext('This cannot be undone.')),
				)),
			))
			->empty(array('icon' => 'inbox', 'title' => sprintf(gettext('No %s yet'), $this->plural()),
			    'action' => array('label' => sprintf(gettext('Add %s'), $this->noun()), 'icon' => 'plus', 'href' => Url::page($new))));
		if ($tableFilters) {
			$table->filters($tableFilters);
		}
		if ($this->sort() !== null) {
			$table->sort($this->sort());
		}
		$ui->add($this->header($ui)->primary('add', sprintf(gettext('Add %s'), $this->noun()), 'plus', $new));
		if (static::APPLY !== null) {
			$ui->add($this->applyBar($ui));
		}
		$ui->add($table);
	}

	protected function applyBar(Ui $ui): Element {
		return $ui->applyBar()
			->only(static::APPLY)
			->apply(array('method' => 'POST', 'path' => $this->api('/apply')))
			->match('/' . static::RESOURCE);
	}

	protected function buildEditor(Ui $ui): void {
		$list = Url::page(static::ROUTE);
		$crumbs = $this->nav->crumbs();
		$crumbs[] = array(parent::title(), static::ROUTE);
		$form = $ui->form()
			->schemaSource(array('path' => '/v1/schema/' . (static::SCHEMA ?? static::RESOURCE)))
			->cancelHref($list)
			->successHref($list)
			->label($this->title());
		if ($this->params['view'] === 'new') {
			$form->save(array('method' => 'POST', 'path' => $this->api()));
		} else {
			$load = array('path' => $this->api('/' . rawurlencode($this->params['key'])));
			if (static::LOAD_FIELD !== null) {
				$load['field'] = static::LOAD_FIELD;
			}
			$form->load($load)
				->save(array('method' => 'PUT', 'path' => $this->api('/{' . static::KEY . '}')));
		}
		$ui->add($ui->pageHeader($this->title())->breadcrumb($crumbs), $form);
	}

	protected function plural(): string {
		return $this->noun() . 's';
	}
}
