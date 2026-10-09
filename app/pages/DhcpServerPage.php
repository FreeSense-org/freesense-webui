<?php
/*
 * DhcpServerPage.php
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
 * The DHCP (or DHCPv6) server, one per interface (/v1/services/dhcp[v6]/…):
 *   ROUTE                                   every interface with its server state
 *   ROUTE/{interface}                       the server's settings and its static mappings
 *   ROUTE/{interface}/mappings/new          a new static mapping
 *   ROUTE/{interface}/mappings/edit/{id}    a static mapping (ids are positions)
 * Changes wait behind the apply bar, like the 1.x pages.
 */
abstract class DhcpServerPage extends Page {
	/* 'dhcp' or 'dhcpv6' (API path and schema prefix). */
	const SERVICE = 'dhcp';

	private const IFACE = '[A-Za-z0-9_]{1,32}';

	public static function match(string $route): ?array {
		if ($route === static::ROUTE) {
			return array('view' => 'list');
		}
		$base = preg_quote(static::ROUTE, '#');
		$if = self::IFACE;
		if (preg_match("#^{$base}/({$if})$#", $route, $m)) {
			return array('view' => 'server', 'interface' => $m[1]);
		}
		if (preg_match("#^{$base}/({$if})/mappings/new$#", $route, $m)) {
			return array('view' => 'new', 'interface' => $m[1]);
		}
		if (preg_match("#^{$base}/({$if})/mappings/edit/(\d{1,6})$#", $route, $m)) {
			return array('view' => 'edit', 'interface' => $m[1], 'id' => $m[2]);
		}
		return null;
	}

	protected function v6(): bool {
		return static::SERVICE === 'dhcpv6';
	}

	protected function api(string $suffix = ''): string {
		return '/v1/services/' . static::SERVICE . $suffix;
	}

	private function iface(): string {
		return (string)($this->params['interface'] ?? '');
	}

	public function title(): string {
		switch ($this->params['view'] ?? 'list') {
			case 'server':
				return sprintf($this->v6() ? gettext('DHCPv6 server on %s') : gettext('DHCP server on %s'), strtoupper($this->iface()));
			case 'new':
				return gettext('New static mapping');
			case 'edit':
				return gettext('Edit static mapping');
			default:
				return parent::title();
		}
	}

	public function build(Ui $ui): void {
		$apply = $ui->applyBar()
			->source(array('path' => $this->api('/pending')))
			->apply(array('method' => 'POST', 'path' => $this->api('/apply')))
			->text($this->v6() ? gettext('DHCPv6 changes are pending') : gettext('DHCP changes are pending'))
			->match('/services/' . static::SERVICE . '/');
		switch ($this->params['view'] ?? 'list') {
			case 'server':
				$this->buildServer($ui, $apply);
				break;
			case 'new':
			case 'edit':
				$this->buildMapping($ui, $apply);
				break;
			default:
				$this->buildList($ui, $apply);
		}
	}

	private function buildList(Ui $ui, $apply): void {
		$server = Url::page(static::ROUTE . '/{interface}');
		$ui->add(
			$this->header($ui)->subtitle($this->v6()
				? gettext('Hand out IPv6 addresses and prefixes on interfaces with a static IPv6 address. Choose an interface to configure its server.')
				: gettext('Hand out addresses on interfaces with a static IPv4 address. Choose an interface to configure its server.')),
			$apply,
			$ui->dataTable()
				->source(array('path' => $this->api('/servers')))
				->key('interface')
				->label($this->v6() ? gettext('DHCPv6 servers') : gettext('DHCP servers'))
				->columns(array(
					array('field' => 'enabled', 'label' => gettext('Status'), 'format' => 'status', 'variant' => 'dot', 'width' => '8rem', 'statusMap' => array(
						'true' => array('state' => 'ok', 'label' => gettext('Running')), 'false' => array('state' => 'neutral', 'label' => gettext('Off')))),
					array('field' => 'description', 'label' => gettext('Interface'), 'primary' => true, 'sub' => 'subnet'),
					array('field' => 'range', 'label' => gettext('Address range'), 'mono' => true),
					array('field' => 'static_count', 'label' => gettext('Static mappings'), 'format' => 'num'),
					array('field' => 'available', 'label' => gettext('Available'), 'format' => 'bool', 'priority' => 3),
				))
				->rowLink($server)
				->rowActions(array(array('id' => 'edit', 'label' => gettext('Configure'), 'icon' => 'pen', 'inline' => true, 'href' => $server, 'when' => array('field' => 'available', 'value' => true))))
				->empty(array('icon' => 'ethernet', 'title' => gettext('No interfaces'), 'text' => gettext('Assign an interface with a static address first.')))
		);
	}

