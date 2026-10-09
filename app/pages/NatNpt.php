<?php
/*
 * NatNpt.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\RuleListPage;

/*
 * Security › NAT › NPt: IPv6 network prefix translation
 * (/v1/firewall/nat/npt, schema firewall/nat_npt).
 */
final class NatNpt extends RuleListPage {
	const ROUTE = '/security/nat-npt';
	const TITLE = 'NPt';
	const API = '/v1/firewall/nat/npt';
	const SCHEMA = 'firewall/nat_npt';
	const APPLY = 'nat';
	const APPLY_PATH = '/v1/firewall/nat/apply';
	const ICON = 'arrows-left-right-to-line';

	protected function noun(): string {
		return gettext('NPt mapping');
	}

	protected function subtitle(): string {
		return gettext('Translate one IPv6 prefix to another of the same length, e.g. internal ULA addresses to your public prefix.');
	}

	protected function emptyText(): string {
		return gettext('NPt keeps internal IPv6 addresses stable when the public prefix changes.');
	}

	protected function defaults(): array {
		return array('interface' => 'wan');
	}

	protected function columns(): array {
		return array(
			array('field' => 'display.description', 'label' => gettext('Description'), 'primary' => true),
			array('field' => 'display.interface', 'label' => gettext('Interface')),
			array('field' => 'display.internal', 'label' => gettext('Internal prefix'), 'mono' => true),
			array('field' => 'display.external', 'label' => gettext('External prefix'), 'mono' => true),
		);
	}
}
