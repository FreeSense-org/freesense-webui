<?php
/*
 * Ntp.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\SettingsPage;

/* The NTP server: serve time to the network, upstream servers, logging, authentication. */
final class Ntp extends SettingsPage {
	const ROUTE = '/services/ntp';
	const TITLE = 'NTP';
	const RESOURCE = 'services/ntp';

	public function subtitle(): string {
		return gettext('Keep the firewall\'s clock right and serve time to your network.');
	}
}