	private function buildServer(Ui $ui, $apply): void {
		$if = $this->iface();
		$route = static::ROUTE . '/' . $if;
		$crumbs = $this->nav->crumbs();
		$crumbs[] = array(parent::title(), static::ROUTE);
		$edit = Url::page($route . '/mappings/edit/{id}');
		$v6 = $this->v6();
		$mappings = $ui->dataTable()
			->source(array('path' => $this->api('/servers/' . rawurlencode($if) . '/static-mappings')))
			->key('id')
			->label(gettext('Static mappings'))
			->reloadOn('fs:saved')
			->columns(array(
				array('field' => 'display.hostname', 'label' => gettext('Host name'), 'primary' => true, 'sub' => 'display.description'),
				array('field' => $v6 ? 'display.duid' : 'display.mac', 'label' => $v6 ? 'DUID' : gettext('MAC address'), 'mono' => true),
				array('field' => 'display.ip', 'label' => gettext('Address'), 'mono' => true),
			))
			->toolbar(array('search' => array('placeholder' => gettext('Search static mappings'))))
			->rowLink($edit)
			->rowActions(array(
				array('id' => 'edit', 'label' => gettext('Edit'), 'icon' => 'pen', 'inline' => true, 'href' => $edit),
				array('id' => 'delete', 'label' => gettext('Delete'), 'icon' => 'trash', 'danger' => true, 'api' => array(
					'method' => 'DELETE', 'path' => $this->api('/servers/' . rawurlencode($if) . '/static-mappings/{id}'), 'pending' => true,
					'success' => gettext('Static mapping deleted'),
					'confirm' => array('title' => gettext('Delete the static mapping of {display.hostname}?'), 'confirmLabel' => gettext('Delete'), 'danger' => true,
					    'text' => gettext('The client gets an address from the range from then on.')),
				)),
			))
			->empty(array('icon' => 'address-book', 'title' => gettext('No static mappings'),
			    'text' => $v6 ? gettext('Give a client a fixed address by its DUID.') : gettext('Give a device a fixed address by its MAC address.'),
			    'action' => array('label' => gettext('Add static mapping'), 'icon' => 'plus', 'href' => Url::page($route . '/mappings/new'))));
		$ui->add(
			$ui->pageHeader($this->title())->breadcrumb($crumbs),
			$apply,
			$ui->form()
				->schemaSource(array('path' => '/v1/schema/services/' . static::SERVICE . '_server', 'query' => array('interface' => $if)))
				->load(array('path' => $this->api('/servers/' . rawurlencode($if)), 'field' => 'fields'))
				->save(array('method' => 'PUT', 'path' => $this->api('/servers/' . rawurlencode($if)), 'pending' => true))
				->successMessage(gettext('Saved. Apply the changes to restart the DHCP server.'))
				->label($this->title()),
			$ui->section(gettext('Static mappings'))->divider(true)
				->description($v6 ? gettext('Clients that always get the same IPv6 address.') : gettext('Devices that always get the same address.'))
				->action('add-mapping', gettext('Add static mapping'), 'plus', Url::page($route . '/mappings/new')),
			$mappings
		);
	}

	private function buildMapping(Ui $ui, $apply): void {
		$if = $this->iface();
		$server = static::ROUTE . '/' . $if;
		$back = Url::page($server);
		$crumbs = $this->nav->crumbs();
		$crumbs[] = array(parent::title(), static::ROUTE);
		$crumbs[] = array(strtoupper($if), $server);
		$path = $this->api('/servers/' . rawurlencode($if) . '/static-mappings');
		$form = $ui->form()
			->schemaSource(array('path' => '/v1/schema/services/' . static::SERVICE . '_static_mapping'))
			->summary(true)
			->cancelHref($back)
			->successHref($back)
			->label($this->title());
		if ($this->params['view'] === 'new') {
			$form->save(array('method' => 'POST', 'path' => $path, 'pending' => true));
		} else {
			$form->load(array('path' => $path . '/' . (int)$this->params['id'], 'field' => 'fields'))
				->save(array('method' => 'PUT', 'path' => $path . '/{id}', 'pending' => true));
		}
		$ui->add($ui->pageHeader($this->title())->breadcrumb($crumbs), $apply, $form);
	}
}
