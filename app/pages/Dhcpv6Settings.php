<?php
/*
 * Dhcpv6Settings.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\SettingsPage;

/*
 * Network › DHCP server › DHCPv6 settings (GET/PUT
 * /v1/services/dhcpv6/settings, schema services/dhcpv6_settings).
 */
final class Dhcpv6Settings extends SettingsPage {
	const ROUTE = '/network/dhcpv6-settings';
	const TITLE = 'DHCPv6 settings';
	const RESOURCE = 'services/dhcpv6/settings';
	const SCHEMA = 'services/dhcpv6_settings';
	const PENDING = '/v1/services/dhcpv6/pending';
	const APPLY_PATH = '/v1/services/dhcpv6/apply';
	const APPLY_MATCH = 'services/dhcpv6/';
}
