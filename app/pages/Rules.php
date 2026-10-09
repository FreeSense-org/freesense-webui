<?php
/*
 * Rules.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Page;
use FreeSense\WebUI\Ui;
use FreeSense\WebUI\Url;

/*
 * Firewall rules, one page per rule tab (Floating, then every interface and
 * group, from GET /v1/firewall/rules/tabs):
 *   /security/rules                  the LAN rules
 *   /security/rules/{tab}            the rules of a tab: toggle, drag to reorder, delete
 *   /security/rules/{tab}/new        a new rule on that tab
 *   /security/rules/{tab}/edit/{id}  a rule (ids are positions, as in the API)
 * Changes wait behind the apply bar, like the 1.x page.
 */
final class Rules extends Page {
	const ROUTE = '/security/rules';
	const TITLE = 'Rules';
	const DEFAULT_TAB = 'lan';

	private const TAB = '[A-Za-z0-9_.-]{1,32}';

	public static function match(string $route): ?array {
		if ($route === static::ROUTE) {
			return array('view' => 'list', 'tab' => static::DEFAULT_TAB);
		}
		$tab = self::TAB;
		$base = preg_quote(static::ROUTE, '#');
		if (preg_match("#^{$base}/({$tab})$#", $route, $m)) {
			return array('view' => 'list', 'tab' => $m[1]);
		}
		if (preg_match("#^{$base}/({$tab})/new$#", $route, $m)) {
			return array('view' => 'new', 'tab' => $m[1]);
		}
		if (preg_match("#^{$base}/({$tab})/edit/(\d{1,6})$#", $route, $m)) {
			return array('view' => 'edit', 'tab' => $m[1], 'id' => $m[2]);
		}
		return null;
	}

	private function floating(): bool {
		return strtolower((string)$this->params['tab']) === 'floating';
	}

	private function tabRoute(): string {
		return static::ROUTE . '/' . $this->params['tab'];
	}

	public function title(): string {
		switch ($this->params['view'] ?? 'list') {
			case 'new':
				return $this->floating() ? gettext('New floating rule') : gettext('New rule');
			case 'edit':
				return $this->floating() ? gettext('Edit floating rule') : gettext('Edit rule');
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

	private function buildList(Ui $ui): void {
		$tab = (string)$this->params['tab'];
		$new = $this->tabRoute() . '/new';
		$edit = static::ROUTE . '/{display.tab}/edit/{id}';
		$actions = array();
		foreach (array('pass' => array('Pass', 'ok', 'circle-check'), 'block' => array('Block', 'crit', 'ban'),
		    'reject' => array('Reject', 'warn', 'circle-xmark'), 'match' => array('Match', 'info', 'tag')) as $type => $b) {
			$actions[$type] = array('label' => gettext($b[0]), 'tone' => $b[1], 'icon' => $b[2]);
		}
		$columns = array(
			array('field' => 'type', 'label' => gettext('Action'), 'format' => 'badge', 'badgeMap' => $actions, 'width' => '7rem'),
			array('field' => 'descr', 'label' => gettext('Description'), 'primary' => true, 'sub' => 'display.protocol'),
			array('field' => 'display.source', 'label' => gettext('Source'), 'mono' => true, 'sub' => 'display.source_port'),
			array('field' => 'display.destination', 'label' => gettext('Destination'), 'mono' => true),
			array('field' => 'display.destination_port', 'label' => gettext('Port'), 'mono' => true),
			array('field' => 'display.gateway', 'label' => gettext('Gateway'), 'priority' => 3),
			array('field' => 'display.schedule', 'label' => gettext('Schedule'), 'priority' => 3),
		);
		if ($this->floating()) {
			array_splice($columns, 1, 0, array(array('field' => 'display.interfaces', 'label' => gettext('Interfaces'))));
		}
		$table = $ui->dataTable()
			->source(array('path' => '/v1/firewall/rules', 'query' => array('interface' => $tab)))
			->key('id')
			->label($this->floating() ? gettext('Floating rules') : gettext('Rules'))
			->columns($columns)
			->toolbar(array(
				'search' => array('placeholder' => gettext('Search rules')),
				'filters' => array(array('id' => 'interface', 'label' => gettext('Interface'), 'all' => false, 'value' => $tab,
				    'href' => Url::page(static::ROUTE . '/{value}'),
				    'options' => array('source' => array('path' => '/v1/firewall/rules/tabs'), 'value' => 'id', 'label' => 'label', 'count' => 'count'))),
			))
			->toggle(array('field' => 'display.enabled', 'label' => gettext('Enabled'), 'method' => 'POST', 'path' => '/v1/firewall/rules/{id}/toggle', 'body' => (object)array()))
			->reorder(array('path' => '/v1/firewall/rules/order', 'params' => array('interface'), 'idsKey' => 'order'))
			->rowLink(Url::page($edit))
			->rowActions(array(
				array('id' => 'edit', 'label' => gettext('Edit'), 'icon' => 'pen', 'inline' => true, 'href' => Url::page($edit)),
				array('id' => 'delete', 'label' => gettext('Delete'), 'icon' => 'trash', 'danger' => true, 'api' => array(
					'method' => 'DELETE',
					'path' => '/v1/firewall/rules/{id}',
					'pending' => true,
					'success' => gettext('Rule deleted'),
					'confirm' => array('title' => gettext('Delete this rule?'), 'text' => gettext('Traffic it matched falls through to the next rules.'),
					    'confirmLabel' => gettext('Delete'), 'danger' => true),
				)),
			))
			->empty(array('icon' => 'shield-halved', 'title' => gettext('No rules on this interface'),
			    'text' => gettext('Without rules, traffic arriving here is blocked by the default deny rule.'),
			    'action' => array('label' => gettext('Add rule'), 'icon' => 'plus', 'href' => Url::page($new))));
		$ui->add(
			$this->header($ui)->subtitle(gettext('Rules are evaluated top down; the first match decides. Drag to change the order.'))
				->primary('add', gettext('Add rule'), 'plus', $new),
			$ui->applyBar()->only('rules')->apply(array('method' => 'POST', 'path' => '/v1/firewall/rules/apply'))->match('/firewall/rules'),
			$table
		);
	}

	private function buildEditor(Ui $ui): void {
		$list = Url::page($this->tabRoute());
		$crumbs = $this->nav->crumbs();
		$crumbs[] = array(parent::title(), $this->tabRoute());
		$form = $ui->form()
			->schemaSource(array('path' => '/v1/schema/firewall/' . ($this->floating() ? 'floating_rules' : 'rules')))
			->summary(true)
			->cancelHref($list)
			->successHref($list)
			->label($this->title());
		if ($this->params['view'] === 'new') {
			$save = array('method' => 'POST', 'path' => '/v1/firewall/rules');
			if ($this->floating()) {
				$save['body'] = array('floating' => true);
				$form->values(array('interface' => array(), 'direction' => 'any'));
			} else {
				$form->values(array('interface' => (string)$this->params['tab']));
			}
			$form->save($save);
		} else {
			$form->load(array('path' => '/v1/firewall/rules/' . (int)$this->params['id'], 'field' => 'fields'))
				->save(array('method' => 'PUT', 'path' => '/v1/firewall/rules/{id}'));
		}
		$ui->add($ui->pageHeader($this->title())->breadcrumb($crumbs), $form);
	}
}
