<?php
/*
 * DhcpSettings.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\SettingsPage;

/*
 * Network › DHCP server › Settings: logging, DNS registration and high
 * availability of the DHCP server (Kea) (GET/PUT /v1/services/dhcp/settings,
 * schema services/dhcp_settings). Changes wait for Apply.
 */
final class DhcpSettings extends SettingsPage {
	const ROUTE = '/network/dhcp-settings';
	const TITLE = 'Settings';
	const RESOURCE = 'services/dhcp/settings';
	const SCHEMA = 'services/dhcp_settings';
	const PENDING = '/v1/services/dhcp/pending';
	const APPLY_PATH = '/v1/services/dhcp/apply';
	const APPLY_MATCH = 'services/dhcp/';

	public function subtitle(): string {
		return gettext('Settings for every DHCP server: logging, DNS registration and high availability.');
	}
}
