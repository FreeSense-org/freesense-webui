<?php
/*
 * Laggs.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\ResourcePage;

/*
 * Network › Assignments › LAGG: link aggregation (/v1/interfaces/laggs,
 * schema network/laggs).
 */
final class Laggs extends ResourcePage {
	const ROUTE = '/network/lagg';
	const TITLE = 'LAGG';
	const RESOURCE = 'interfaces/laggs';
	const SCHEMA = 'network/laggs';
	const KEY = 'laggif';
	const LOAD_FIELD = 'fields';

	protected function noun(): string {
		return gettext('LAGG');
	}

	protected function plural(): string {
		return gettext('LAGG interfaces');
	}

	protected function columns(): array {
		return array(
			array('field' => 'display.interface', 'label' => gettext('Interface'), 'primary' => true, 'mono' => true, 'sortable' => true, 'sub' => 'display.description'),
			array('field' => 'display.protocol', 'label' => gettext('Protocol')),
			array('field' => 'display.members', 'label' => gettext('Members'), 'format' => 'chips', 'max' => 4, 'mono' => true),
			array('field' => 'display.assigned_to', 'label' => gettext('Assigned to')),
		);
	}
}
