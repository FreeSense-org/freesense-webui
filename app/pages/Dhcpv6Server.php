<?php
/*
 * Dhcpv6Server.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

/* Network › DHCP server › DHCPv6 (see DhcpServerPage). */
final class Dhcpv6Server extends DhcpServerPage {
	const ROUTE = '/network/dhcpv6';
	const TITLE = 'DHCPv6';
	const SERVICE = 'dhcpv6';
}
