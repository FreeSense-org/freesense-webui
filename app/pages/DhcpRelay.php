<?php
/*
 * DhcpRelay.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\SettingsPage;

/*
 * Network › DHCP server › Relay: forward DHCP requests to another server
 * (GET/PUT /v1/services/dhcp-relay, schema services/dhcp_relay). Saving
 * applies at once, like the 1.x page.
 */
final class DhcpRelay extends SettingsPage {
	const ROUTE = '/network/dhcp-relay';
	const TITLE = 'Relay';
	const RESOURCE = 'services/dhcp-relay';
	const SCHEMA = 'services/dhcp_relay';

	public function subtitle(): string {
		return gettext('Forward DHCP requests from the selected interfaces to other DHCP servers. The DHCP server must be off on those interfaces.');
	}
}
