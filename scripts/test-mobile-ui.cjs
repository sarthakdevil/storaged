// Run against the frontend dev server. Requires Playwright and a Chromium browser.
// UI_BASE_URL, PLAYWRIGHT_MODULE and CHROMIUM_PATH can override local defaults.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.env.UI_BASE_URL || 'http://localhost:3001';
const screenshotDir = process.env.UI_SCREENSHOT_DIR;
if (screenshotDir) require('node:fs').mkdirSync(screenshotDir, { recursive: true });
const date = '2026-10-18T10:00:00.000Z';
const longName = 'Quarterly-report-with-a-very-long-unbroken-name-'.repeat(3);
const nodes = [0, 1, 2].map(i => ({
  id: `file-${i}`, name: longName + i + '.txt', type: 'FILE', parentId: null,
  sizeBytes: '2048', mimeType: 'text/plain', isFavorite: true, tags: [],
  createdAt: date, updatedAt: date,
}));
const connection = {
  id: 'storage-1', providerName: 's3', displayName: longName, bucketName: longName,
  config: { region: 'us-east-1' }, isActive: true, status: 'connected',
  statusMessage: 'Storage is ready', usedBytes: '2048', quotaBytes: '5368709120',
  availableBytes: '5368707072', activeObjects: 3, totalObjects: 3,
  createdAt: date, updatedAt: date, lastCheckedAt: date,
};
const key = { id: 'key-1', name: longName, prefix: 'sk_test_prefix', lastUsedAt: null, expiresAt: null, createdAt: date };

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const context = await browser.newContext();
    await context.addCookies([{ name: 'session_token', value: 'ui-test', url: baseURL }]);
    await context.addInitScript(() => {
      localStorage.setItem('token', 'ui-test');
      localStorage.setItem('user', JSON.stringify({ id: 'test', name: 'Mobile Tester', email: 'test@example.com' }));
    });
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname.replace(/^\/api(?=\/|$)/, '');
      let body;
      if (path === '/files') body = nodes;
      else if (path === '/files/trash') body = nodes.map(n => ({ ...n, originalName: n.name, originalPath: longName, deletedAt: date }));
      else if (path === '/storage/connections') body = { items: [connection], nextCursor: null };
      else if (path === '/storage/dashboard') body = { totalStorages: 1, connectedStorages: 1, activeStorages: 1, erroredStorages: 0, totalConnections: 1, usedBytes: '2048', quotaBytes: '5368709120', availableBytes: '5368707072', totalObjects: 3, activeObjects: 3, storages: [connection], nextCursor: null };
      else if (path === '/storage/quota') body = { usedBytes: '2048', totalBytes: '5368709120', availableBytes: '5368707072', percentageUsed: 1 };
      else if (path === '/apikeys') body = route.request().method() === 'POST' ? { ...key, key: 'test_secret_'.repeat(8) } : [key];
      else if (path.endsWith('/shares')) body = [{ id: 'link-1', nodeId: 'file-0', token: longName, expiresAt: null, createdAt: date }];
      else if (path.endsWith('/preview')) body = { url: `${baseURL}/api/test-content` };
      else if (path === '/test-content') return route.fulfill({ body: 'Preview content '.repeat(80), contentType: 'text/plain' });
      else if (path.startsWith('/share/')) body = { name: longName, mimeType: 'application/very-long-custom-type', sizeBytes: '2048', url: `${baseURL}/api/test-content` };
      else body = {};
      await route.fulfill({ json: body, headers: { 'access-control-allow-origin': '*' } });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    async function check(label) {
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
      const overflow = await page.evaluate(() => {
        const targets = [document.documentElement, ...document.querySelectorAll('.drive-main, .drive-main > div, [role="dialog"], .custom-modal, .storage-list, .storage-form, .storage-connection-row, .file-list-row, .trash-list-row, .api-key-row')];
        return targets.filter(el => el.scrollWidth > el.clientWidth + 2).map(el => ({ tag: el.tagName, class: el.className, width: el.clientWidth, scroll: el.scrollWidth }));
      });
      assert.deepEqual(overflow, [], `${label}: horizontal overflow ${JSON.stringify(overflow)}`);
      const dialog = page.locator('[role="dialog"], .custom-modal');
      if (await dialog.count()) {
        const box = await dialog.boundingBox(); const viewport = page.viewportSize();
        assert(box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${label}: dialog outside viewport ${JSON.stringify(box)}`);
      }
      console.log(`PASS ${label}`);
      if (screenshotDir && /390x844|844x390/.test(label)) {
        await page.screenshot({ path: require('node:path').join(screenshotDir, label.replace(/[^a-z0-9]+/gi, '-') + '.png') });
      }
    }
    async function closeDialog() { await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' }); }
    for (const [width, height] of [[320, 568], [390, 844], [430, 932], [768, 1024], [844, 390], [1280, 800]]) {
      await page.setViewportSize({ width, height });
      const size = `${width}x${height}`;
      for (const route of ['/drive', '/drive/favorites', '/drive/trash', '/drive/dashboard', '/drive/api-keys', '/share/test']) {
        await page.goto(baseURL + route);
        await page.getByText(/Loading files|Loading trash|Loading securely/).waitFor({ state: 'hidden' }).catch(() => {});
        if (route === '/drive') await page.locator('.file-card').first().waitFor();
        if (route === '/drive/trash') await page.locator('.trash-list-row').first().waitFor();
        if (route === '/drive/dashboard') await page.locator('.dashboard-storage-row').first().waitFor();
        if (route === '/drive/api-keys') await page.locator('.api-key-row').first().waitFor();
        if (route === '/share/test') await page.getByRole('link', { name: 'View File' }).waitFor();
        await check(`${size} ${route}`);
        if (route === '/drive') {
          await page.locator('.file-card').first().getByRole('button', { name: 'Actions', exact: true }).click();
          await check(`${size} card menu`);
          await page.getByRole('button', { name: 'Share', exact: true }).click();
          await page.getByRole('dialog').waitFor();
          await page.getByRole('button', { name: 'Copy Link', exact: true }).click({ trial: true });
          await check(`${size} share`); await closeDialog();
          await page.getByRole('button', { name: 'List view' }).click();
          await check(`${size} list view`);
          await page.getByRole('button', { name: 'Preview', exact: true }).first().click();
          await page.getByRole('dialog').waitFor(); await check(`${size} preview`); await closeDialog();
          await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
          await page.getByRole('dialog').waitFor(); await check(`${size} edit`); await closeDialog();
          for (const name of [/New Folder/, /Upload File/]) {
            await page.getByRole('button', { name }).click();
            await page.getByRole('dialog').waitFor(); await check(`${size} ${name}`); await closeDialog();
          }
          if (width < 1024) {
            await page.getByRole('button', { name: 'Open navigation' }).click();
            await page.getByRole('dialog').waitFor(); await check(`${size} navigation`);
            await page.getByRole('dialog').getByRole('link', { name: 'API Keys', exact: true }).click({ trial: true });
            await page.getByRole('button', { name: 'Account', exact: true }).click();
            await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
            await closeDialog();
            assert(await page.getByRole('button', { name: 'Open navigation' }).evaluate(el => el === document.activeElement), 'Drawer must return focus');
          }
        }
        if (route === '/drive/dashboard') {
          await page.getByRole('button', { name: 'Edit', exact: false }).first().click();
          await page.getByRole('dialog').waitFor();
          await page.locator('.storage-submit-button').click({ trial: true });
          await check(`${size} storage settings`); await closeDialog();
        }
        if (route === '/drive/trash') {
          await page.getByRole('button', { name: 'Delete permanently', exact: true }).first().click();
          await page.locator('.custom-modal').waitFor(); await check(`${size} delete confirmation`);
          await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        }
        if (route === '/drive/api-keys') {
          await page.getByRole('button', { name: /API Documentation/ }).click();
          await check(`${size} API documentation`);
          await page.getByRole('button', { name: 'Generate New Key', exact: true }).click();
          await page.locator('.custom-modal').waitFor(); await check(`${size} create key`);
          await page.getByPlaceholder('e.g. Production Environment').fill(longName);
          await page.getByRole('button', { name: 'Generate Key', exact: true }).click();
          await page.getByText('Key Created Successfully', { exact: true }).waitFor();
          await check(`${size} reveal key`);
          await page.getByRole('button', { name: "I've stored it safely" }).click();
        }
      }
    }
    await context.clearCookies();
    for (const route of ['/login', '/register', '/forgot-password', '/reset-password?token=test']) {
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto(baseURL + route); await page.locator('.auth-card').waitFor(); await check(`320 ${route}`);
    }
    assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });


