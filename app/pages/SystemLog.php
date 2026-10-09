<?php
/*
 * SystemLog.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\LogPage;

/* Messages from the kernel, services and the WebUI. */
final class SystemLog extends LogPage {
	const ROUTE = '/insights/logs-system';
	const TITLE = 'System log';
	const LOG = '/v1/logs/system';
}
