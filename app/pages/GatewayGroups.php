<?php
/*
 * GatewayGroups.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\ResourcePage;
use FreeSense\WebUI\Ui;

/*
 * Network › Gateways › Gateway groups: failover and load balancing across
 * gateways in tiers (/v1/routing/gateway-groups, schema
 * routing/gateway_groups).
 */
final class GatewayGroups extends ResourcePage {
	const ROUTE = '/network/gateway-groups';
	const TITLE = 'Gateway groups';
	const RESOURCE = 'routing/gateway-groups';
	const SCHEMA = 'routing/gateway_groups';
	const KEY = 'name';
	const LOAD_FIELD = 'fields';
	const PENDING = '/v1/routing/pending';
	const APPLY_PATH = '/v1/routing/apply';

	protected function noun(): string {
		return gettext('gateway group');
	}

	protected function applyBar(Ui $ui): \FreeSense\WebUI\Element {
		return parent::applyBar($ui)->match('/routing');
	}

	protected function columns(): array {
		return array(
			array('field' => 'name', 'label' => gettext('Name'), 'primary' => true, 'mono' => true, 'sortable' => true, 'sub' => 'display.description'),
			array('field' => 'display.members', 'label' => gettext('Gateways'), 'format' => 'chips', 'max' => 4),
			array('field' => 'display.trigger', 'label' => gettext('Switch on'), 'priority' => 3),
		);
	}
}
