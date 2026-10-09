<?php
/*
 * Dhcpv6Relay.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\SettingsPage;

/*
 * Network › DHCP server › DHCPv6 relay (GET/PUT /v1/services/dhcpv6-relay,
 * schema services/dhcpv6_relay). Saving applies at once.
 */
final class Dhcpv6Relay extends SettingsPage {
	const ROUTE = '/network/dhcpv6-relay';
	const TITLE = 'DHCPv6 relay';
	const RESOURCE = 'services/dhcpv6-relay';
	const SCHEMA = 'services/dhcpv6_relay';

	public function subtitle(): string {
		return gettext('Forward DHCPv6 requests from the selected interfaces to other DHCPv6 servers.');
	}
}
