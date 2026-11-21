import { test, expect, type Page } from '@playwright/test';
// Deterministic SDK boundary double; real Tencent authentication and mainland
// connectivity require an owner-provided key and are not claimed by these tests.
const sdk = `
window.TMap={
 Point:class{constructor(x,y){this.x=x;this.y=y}},
 LatLng:class{constructor(lat,lng){this.lat=lat;this.lng=lng}getLat(){return this.lat}getLng(){return this.lng}},
 LatLngBounds:class{constructor(sw,ne){this.sw=sw;this.ne=ne}},
 Map:class{
 constructor(el,options){this.el=el;this.center=options.center;this.zoom=options.zoom;this.events={};el.style.background='#b6cfb1';setTimeout(()=>this.emit('tilesloaded'),30)}
 getCenter(){return this.center}getZoom(){return this.zoom}setZoom(z){this.zoom=z;this.emit('bounds_changed')}
 xy(p){return [(p.lng+180)/360,(1-Math.log(Math.tan(Math.PI/4+p.lat*Math.PI/360))/Math.PI)/2]}
 projectToContainer(p){const a=this.xy(p),b=this.xy(this.center),w=256*2**this.zoom;return {x:(a[0]-b[0])*w+this.el.clientWidth/2,y:(a[1]-b[1])*w+this.el.clientHeight/2}}
 unprojectFromContainer(p){if(!(p instanceof window.TMap.Point))throw new TypeError('Point instance required');const c=this.xy(this.center),w=256*2**this.zoom,x=c[0]+(p.x-this.el.clientWidth/2)/w,y=c[1]+(p.y-this.el.clientHeight/2)/w;return new window.TMap.LatLng(Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI,x*360-180)}
 fitBounds(b,o){this.center=new window.TMap.LatLng((b.sw.lat+b.ne.lat)/2,(b.sw.lng+b.ne.lng)/2);this.zoom=o.maxZoom;this.emit('bounds_changed')}
 on(e,cb){(this.events[e]??=new Set()).add(cb)}off(e,cb){this.events[e]?.delete(cb)}emit(e){this.events[e]?.forEach(cb=>cb())}destroy(){this.events={};this.el.replaceChildren()}
 }
};window.traceAtlasTencentReady();`;
const style = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#b6cfb1' } }],
};
async function setup(page: Page) {
  await page.route('**/api/public/map-config', (route) =>
    route.fulfill({ json: { tencentKey: 'test-only-key' } }),
  );
  await page.route('**/api/public/manifest', (route) => route.fulfill({ json: { empty: true } }));
  await page.route('https://map.qq.com/api/gljs?**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: sdk }),
  );
}
async function settings(page: Page) {
  await page.getByLabel('地图显示设置').click();
}
test('healthy OpenFreeMap is retained and switching preserves display preferences', async ({
  page,
}) => {
  await setup(page);
  await page.route('https://tiles.openfreemap.org/**', (r) => r.fulfill({ json: style }));
  let tencentRequests = 0;
  page.on('request', (r) => {
    if (r.url().startsWith('https://map.qq.com/')) tencentRequests++;
  });
  await page.goto('/');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect(page.locator('.map-connection')).toHaveCount(0);
  expect(tencentRequests).toBe(0);
  await settings(page);
  await page.getByLabel('路径粗细').fill('4');
  await page.getByLabel('迷雾浓度').fill('0.55');
  await page.getByLabel('底图', { exact: true }).selectOption('tencent');
  await expect(page.locator('.tencent-fog')).toBeVisible();
  await expect(page.locator('.map-connection')).toHaveCount(0);
  await expect(page.getByLabel('路径粗细')).toHaveValue('4');
  await expect(page.getByLabel('迷雾浓度')).toHaveValue('0.55');
  await expect(page.locator('.tencent-fog')).toHaveCSS('opacity', '0.55');
  await page.getByLabel('放大地图').click();
  await page.getByLabel('底图', { exact: true }).selectOption('openfreemap');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect(page.locator('.tencent-fog')).toHaveCount(0);
  await page.reload();
  await settings(page);
  await expect(page.getByLabel('底图', { exact: true })).toHaveValue('openfreemap');
});
test('network failure falls back once without changing automatic preference', async ({ page }) => {
  await setup(page);
  await page.route('https://tiles.openfreemap.org/**', (r) => r.abort());
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.tencent-fog')).toBeVisible();
  await settings(page);
  await expect(page.getByLabel('底图', { exact: true })).toHaveValue('auto');
  await expect(page.getByText('当前：腾讯地图')).toBeVisible();
  await expect(page.locator('.map-connection')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('slow OpenFreeMap falls back after timeout; manual choice suppresses fallback', async ({
  page,
}) => {
  await setup(page);
  await page.route('https://tiles.openfreemap.org/**', async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 9000));
    await r.fulfill({ json: style }).catch(() => {});
  });
  await page.goto('/');
  await expect(page.locator('.tencent-fog')).toBeVisible({ timeout: 10000 });
  await settings(page);
  await page.getByLabel('底图', { exact: true }).selectOption('openfreemap');
  await expect(page.getByText('地图加载失败，可重试或切换地图')).toBeVisible({ timeout: 9000 });
  await expect(page.locator('.tencent-fog')).toHaveCount(0);
});
test('both providers unavailable yields a retry instead of a switch loop', async ({ page }) => {
  await setup(page);
  await page.route('https://tiles.openfreemap.org/**', (r) => r.abort());
  await page.route('https://map.qq.com/api/gljs?**', (r) => r.abort());
  await page.goto('/');
  await expect(page.getByText('地图加载失败，可重试或切换地图')).toBeVisible();
  await expect(page.getByRole('button', { name: '重试', exact: true })).toBeVisible();
  await page.route('https://map.qq.com/api/gljs?**', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: sdk }),
  );
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.locator('.tencent-fog')).toBeVisible();
  await expect(page.locator('.map-connection')).toHaveCount(0);
});

