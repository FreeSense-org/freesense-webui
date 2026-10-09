<?php
/*
 * RuleListPage.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Patterns;

use FreeSense\WebUI\Page;
use FreeSense\WebUI\Ui;
use FreeSense\WebUI\Url;

/*
 * An ordered list of rules where the order matters (NAT mappings, …):
 *   ROUTE              the list: enable switch, drag to reorder, delete
 *   ROUTE/new          a new rule (POST)
 *   ROUTE/edit/{id}    a rule (GET "fields" + PUT)
 * Ids are positions, as in the API, so the table reloads after a reorder
 * or delete. Items carry "display" (texts for the columns) and "fields"
 * (the editor's values). Changes wait behind the apply bar.
 *
 *   final class NatOutbound extends RuleListPage {
 *       const ROUTE = '/security/nat-outbound';
 *       const API = '/v1/firewall/nat/outbound';
 *       const SCHEMA = 'firewall/nat_outbound';
 *       const APPLY = 'nat';
 *       const APPLY_PATH = '/v1/firewall/nat/apply';
 *       protected function columns(): array { return [...]; }
 *   }
 */
abstract class RuleListPage extends Page {
	/* The collection path ("/v1/firewall/nat/outbound"). */
	const API = '';
	/* Schema name below /v1/schema. */
	const SCHEMA = '';
	/* The firewall subsystem whose changes need Apply, and its apply route. */
	const APPLY = null;
	const APPLY_PATH = '';
	/* Empty-state icon. */
	const ICON = 'list';

	/* One item, lower case: "port forward". */
	abstract protected function noun(): string;

	/* data-table columns (after the enable switch). */
	abstract protected function columns(): array;

	/* The list's subtitle. */
	protected function subtitle(): string {
		return gettext('Rules are evaluated top down; the first match is used. Drag to change the order.');
	}

	/* Empty state text. */
	protected function emptyText(): string {
		return '';
	}

	/* Extra elements between the apply bar and the table (e.g. a mode setting). */
	protected function above(Ui $ui): array {
		return array();
	}

	/* Values of a new item. */
	protected function defaults(): array {
		return array();
	}

	public static function match(string $route): ?array {
		if ($route === static::ROUTE) {
			return array('view' => 'list');
		}
		if ($route === static::ROUTE . '/new') {
			return array('view' => 'new');
		}
		if (preg_match('#^' . preg_quote(static::ROUTE, '#') . '/edit/(\d{1,6})$#', $route, $m)) {
			return array('view' => 'edit', 'id' => $m[1]);
		}
		return null;
	}

	public function title(): string {
		switch ($this->params['view'] ?? 'list') {
			case 'new':
				return sprintf(gettext('New %s'), $this->noun());
			case 'edit':
				return sprintf(gettext('Edit %s'), $this->noun());
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

	protected function buildList(Ui $ui): void {
		$new = static::ROUTE . '/new';
		$edit = Url::page(static::ROUTE . '/edit/{id}');
		$table = $ui->dataTable()
			->source(array('path' => static::API))
			->key('id')
			->label(parent::title())
			->columns($this->columns())
			->toolbar(array('search' => array('placeholder' => sprintf(gettext('Search %s'), $this->plural()))))
			->toggle(array('field' => 'display.enabled', 'label' => gettext('Enabled'), 'method' => 'POST', 'path' => static::API . '/{id}/toggle', 'body' => (object)array()))
			->reorder(array('path' => static::API . '/order', 'idsKey' => 'order'))
			->rowLink($edit)
			->rowActions(array(
				array('id' => 'edit', 'label' => gettext('Edit'), 'icon' => 'pen', 'inline' => true, 'href' => $edit),
				array('id' => 'delete', 'label' => gettext('Delete'), 'icon' => 'trash', 'danger' => true, 'api' => array(
					'method' => 'DELETE',
					'path' => static::API . '/{id}',
					'pending' => static::APPLY !== null,
					'success' => sprintf(gettext('Deleted the %s'), $this->noun()),
					'confirm' => array('title' => sprintf(gettext('Delete this %s?'), $this->noun()), 'text' => gettext('This cannot be undone.'),
					    'confirmLabel' => gettext('Delete'), 'danger' => true),
				)),
			))
			->empty(array('icon' => static::ICON, 'title' => sprintf(gettext('No %s yet'), $this->plural()), 'text' => $this->emptyText(),
			    'action' => array('label' => sprintf(gettext('Add %s'), $this->noun()), 'icon' => 'plus', 'href' => Url::page($new))));
		$ui->add($this->header($ui)->subtitle($this->subtitle())->primary('add', sprintf(gettext('Add %s'), $this->noun()), 'plus', $new));
		if (static::APPLY !== null) {
			$ui->add($ui->applyBar()->only(static::APPLY)->apply(array('method' => 'POST', 'path' => static::APPLY_PATH))->match(static::API));
		}
		foreach ($this->above($ui) as $el) {
			$ui->add($el);
		}
		$ui->add($table);
	}

	protected function buildEditor(Ui $ui): void {
		$list = Url::page(static::ROUTE);
		$crumbs = $this->nav->crumbs();
		$crumbs[] = array(parent::title(), static::ROUTE);
		$form = $ui->form()
			->schemaSource(array('path' => '/v1/schema/' . static::SCHEMA))
			->summary(true)
			->cancelHref($list)
			->successHref($list)
			->label($this->title());
		if ($this->params['view'] === 'new') {
			if ($this->defaults()) {
				$form->values($this->defaults());
			}
			$form->save(array('method' => 'POST', 'path' => static::API));
		} else {
			$form->load(array('path' => static::API . '/' . (int)$this->params['id'], 'field' => 'fields'))
				->save(array('method' => 'PUT', 'path' => static::API . '/{id}'));
		}
		$ui->add($ui->pageHeader($this->title())->breadcrumb($crumbs), $form);
	}

	protected function plural(): string {
		return $this->noun() . 's';
	}
}
