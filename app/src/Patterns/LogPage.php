<?php
/*
 * LogPage.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Patterns;

use FreeSense\WebUI\Page;
use FreeSense\WebUI\Ui;
use FreeSense\WebUI\Url;

/*
 * A log: live tail, older pages, search, filters, summary and a detail
 * drawer (log-viewer), read in the API's WebUI format.
 *
 *   final class SystemLog extends LogPage {
 *       const ROUTE = '/insights/logs-system';
 *       const LOG = '/v1/logs/system';
 *   }
 */
abstract class LogPage extends Page {
	/* API path of the log. */
	const LOG = '';
	/* 'firewall' or 'system' (columns, filters, drawer). */
	const TYPE = 'system';
	/* FreeBSD syslog files carry no severity. */
	const SEVERITY = false;

	public function subtitle(): string {
		return (static::TYPE === 'firewall')
		    ? gettext('Packets matched by rules with logging enabled, newest first. Click an entry for details.')
		    : gettext('Newest first. Click an entry for details; pause to read while new entries arrive.');
	}

	public function build(Ui $ui): void {
		$viewer = $ui->logViewer()
			->source(array('path' => static::LOG, 'query' => array('format' => 'webui')))
			->type(static::TYPE)
			->title($this->title())
			->summary(true)
			->height('max(24rem, calc(100vh - 22rem))');
		if (static::TYPE === 'firewall') {
			$viewer->ruleHref(Url::page('/security/rules') . '?rule={rule_id}');
		} else {
			$viewer->severity(static::SEVERITY);
		}
		$ui->add($this->header($ui)->subtitle($this->subtitle()), $viewer);
	}
}
