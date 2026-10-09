<?php
/*
 * RouterAdvertisements.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\ResourcePage;

/*
 * Network › Router advertisements: IPv6 router advertisements per interface
 * (/v1/services/router-advertisements, schema
 * services/router_advertisements). One entry per interface with a static
 * IPv6 address, so nothing is added or deleted here.
 */
final class RouterAdvertisements extends ResourcePage {
	const ROUTE = '/network/radvd';
	const TITLE = 'Router advertisements';
	const RESOURCE = 'services/router-advertisements';
	const SCHEMA = 'services/router_advertisements';
	const KEY = 'interface';
	const LOAD_FIELD = 'fields';
	const CREATE = false;
	const DELETE = false;

	protected function noun(): string {
		return gettext('interface');
	}

	public function title(): string {
		return (($this->params['view'] ?? 'list') === 'edit') ? sprintf(gettext('Router advertisements on %s'), strtoupper((string)$this->params['key'])) : parent::title();
	}

	protected function columns(): array {
		return array(
			array('field' => 'display.enabled', 'label' => gettext('Status'), 'format' => 'status', 'variant' => 'dot', 'width' => '7rem', 'statusMap' => array(
				'true' => array('state' => 'ok', 'label' => gettext('Advertising')), 'false' => array('state' => 'neutral', 'label' => gettext('Off')))),
			array('field' => 'display.interface', 'label' => gettext('Interface'), 'primary' => true, 'sortable' => true),
			array('field' => 'display.mode', 'label' => gettext('Mode')),
			array('field' => 'display.priority', 'label' => gettext('Priority'), 'priority' => 3),
			array('field' => 'display.dhcpv6', 'label' => 'DHCPv6'),
		);
	}
}