test('Tencent projects a Chinese explored patch and redraws it at higher zoom', async ({
  page,
}) => {
  await setup(page);
  await page.addInitScript(() => localStorage.setItem('trace-atlas-map', 'tencent'));
  const version = '55555555-5555-5555-5555-555555555555',
    x = 418,
    y = 210,
    id = y * 512 + x;
  const ll = (px: number, py: number) => [
    (px / 2 ** 22) * 360 - 180,
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * py) / 2 ** 22))) * 180) / Math.PI,
  ];
  const nw = ll(x * 8192, y * 8192),
    se = ll(x * 8192 + 64, y * 8192 + 64);
  const overview = Buffer.alloc(2048);
  overview[0] = 128;
  await page.route('**/api/public/manifest', (r) =>
    r.fulfill({
      json: {
        format: 1,
        version,
        updatedAt: Date.now(),
        areaM2: 100000,
        bounds: [nw[0], se[1], se[0], nw[1]],
        tileCount: 1,
        overviewPages: 1,
      },
    }),
  );
  await page.route(`**/api/public/data/${version}/overview/0?encoding=2`, (r) =>
    r.fulfill({ json: [{ id, x, y, bitmap: overview.toString('base64') }] }),
  );
  await page.route(`**/api/public/data/${version}/tile/${id}?encoding=2`, (r) =>
    r.fulfill({
      json: {
        format: 1,
        id,
        x,
        y,
        blocks: [{ index: 0, bitmap: Buffer.alloc(512, 255).toString('base64') }],
      },
    }),
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const alpha = () =>
    page.locator('.tencent-fog').evaluate((el) => {
      const canvas = el as HTMLCanvasElement,
        ctx = canvas.getContext('2d')!;
      return [
        ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data[3],
        ctx.getImageData(0, 0, 1, 1).data[3],
      ];
    });
  await expect.poll(alpha).toEqual([0, 255]);
  await page.getByLabel('放大地图').click();
  await expect.poll(alpha).toEqual([0, 255]);
  await page.screenshot({ path: 'test-results/tencent-fog.png' });
  expect(errors).toEqual([]);
});
