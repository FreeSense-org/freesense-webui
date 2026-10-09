<?php
/*
 * index.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/* Front controller of WebUI 2.0: nginx sends every page request here. */

require (getenv('FS_WEBUI_APP_DIR') ?: '/usr/local/share/freesense-webui/app') . '/bootstrap.php';

FreeSense\WebUI\App::run();
