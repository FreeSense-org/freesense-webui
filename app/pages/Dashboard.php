<?php
/*
 * Dashboard.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Page;
use FreeSense\WebUI\Ui;

final class Dashboard extends Page {
	const ROUTE = '/';
	const TITLE = 'Dashboard';

	public function build(Ui $ui): void {
		$host = trim(config_get_path('system/hostname', '') . '.' . config_get_path('system/domain', ''), '.');
		$version = trim((string)@file_get_contents('/etc/version'));
		$ui->add(
			$ui->pageHeader($this->title())
				->subtitle(implode(' · ', array_filter(array($host, $version !== '' ? "FreeSense {$version}" : ''))))
				->primary('edit-layout', gettext('Edit layout'), 'pen-to-square', null, array('variant' => 'secondary'))
				->action('add-widget', gettext('Add widget'), 'plus')
				->action('reset-layout', gettext('Reset'), 'rotate-left'),
			$ui->dashboard()->set('layout', array('path' => '/v1/dashboard/layout', 'query' => array('style' => 'default')))
				->linkBase(FS_WEBUI_BASE)->id('dashboard')
		);
	}
}
