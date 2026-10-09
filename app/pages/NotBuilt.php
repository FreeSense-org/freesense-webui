<?php
/*
 * NotBuilt.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Page;
use FreeSense\WebUI\Ui;

/* Every navigation entry without a page yet (until each area is ported, P5–P7). */
final class NotBuilt extends Page {
	public function build(Ui $ui): void {
		$ui->add(
			$this->header($ui),
			$ui->emptyState(array(
				'icon' => 'person-digging',
				'title' => gettext('Not built yet'),
				'text' => gettext('This page is still being rebuilt for the new WebUI. The menus and navigation already work.'),
				'size' => 'lg',
			))
		);
	}
}
