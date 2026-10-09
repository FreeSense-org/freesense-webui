<?php
/*
 * VpnLog.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\LogPage;

/* Connections and messages of the OpenVPN servers and clients. */
final class VpnLog extends LogPage {
	const ROUTE = '/insights/logs-vpn';
	const TITLE = 'OpenVPN log';
	const LOG = '/v1/logs/openvpn';
}
