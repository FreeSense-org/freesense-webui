<?php
/*
 * DhcpServer.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

/* Network › DHCP server › DHCPv4 (see DhcpServerPage). */
final class DhcpServer extends DhcpServerPage {
	const ROUTE = '/network/dhcp';
	const TITLE = 'DHCPv4';
	const SERVICE = 'dhcp';
}
