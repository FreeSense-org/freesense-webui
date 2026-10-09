<?php
/*
 * RoutingGateways.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\ResourcePage;
use FreeSense\WebUI\Ui;

/*
 * Network › Gateways: the gateways with their monitoring state and the
 * default gateway choice (/v1/routing/gateways, schema routing/gateways;
 * /v1/routing/default-gateways). Changes wait for Apply (/v1/routing/apply).
 * Insights › Gateways is the live status view.
 */
final class RoutingGateways extends ResourcePage {
	const ROUTE = '/network/gateways';
	const TITLE = 'Gateways';
	const RESOURCE = 'routing/gateways';
	const KEY = 'name';
	const LOAD_FIELD = 'fields';
	const PENDING = '/v1/routing/pending';
	const APPLY_PATH = '/v1/routing/apply';

	protected function noun(): string {
		return gettext('gateway');
	}

	protected function applyBar(Ui $ui): \FreeSense\WebUI\Element {
		return parent::applyBar($ui)->match('/routing');
	}

	protected function above(Ui $ui): array {
		return array($ui->form()
			->schemaSource(array('path' => '/v1/schema/routing/default_gateways'))
			->load(array('path' => '/v1/routing/default-gateways', 'field' => 'fields'))
			->save(array('method' => 'PUT', 'path' => '/v1/routing/default-gateways', 'pending' => true))
			->density('compact')
			->bar('inline')
			->successMessage(gettext('Saved. Apply the changes to use the new default gateway.'))
			->label(gettext('Default gateway')));
	}

	protected function columns(): array {
		$states = array(
			'online' => array('state' => 'ok', 'label' => gettext('Online')),
			'highdelay' => array('state' => 'warn', 'label' => gettext('High latency')),
			'highloss' => array('state' => 'warn', 'label' => gettext('Packet loss')),
			'down' => array('state' => 'crit', 'label' => gettext('Offline')),
			'none' => array('state' => 'neutral', 'label' => gettext('Not monitored')),
		);
		return array(
			array('field' => 'display.status.state', 'label' => gettext('Status'), 'format' => 'status', 'variant' => 'dot', 'width' => '9rem', 'statusMap' => $states),
			array('field' => 'name', 'label' => gettext('Name'), 'primary' => true, 'mono' => true, 'sortable' => true, 'sub' => 'display.description'),
			array('field' => 'display.interface', 'label' => gettext('Interface'), 'sortable' => true),
			array('field' => 'display.address', 'label' => gettext('Gateway'), 'mono' => true, 'sub' => 'display.family'),
			array('field' => 'display.monitor', 'label' => gettext('Monitor IP'), 'mono' => true, 'priority' => 3),
			array('field' => 'display.status.delay', 'label' => gettext('Latency'), 'mono' => true, 'priority' => 3),
			array('field' => 'display.default', 'label' => gettext('Default'), 'format' => 'bool', 'priority' => 3),
		);
	}
}
