<?php
/*
 * Profile.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Page;
use FreeSense\WebUI\Ui;

/* Your account, how FreeSense looks for you, and where you are signed in. */
final class Profile extends Page {
	const ROUTE = '/me';
	const TITLE = 'Profile';

	public function build(Ui $ui): void {
		$ui->add(
			$ui->pageHeader($this->title())->subtitle(gettext('Your account, how FreeSense looks for you, and where you are signed in.')),
			$ui->profileCard()->source(array('path' => '/v1/me'))->id('profile'),
			$ui->themePicker()->id('appearance'),
			$ui->sessionList()->source(array('path' => '/v1/me/sessions'))->every(30)->id('sessions')
		);
	}
}
