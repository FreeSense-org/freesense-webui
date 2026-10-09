<?php
/*
 * Gateways.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\StatusPage;
use FreeSense\WebUI\Url;

/* Gateway monitoring (dpinger): state, latency, jitter and loss. */
final class Gateways extends StatusPage {
	const ROUTE = '/insights/gateways';
	const TITLE = 'Gateways';
	const SOURCE = '/v1/status/gateways';
	const KEY = 'name';
	const EVERY = 5;

	public function subtitle(): string {
		return gettext('Live monitoring of every gateway: whether it answers, and how fast.');
	}

	protected function columns(): array {
		return array(
			array('field' => 'name', 'label' => gettext('Gateway'), 'primary' => true, 'sortable' => true, 'sub' => 'monitorip'),
			array('field' => 'status', 'label' => gettext('Status'), 'format' => 'status', 'variant' => 'pill', 'sortable' => true, 'statusMap' => array(
				'online' => array('state' => 'ok', 'label' => gettext('Online')),
				'none' => array('state' => 'ok', 'label' => gettext('Online')),
				'delay' => array('state' => 'warn', 'label' => gettext('Latency')),
				'highdelay' => array('state' => 'warn', 'label' => gettext('High latency')),
				'loss' => array('state' => 'warn', 'label' => gettext('Packet loss')),
				'highloss' => array('state' => 'crit', 'label' => gettext('High packet loss')),
				'down' => array('state' => 'crit', 'label' => gettext('Offline')),
				'force_down' => array('state' => 'neutral', 'label' => gettext('Marked down')),
			)),
			array('field' => 'delay', 'label' => gettext('Latency'), 'format' => 'mono', 'align' => 'end'),
			array('field' => 'stddev', 'label' => gettext('Jitter'), 'format' => 'mono', 'align' => 'end'),
			array('field' => 'loss', 'label' => gettext('Loss'), 'format' => 'mono', 'align' => 'end'),
			array('field' => 'srcip', 'label' => gettext('Source address'), 'format' => 'mono', 'priority' => 3),
		);
	}

	protected function rowActions(): array {
		return array(array('id' => 'settings', 'label' => gettext('Gateway settings'), 'icon' => 'sliders', 'inline' => true,
		    'href' => Url::page('/network/gateways')));
	}

	protected function empty(): array {
		return array('icon' => 'route', 'title' => gettext('No gateways'), 'text' => gettext('Gateways appear when an interface has one, or when you add them.'));
	}
}
