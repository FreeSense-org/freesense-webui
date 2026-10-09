<?php
/*
 * Arp.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\StatusPage;

/* The ARP table: which addresses the firewall has seen on which interface. */
final class Arp extends StatusPage {
	const ROUTE = '/insights/arp';
	const TITLE = 'ARP table';
	const SOURCE = '/v1/status/arp';
	const KEY = 'ip';
	const EVERY = 30;

	public function subtitle(): string {
		return gettext('IPv4 neighbours the firewall knows on its interfaces.');
	}

	protected function columns(): array {
		return array(
			array('field' => 'ip', 'label' => gettext('Address'), 'primary' => true, 'mono' => true, 'sortable' => true),
			array('field' => 'mac', 'label' => gettext('MAC address'), 'format' => 'mono', 'sub' => 'mac-man'),
			array('field' => 'hostname', 'label' => gettext('Hostname'), 'sortable' => true),
			array('field' => 'interface', 'label' => gettext('Interface'), 'sortable' => true),
			array('field' => 'expires', 'label' => gettext('Expires'), 'priority' => 3),
		);
	}
}
