<?php
/*
 * Interfaces.php
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
 * Network › Interfaces: every assigned interface with its addressing, and an
 * editor for one (GET/PUT /v1/interfaces/config/{name}, schema
 * interfaces/config). Saved changes wait behind the apply bar; applying
 * reconfigures the interfaces at once ({"confirm": true}), like the 1.x page.
 *   /network/interfaces              the list
 *   /network/interfaces/edit/{name}  one interface
 * Interfaces are added and removed under Assignments.
 */
final class Interfaces extends Page {
	const ROUTE = '/network/interfaces';
	const TITLE = 'Interfaces';

	public static function match(string $route): ?array {
		if ($route === static::ROUTE) {
			return array('view' => 'list');
		}
		if (preg_match('#^' . preg_quote(static::ROUTE, '#') . '/edit/([A-Za-z0-9_]{1,32})$#', $route, $m)) {
			return array('view' => 'edit', 'name' => $m[1]);
		}
		return null;
	}

	public function title(): string {
		return (($this->params['view'] ?? 'list') === 'edit') ? strtoupper((string)$this->params['name']) : parent::title();
	}

	public function build(Ui $ui): void {
		$apply = $ui->applyBar()
			->source(array('path' => '/v1/interfaces/config/pending'))
			->apply(array('method' => 'POST', 'path' => '/v1/interfaces/config/apply', 'body' => array('confirm' => true)))
			->text(gettext('Interface changes are pending'))
			->detail(gettext('They are saved. Applying reconfigures the changed interfaces, which briefly interrupts their traffic.'))
			->match('/interfaces/config');
		if (($this->params['view'] ?? 'list') === 'edit') {
			$this->buildEditor($ui, $apply);
		} else {
			$this->buildList($ui, $apply);
		}
	}

	private function buildList(Ui $ui, $apply): void {
		$edit = Url::page(static::ROUTE . '/edit/{name}');
		$types = array(
			'none' => array('label' => gettext('None'), 'tone' => 'neutral'),
			'staticv4' => array('label' => gettext('Static'), 'tone' => 'accent'), 'staticv6' => array('label' => gettext('Static'), 'tone' => 'accent'),
			'dhcp' => array('label' => 'DHCP', 'tone' => 'info'), 'dhcp6' => array('label' => 'DHCP6', 'tone' => 'info'),
			'slaac' => array('label' => 'SLAAC', 'tone' => 'info'), 'track6' => array('label' => gettext('Track'), 'tone' => 'info'),
			'ppp' => array('label' => 'PPP', 'tone' => 'warn'), 'pppoe' => array('label' => 'PPPoE', 'tone' => 'warn'),
			'pptp' => array('label' => 'PPTP', 'tone' => 'warn'), 'l2tp' => array('label' => 'L2TP', 'tone' => 'warn'),
			'6rd' => array('label' => '6rd', 'tone' => 'info'), '6to4' => array('label' => '6to4', 'tone' => 'info'),
		);
		$table = $ui->dataTable()
			->source(array('path' => '/v1/interfaces/config'))
			->key('name')
			->label(gettext('Interfaces'))
			->columns(array(
				array('field' => 'enable', 'label' => gettext('Status'), 'format' => 'status', 'variant' => 'dot', 'width' => '7rem', 'statusMap' => array(
					'true' => array('state' => 'ok', 'label' => gettext('Enabled')), 'false' => array('state' => 'neutral', 'label' => gettext('Disabled')))),
				array('field' => 'descr', 'label' => gettext('Interface'), 'primary' => true, 'sub' => 'port', 'sortable' => true),
				array('field' => 'ipv4_type', 'label' => 'IPv4', 'format' => 'badge', 'badgeMap' => $types),
				array('field' => 'ipv4_address', 'label' => gettext('IPv4 address'), 'mono' => true, 'sub' => 'ipv4_subnet'),
				array('field' => 'ipv6_type', 'label' => 'IPv6', 'format' => 'badge', 'badgeMap' => $types),
				array('field' => 'ipv6_address', 'label' => gettext('IPv6 address'), 'mono' => true, 'priority' => 3),
				array('field' => 'gateway', 'label' => gettext('Gateway'), 'priority' => 3),
				array('field' => 'mtu', 'label' => 'MTU', 'format' => 'num', 'priority' => 3),
			))
			->toolbar(array('search' => array('placeholder' => gettext('Search interfaces'))))
			->rowLink($edit)
			->rowActions(array(array('id' => 'edit', 'label' => gettext('Edit'), 'icon' => 'pen', 'inline' => true, 'href' => $edit)))
			->empty(array('icon' => 'ethernet', 'title' => gettext('No interfaces assigned'),
			    'action' => array('label' => gettext('Assign interfaces'), 'icon' => 'right-left', 'href' => Url::page('/network/assignments'))));
		$ui->add(
			$this->header($ui)->subtitle(gettext('Addressing and link settings of every assigned interface.'))
				->action('assign', gettext('Assignments'), 'right-left', '/network/assignments'),
			$apply,
			$table
		);
	}

	private function buildEditor(Ui $ui, $apply): void {
		$name = (string)$this->params['name'];
		$list = Url::page(static::ROUTE);
		$crumbs = $this->nav->crumbs();
		$crumbs[] = array(parent::title(), static::ROUTE);
		$ui->add(
			$ui->pageHeader($this->title())->breadcrumb($crumbs),
			$apply,
			$ui->form()
				->schemaSource(array('path' => '/v1/schema/interfaces/config'))
				->load(array('path' => '/v1/interfaces/config/' . rawurlencode($name)))
				->save(array('method' => 'PUT', 'path' => '/v1/interfaces/config/{name}', 'pending' => true))
				->successMessage(gettext('Saved. Apply the changes to reconfigure the interface.'))
				->cancelHref($list)
				->label($this->title())
		);
	}
}
