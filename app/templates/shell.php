<?php
/*
 * shell.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * The page frame (same markup as gallery/app/shell.html). Variables come
 * from Shell::render(); everything printed is escaped there or here.
 *
 * @var array $v
 */
use FreeSense\WebUI\Html;
?><!doctype html>
<html lang="<?= Html::e($v['lang']) ?>" data-fs-theme="<?= Html::e($v['theme']) ?>" data-fs-mode="<?= Html::e($v['mode']) ?>" data-bs-theme="<?= Html::e($v['bsTheme']) ?>" data-fs-accent="<?= Html::e($v['accent']) ?>" data-fs-density="<?= Html::e($v['density']) ?>"
	data-fs-skin-topbar="<?= Html::e($v['skin']['topbar']) ?>" data-fs-skin-section="<?= Html::e($v['skin']['sectionMenu']) ?>" data-fs-skin-cards="<?= Html::e($v['skin']['cards']) ?>" data-fs-skin-tables="<?= Html::e($v['skin']['tables']) ?>" data-fs-skin-buttons="<?= Html::e($v['skin']['buttons']) ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="fs-themes" content="/themes">
<meta name="fs-csrf" content="<?= Html::e($v['csrf']) ?>">
<meta name="fs-login" content="<?= Html::e($v['login']) ?>">
<title><?= Html::e($v['title']) ?> · <?= Html::e($v['host']) ?></title>
<?php if ($v['mode'] === 'auto'): ?>
<script>(function (r) { r.dataset.bsTheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; })(document.documentElement);</script>
<?php endif; ?>
<link rel="stylesheet" href="<?= Html::e($v['css']) ?>">
<link rel="stylesheet" id="fs-theme-<?= Html::e($v['theme']) ?>" href="<?= Html::e($v['themeCss']) ?>">
</head>
<body class="fs-app" data-fs-el="app-shell" data-fs-layout="<?= Html::e($v['layout']) ?>" data-fs-config="<?= Html::e(Html::json(array('area' => $v['area']))) ?>">
<a class="fs-skip" href="#fs-main"><?= Html::e(gettext('Skip to content')) ?></a>
<div class="fs-progress" aria-hidden="true"></div>

<header class="fs-topbar">
	<div class="fs-topbar-inner">
		<button type="button" class="fs-tb-btn fs-topbar-menu" data-fs-shell="drawer" aria-controls="fs-navdrawer" aria-expanded="false" aria-label="<?= Html::e(gettext('Open menu')) ?>"><i class="fa-solid fa-bars" aria-hidden="true"></i></button>
		<a class="fs-brand" href="<?= Html::e($v['home']) ?>" data-fs-nav><span class="fs-brand-mark" aria-hidden="true">FS</span><span class="fs-brand-name">FreeSense</span></a>
		<nav class="fs-areas" aria-label="<?= Html::e(gettext('Main')) ?>"><?= $v['areas'] ?></nav>
		<div class="fs-topbar-tools">
			<?= Html::element('command-palette', array('trigger' => 'search', 'signOut' => $v['signOut'])) ?>
			<?= Html::element('notifications', array('source' => array('path' => '/v1/notices'), 'every' => 30)) ?>
			<?= Html::element('profile-menu', array('modeToggle' => true, 'links' => $v['profileLinks'], 'signOut' => $v['signOut'])) ?>
		</div>
	</div>
</header>

<div class="fs-navdrawer" id="fs-navdrawer" aria-label="<?= Html::e(gettext('Menu')) ?>" hidden><?= $v['drawer'] ?></div>
<div class="fs-scrim" aria-hidden="true"></div>

<div class="fs-body">
	<aside class="fs-pagemenu" aria-label="<?= Html::e($v['menuTitle']) ?>"<?= ($v['layout'] === 'menu') ? '' : ' hidden' ?>><?= $v['menu'] ?></aside>
	<main class="fs-main" id="fs-main" data-fs-main data-fs-page="<?= Html::e($v['page']) ?>" data-fs-area="<?= Html::e($v['area']) ?>" data-fs-layout="<?= Html::e($v['layout']) ?>" tabindex="-1">
<?= $v['main'] ?>

	</main>
</div>

<script type="application/json" id="fs-nav"><?= Html::scriptJson($v['nav']) ?></script>
<script src="<?= Html::e($v['js']) ?>"></script>
</body>
</html>
