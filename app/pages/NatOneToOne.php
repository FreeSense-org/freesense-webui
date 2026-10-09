<?php
/*
 * NatOneToOne.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\RuleListPage;

/*
 * Security › NAT › 1:1: map an external address to an internal one in both
 * directions (/v1/firewall/nat/one-to-one, schema firewall/nat_one_to_one).
 */
final class NatOneToOne extends RuleListPage {
	const ROUTE = '/security/nat-1to1';
	const TITLE = '1:1';
	const API = '/v1/firewall/nat/one-to-one';
	const SCHEMA = 'firewall/nat_one_to_one';
	const APPLY = 'nat';
	const APPLY_PATH = '/v1/firewall/nat/apply';
	const ICON = 'arrows-left-right';

	protected function noun(): string {
		return gettext('1:1 mapping');
	}

	protected function subtitle(): string {
		return gettext('Map a public address to an internal host or network in both directions. Drag to change the order.');
	}

	protected function emptyText(): string {
		return gettext('Use 1:1 NAT when an internal host needs its own public address, e.g. a mail server.');
	}

	protected function defaults(): array {
		return array('interface' => 'wan', 'ipprotocol' => 'inet', 'srctype' => 'single', 'dsttype' => 'any');
	}

	protected function columns(): array {
		return array(
			array('field' => 'display.description', 'label' => gettext('Description'), 'primary' => true),
			array('field' => 'display.interface', 'label' => gettext('Interface')),
			array('field' => 'display.external', 'label' => gettext('External'), 'mono' => true),
			array('field' => 'display.internal', 'label' => gettext('Internal'), 'mono' => true),
			array('field' => 'display.destination', 'label' => gettext('Destination'), 'mono' => true, 'priority' => 3),
		);
	}
}
