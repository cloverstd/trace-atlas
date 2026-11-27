import { test, expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
async function offlineBasemap(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('https://tiles.openfreemap.org/**', (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': '#b6cfb1' } },
        ],
      },
    }),
  );
}
test('public map has an honest empty state and works on mobile', async ({ page }) => {
  await offlineBasemap(page);
  await page.route('**/api/public/manifest', (route) => route.fulfill({ json: { empty: true } }));
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '世界很大，足迹即将点亮' })).toBeVisible();
  await expect(page.locator('a[href*="admin"]')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(/后台|管理员|配置|同步|Passkey/);
  await expect(page.locator('.map-caption, .live-badge')).toHaveCount(0);
  const statsToggle = page.getByRole('button', { name: '探索概览' });
  await expect(statsToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#exploration-details')).toHaveAttribute('aria-hidden', 'true');
  await statsToggle.click();
  await expect(statsToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('数据更新时间')).toBeVisible();
  await statsToggle.click();
  await page.screenshot({ path: 'test-results/public-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: '世界很大，足迹即将点亮' })).toBeVisible();
  await expect(page.getByLabel('放大地图')).toBeVisible();
  await page.getByLabel('地图显示设置').click();
  await expect(page.getByRole('slider', { name: /迷雾浓度/ })).toBeVisible();
  const width = page.getByRole('slider', { name: /路径粗细/ });
  await width.fill('5');
  await expect(width).toHaveAttribute('aria-valuetext', '最粗');
  await page.reload();
  await page.getByLabel('地图显示设置').click();
  await expect(page.getByRole('slider', { name: /路径粗细/ })).toHaveValue('5');
  await expect(page.getByRole('button', { name: '探索概览' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await page.screenshot({ path: 'test-results/public-mobile.png' });
  expect(errors).toEqual([]);
});
test('renders a precise explored patch without authentication', async ({ page }) => {
  await offlineBasemap(page);
  const version = '22222222-2222-2222-2222-222222222222',
    tileId = 131328;
  const overview = Buffer.alloc(2048);
  overview[0] = 128;
  await page.route('**/api/public/manifest', (route) =>
    route.fulfill({
      json: {
        format: 1,
        version,
        updatedAt: 1793145600000,
        areaM2: 100000,
        bounds: [0, -0.0055, 0.0055, 0],
        tileCount: 1,
        overviewPages: 1,
      },
    }),
  );
  await page.route(`**/api/public/data/${version}/overview/0?encoding=2`, (route) =>
    route.fulfill({ json: [{ id: tileId, x: 256, y: 256, bitmap: overview.toString('base64') }] }),
  );
  await page.route(`**/api/public/data/${version}/tile/${tileId}?encoding=2`, (route) =>
    route.fulfill({
      json: {
        format: 1,
        id: tileId,
        x: 256,
        y: 256,
        blocks: [{ index: 0, bitmap: Buffer.alloc(512, 255).toString('base64') }],
      },
    }),
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const loaded = page.waitForResponse((response) => response.url().includes(`/tile/${tileId}`));
  await page.goto('/');
  await page.getByLabel('回到探索范围').click();
  await loaded;
  await page.getByRole('button', { name: '探索概览' }).click();
  await expect(page.getByText('0.1', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('正在加载足迹')).not.toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1000);
  const shot = await page.screenshot({ path: 'test-results/public-data.png' });
  const png = PNG.sync.read(shot);
  const center = (Math.floor(png.height / 2) - 5) * png.width * 4 + Math.floor(png.width / 2) * 4;
  expect([...png.data.subarray(center, center + 3)]).toEqual([182, 207, 177]);
  expect([...png.data.subarray(center + 40 * 4, center + 40 * 4 + 3)]).not.toEqual([182, 207, 177]);
  const edgeColors = new Set(
    Array.from({ length: 41 }, (_, x) =>
      [...png.data.subarray(center + x * 4, center + x * 4 + 3)].join(','),
    ),
  );
  expect(edgeColors.size).toBeGreaterThan(2);
  await page.getByLabel('放大地图').click();
  await expect
    .poll(async () => {
      const zoomed = PNG.sync.read(await page.screenshot());
      return [...zoomed.data.subarray(center + 40 * 4, center + 40 * 4 + 3)];
    })
    .toEqual([182, 207, 177]);
  await expect(page.getByRole('alert')).not.toBeVisible();
  expect(errors).toEqual([]);
});
test('real WebAuthn bootstrap, admin configuration, logout and passkey login', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable', { enableUI: false });
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: '初始化管理员' })).toBeVisible();
  await page
    .getByLabel('初始化口令')
    .fill('test-only-bootstrap-token-with-more-than-32-characters');
  await page.getByRole('button', { name: '创建管理员 Passkey' }).click();
  await expect(page.getByRole('heading', { name: '探索概览' })).toBeVisible({ timeout: 20000 });
  expect((await page.context().cookies()).find((c) => c.name === 'ta_session')?.httpOnly).toBe(
    true,
  );
  await page.getByRole('button', { name: '数据源设置', exact: true }).click();
  await page.getByLabel('坚果云账号').fill('test@example.com');
  await page.getByLabel('应用密码').fill('test-password-not-a-real-credential');
  await page.getByLabel('Sync 目录路径').fill('/Fog of World/Sync');
  await page.getByLabel('开启自动同步').uncheck();
  await page.getByRole('button', { name: '保存设置' }).click();
  await expect(page.getByText('数据源设置已保存。')).toBeVisible();
  const settings = await (await page.request.get('/api/admin/settings')).json();
  expect(settings.passwordConfigured).toBe(true);
  expect(JSON.stringify(settings)).not.toContain('test-password');
  expect(settings.encryptedPassword).toBeUndefined();
  await page.getByRole('button', { name: '概览', exact: true }).click();
  await page.screenshot({ path: 'test-results/admin-desktop.png' });
  await page.getByRole('button', { name: '通行密钥', exact: true }).click();
  await expect(page.getByRole('button', { name: '删除 我的 Passkey' })).toBeDisabled();
  await page.getByLabel('退出登录').click();
  await expect(page.getByRole('button', { name: '使用 Passkey 登录' })).toBeVisible();
  await page.getByRole('button', { name: '使用 Passkey 登录' }).click();
  await page.getByRole('button', { name: '通行密钥', exact: true }).click();
  await expect(page.getByRole('heading', { name: '管理通行密钥' })).toBeVisible({ timeout: 20000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '概览', exact: true }).click();
  await page.screenshot({ path: 'test-results/admin-mobile.png' });
  const bootstrap = await page.request.post('/api/auth/bootstrap/options', {
    headers: { Origin: 'http://localhost:5174' },
    data: { token: 'test-only-bootstrap-token-with-more-than-32-characters' },
  });
  expect(bootstrap.status()).toBe(409);
});

test('keeps a magnified diagonal contour smooth instead of native pixel stairs', async ({
  page,
}) => {
  await offlineBasemap(page);
  const version = '33333333-3333-3333-3333-333333333333';
  const bitmap = Buffer.alloc(512),
    overview = Buffer.alloc(2048);
  overview[0] = 128;
  for (let y = 4; y < 60; y++)
    for (let x = 4; x < 60; x++)
      if (Math.abs(x - y) <= 3) bitmap[y * 8 + (x >> 3)] |= 128 >> (x & 7);
  await page.route('**/api/public/manifest', (r) =>
    r.fulfill({
      json: {
        format: 1,
        version,
        updatedAt: 1793145600000,
        areaM2: 100000,
        bounds: [0, -0.0055, 0.0055, 0],
        tileCount: 1,
        overviewPages: 1,
      },
    }),
  );
  await page.route(`**/api/public/data/${version}/overview/0?encoding=2`, (r) =>
    r.fulfill({ json: [{ id: 131328, x: 256, y: 256, bitmap: overview.toString('base64') }] }),
  );
  await page.route(`**/api/public/data/${version}/tile/131328?encoding=2`, (r) =>
    r.fulfill({
      json: {
        format: 1,
        id: 131328,
        x: 256,
        y: 256,
        blocks: [{ index: 0, bitmap: bitmap.toString('base64') }],
      },
    }),
  );
  await page.goto('/');
  await expect(page.getByText('正在加载足迹')).not.toBeVisible({ timeout: 15000 });
  await page.getByLabel('回到探索范围').click();
  await page.waitForTimeout(500);
  for (let i = 0; i < 4; i++) {
    await page.getByLabel('放大地图').click();
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(500);
  const png = PNG.sync.read(await page.screenshot({ path: 'test-results/vector-zoom.png' }));
  const edge: number[] = [];
  for (let y = 280; y < 430; y++) {
    for (let x = 400; x < 900; x++) {
      if (png.data[(y * png.width + x) * 4 + 1] > 130) {
        edge.push(x);
        break;
      }
    }
  }
  expect(edge.length).toBe(150);
  // At zoom 17, one source pixel spans 16 screen pixels. A raster staircase
  // repeats its edge for long runs; a reconstructed diagonal advances each row.
  expect(new Set(edge).size).toBeGreaterThan(120);
  expect(await page.getByRole('alert').count()).toBe(0);
});

test('connects short aligned gaps and changes the visible path thickness', async ({ page }) => {
  await offlineBasemap(page);
  const version = '44444444-4444-4444-4444-444444444444';
  const bitmap = Buffer.alloc(512),
    overview = Buffer.alloc(2048);
  overview[0] = 128;
  for (let y = 30; y < 34; y++)
    for (let x = 10; x < 46; x++) if (x < 26 || x >= 30) bitmap[y * 8 + (x >> 3)] |= 128 >> (x & 7);
  await page.route('**/api/public/manifest', (r) =>
    r.fulfill({
      json: {
        format: 1,
        version,
        updatedAt: 1793145600000,
        areaM2: 100000,
        bounds: [0, -0.0055, 0.0055, 0],
        tileCount: 1,
        overviewPages: 1,
      },
    }),
  );
  await page.route(`**/api/public/data/${version}/overview/0?encoding=2`, (r) =>
    r.fulfill({ json: [{ id: 131328, x: 256, y: 256, bitmap: overview.toString('base64') }] }),
  );
  await page.route(`**/api/public/data/${version}/tile/131328?encoding=2`, (r) =>
    r.fulfill({
      json: {
        format: 1,
        id: 131328,
        x: 256,
        y: 256,
        blocks: [{ index: 0, bitmap: bitmap.toString('base64') }],
      },
    }),
  );
  await page.goto('/');
  await page.getByLabel('回到探索范围').click();
  await page.waitForTimeout(500);
  for (let i = 0; i < 4; i++) {
    await page.getByLabel('放大地图').click();
    await page.waitForTimeout(350);
  }
  await page.getByLabel('地图显示设置').click();
  const width = page.getByRole('slider', { name: /路径粗细/ });
  await width.fill('1');
  await page.waitForTimeout(500);
  const thin = PNG.sync.read(await page.screenshot({ path: 'test-results/connected-thin.png' }));
  const rows = Array.from({ length: 450 }, (_, i) => i + 100).filter(
    (y) => thin.data[(y * thin.width + 640) * 4 + 1] > 180,
  );
  expect(rows.length).toBeGreaterThan(40);
  const middle = rows[Math.floor(rows.length / 2)];
  for (let x = 450; x < 800; x++)
    expect(thin.data[(middle * thin.width + x) * 4 + 1]).toBeGreaterThan(180);
  await width.fill('5');
  await page.waitForTimeout(500);
  const thick = PNG.sync.read(await page.screenshot({ path: 'test-results/connected-thick.png' }));
  const count = (png: PNG) =>
    Array.from({ length: 450 }, (_, i) => png.data[((100 + i) * png.width + 640) * 4 + 1]).filter(
      (g) => g > 180,
    ).length;
  expect(count(thick)).toBeGreaterThan(count(thin) + 30);
  await expect(page.getByRole('alert')).not.toBeVisible();
});
