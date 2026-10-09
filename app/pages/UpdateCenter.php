<?php
/*
 * UpdateCenter.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Page;
use FreeSense\WebUI\Ui;

/*
 * The Update Center: installed version and the available update with its
 * release notes (release-card), the checks that gate it (preflight), the
 * running update (job "packages", kept in ?job= across reboots) and the boot
 * environments to roll back to (be-timeline). Release behaviour (channels,
 * signed metadata, the one-way 1.0 → 1.1 rule) stays in the backend.
 */
final class UpdateCenter extends Page {
	const ROUTE = '/system/update';
	const TITLE = 'Update Center';

	public function build(Ui $ui): void {
		$ui->add(
			$this->header($ui)->subtitle(gettext('Keep FreeSense up to date, and roll back to an earlier boot environment when you need to.')),
			$ui->releaseCard()->gate('#update-preflight')->id('update-release'),
			$ui->preflight(gettext('Before you update'))->source(array('path' => '/v1/system/update/preflight'))->id('update-preflight'),
			$ui->job()->hideIdle()->channel('update')->title(gettext('System update'))
				->successAction(array('label' => gettext('View boot environments'), 'href' => '#boot-environments', 'icon' => 'hard-drive'))
				->id('update-job'),
			$ui->beTimeline()->reloadOn('fs:job-done')->id('boot-environments')
		);
	}
}
