<?php
/*
 * NatOutbound.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */

namespace FreeSense\WebUI\Pages;

use FreeSense\WebUI\Patterns\RuleListPage;
use FreeSense\WebUI\Ui;

/*
 * Security › NAT › Outbound: the outbound NAT mode, the mappings the
 * firewall creates automatically, and your own mappings
 * (/v1/firewall/nat/outbound, schema firewall/nat_outbound). Your mappings
 * are used in hybrid and manual ("advanced") mode.
 */
final class NatOutbound extends RuleListPage {
	const ROUTE = '/security/nat-outbound';
	const TITLE = 'Outbound';
	const API = '/v1/firewall/nat/outbound';
	const SCHEMA = 'firewall/nat_outbound';
	const APPLY = 'nat';
	const APPLY_PATH = '/v1/firewall/nat/apply';
	const ICON = 'arrow-right-from-bracket';

	protected function noun(): string {
		return gettext('outbound mapping');
	}

	protected function subtitle(): string {
		return gettext('How traffic leaving through an interface is translated to the interface address or another address.');
	}

	protected function emptyText(): string {
		return gettext('Your own mappings are used in hybrid and manual mode, before the automatic ones.');
	}

	protected function defaults(): array {
		return array('interface' => 'wan', 'ipprotocol' => 'inet', 'protocol' => 'any', 'source_type' => 'network', 'destination_type' => 'any');
	}

	protected function above(Ui $ui): array {
		/* Short labels for the API's modes (its "choices" carry the 1.x page's long texts). */
		$modes = array(
			array('value' => 'automatic', 'label' => gettext('Automatic')),
			array('value' => 'hybrid', 'label' => gettext('Hybrid')),
			array('value' => 'advanced', 'label' => gettext('Manual')),
			array('value' => 'disabled', 'label' => gettext('Disabled')),
		);
		$mode = $ui->form()
			->schema(array('title' => gettext('Outbound NAT mode'), 'sections' => array(array('id' => 'mode', 'fields' => array(
				array('name' => 'mode', 'type' => 'segmented', 'label' => gettext('Mode'), 'required' => true, 'options' => $modes,
				    'help' => gettext('Automatic: the firewall creates the mappings. Hybrid: your mappings first, then the automatic ones. Manual: only your mappings (switching copies the automatic ones into your list). Disabled: no outbound NAT.')),
			)))))
			->load(array('path' => '/v1/firewall/nat/outbound-mode'))
			->save(array('method' => 'PUT', 'path' => '/v1/firewall/nat/outbound-mode', 'pending' => true))
			->density('compact')
			->bar('inline')
			->successMessage(gettext('Saved. Apply the changes to use the new mode.'))
			->label(gettext('Outbound NAT mode'));
		$auto = $ui->dataTable()
			->source(array('path' => '/v1/firewall/nat/outbound-automatic'))
			->reloadOn('fs:saved')
			->label(gettext('Automatic mappings'))
			->columns(array(
				array('field' => 'display.description', 'label' => gettext('Description'), 'primary' => true),
				array('field' => 'display.interface', 'label' => gettext('Interface')),
				array('field' => 'display.source', 'label' => gettext('Source'), 'format' => 'chips', 'max' => 3, 'mono' => true, 'sub' => 'display.source_ports'),
				array('field' => 'display.destination', 'label' => gettext('Destination'), 'mono' => true, 'sub' => 'display.destination_ports'),
				array('field' => 'display.translation', 'label' => gettext('Translation'), 'mono' => true, 'sub' => 'display.translation_port'),
			))
			->empty(array('icon' => 'arrow-right-from-bracket', 'title' => gettext('No automatic mappings'),
			    'text' => gettext('In manual or disabled mode the firewall creates none.')));
		return array(
			$mode,
			$ui->section(gettext('Automatic mappings'))->level(3)
				->description(gettext('Created by the firewall for every local network; used in automatic and hybrid mode.'))
				->content($auto),
			$ui->section(gettext('Your mappings'))->level(3)->divider(true)
				->description(gettext('Used in hybrid and manual mode, top down.')),
		);
	}

	protected function columns(): array {
		return array(
			array('field' => 'display.description', 'label' => gettext('Description'), 'primary' => true, 'sub' => 'display.protocol'),
			array('field' => 'display.interface', 'label' => gettext('Interface')),
			array('field' => 'display.source', 'label' => gettext('Source'), 'mono' => true, 'sub' => 'display.source_ports'),
			array('field' => 'display.destination', 'label' => gettext('Destination'), 'mono' => true, 'sub' => 'display.destination_ports'),
			array('field' => 'display.translation', 'label' => gettext('Translation'), 'mono' => true, 'sub' => 'display.translation_port'),
			array('field' => 'display.static_port', 'label' => gettext('Static port'), 'format' => 'bool', 'priority' => 3),
		);
	}
}
