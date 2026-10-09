<?php
/*
 * Schedules.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\ResourcePage;

/*
 * Security › Schedules: named time ranges that firewall rules can be limited
 * to (/v1/firewall/schedules, schema firewall/schedules). A schedule that a
 * rule uses cannot be deleted.
 */
final class Schedules extends ResourcePage {
	const ROUTE = '/security/schedules';
	const TITLE = 'Schedules';
	const RESOURCE = 'firewall/schedules';
	const KEY = 'name';
	const LOAD_FIELD = 'fields';

	protected function noun(): string {
		return gettext('schedule');
	}

	protected function columns(): array {
		return array(
			array('field' => 'display.active', 'label' => gettext('Now'), 'format' => 'status', 'variant' => 'dot', 'width' => '7rem', 'statusMap' => array(
				'true' => array('state' => 'ok', 'label' => gettext('Active')), 'false' => array('state' => 'neutral', 'label' => gettext('Inactive')))),
			array('field' => 'name', 'label' => gettext('Name'), 'primary' => true, 'mono' => true, 'sortable' => true, 'sub' => 'display.description'),
			array('field' => 'display.ranges', 'label' => gettext('Time ranges'), 'format' => 'chips', 'max' => 3),
			array('field' => 'display.used_by', 'label' => gettext('Used by rules'), 'format' => 'num', 'priority' => 3),
		);
	}
}
