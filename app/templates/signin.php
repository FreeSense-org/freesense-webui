<?php
/*
 * signin.php
 *
 * part of FreeSense WebUI (https://www.freesense.org)
 * Copyright (c) 2026 The FreeSense Project
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * The sign-in page. Plain HTML that works without JavaScript; it uses the
 * engine CSS and the default theme in the visitor's light/dark mode.
 *
 * @var array $v
 */
use FreeSense\WebUI\Html;
?><!doctype html>
<html lang="<?= Html::e($v['lang']) ?>" data-fs-theme="<?= Html::e($v['theme']) ?>" data-fs-mode="auto" data-bs-theme="light" data-fs-accent="<?= Html::e($v['accent']) ?>" data-fs-density="comfortable">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title><?= Html::e(gettext('Sign in')) ?> · <?= Html::e($v['host']) ?></title>
<script>(function (r) { r.dataset.bsTheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; })(document.documentElement);</script>
<link rel="stylesheet" href="<?= Html::e($v['css']) ?>">
<link rel="stylesheet" href="<?= Html::e($v['themeCss']) ?>">
</head>
<body class="fs-signin">
<main class="fs-signin-card">
	<div class="fs-signin-brand"><span class="fs-brand-mark" aria-hidden="true">FS</span><span class="fs-brand-name">FreeSense</span></div>
	<h1 class="fs-signin-title"><?= Html::e(gettext('Sign in')) ?></h1>
	<p class="fs-signin-host"><?= Html::e($v['host']) ?></p>
<?php if ($v['error'] !== ''): ?>
	<div class="alert alert-danger" role="alert" id="fs-signin-error"><?= Html::e($v['error']) ?></div>
<?php endif; ?>
	<form method="post" action="<?= Html::e($v['action']) ?>" autocomplete="on">
		<input type="hidden" name="csrf" value="<?= Html::e($v['csrf']) ?>">
		<input type="hidden" name="next" value="<?= Html::e($v['next']) ?>">
		<div class="mb-3">
			<label class="form-label" for="fs-username"><?= Html::e(gettext('Username')) ?></label>
			<input class="form-control" id="fs-username" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus value="<?= Html::e($v['username']) ?>"<?= ($v['error'] !== '') ? ' aria-describedby="fs-signin-error"' : '' ?>>
		</div>
		<div class="mb-4">
			<label class="form-label" for="fs-password"><?= Html::e(gettext('Password')) ?></label>
			<input class="form-control" id="fs-password" name="password" type="password" autocomplete="current-password" required>
		</div>
		<button class="btn btn-primary w-100" type="submit"><?= Html::e(gettext('Sign in')) ?></button>
	</form>
</main>
</body>
</html>
