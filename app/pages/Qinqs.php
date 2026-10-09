<?php
/*
 * Qinqs.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\ResourcePage;

/*
 * Network › Assignments › QinQ: stacked VLANs (/v1/interfaces/qinqs,
 * schema network/qinq).
 */
final class Qinqs extends ResourcePage {
	const ROUTE = '/network/qinq';
	const TITLE = 'QinQ';
	const RESOURCE = 'interfaces/qinqs';
	const SCHEMA = 'network/qinq';
	const KEY = 'vlanif';
	const LOAD_FIELD = 'fields';

	protected function noun(): string {
		return gettext('QinQ');
	}

	protected function plural(): string {
		return gettext('QinQ interfaces');
	}

	protected function columns(): array {
		return array(
			array('field' => 'display.interface', 'label' => gettext('Interface'), 'primary' => true, 'mono' => true, 'sortable' => true, 'sub' => 'display.description'),
			array('field' => 'display.parent', 'label' => gettext('Parent')),
			array('field' => 'display.tag', 'label' => gettext('Tag'), 'mono' => true),
			array('field' => 'display.members', 'label' => gettext('Member tags'), 'format' => 'chips', 'max' => 5, 'mono' => true),
			array('field' => 'display.assigned_to', 'label' => gettext('Assigned to'), 'priority' => 3),
		);
	}
}
