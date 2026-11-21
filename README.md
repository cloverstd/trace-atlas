# Trace Atlas

将坚果云中的世界迷雾（Fog of World）原生 `Sync` 文件同步到 Cloudflare，在公开网页上展示探索地图。前台无须登录；后台只有一个管理员，使用 Passkey 登录。

技术栈：React、TypeScript、shadcn/ui、Tailwind CSS、MapLibre GL JS、Hono、Cloudflare Workers / D1 / R2。底图由 OpenFreeMap 提供。

## 本地开发

需要 Node.js 22.12+、pnpm 9+。

```sh
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
```

编辑 `.dev.vars`，分别生成初始化口令和加密密钥（每次执行生成一个新值）：

```sh
openssl rand -hex 32
```

保留开发地址 `APP_ORIGIN=http://localhost:5173`、`RP_ID=localhost`，然后执行：

```sh
pnpm db:migrate
pnpm dev
```

打开 `http://localhost:5173`；后台为 `/admin`。第一次访问后台输入 `ADMIN_BOOTSTRAP_TOKEN`，再使用设备或安全密钥创建 Passkey。请始终使用 `localhost`，不要混用 IP 地址。

本地 Vite 不会按真实时间自动执行 Cron。在后台点击「立即同步」后，可通过本地调试入口推进一次任务：

```sh
curl 'http://localhost:5173/cdn-cgi/local/scheduled?format=json'
```

该调试入口由开发工具提供，生产环境不暴露手动执行后台任务的公共接口。

## 部署到 Cloudflare

1. 登录 Cloudflare 并创建资源：

   ```sh
   pnpm exec wrangler login
   pnpm exec wrangler d1 create trace-atlas
   pnpm exec wrangler r2 bucket create trace-atlas
   ```

2. 在 `wrangler.jsonc` 中将 `database_id` 占位值替换为真实 D1 ID。设置正式 HTTPS `APP_ORIGIN` 和对应的 `RP_ID`，例如 `https://atlas.example.com` 与 `atlas.example.com`。需要自定义域名时添加：

   ```json
   "routes": [{ "pattern": "atlas.example.com", "custom_domain": true }]
   ```

   先确定正式域名再绑定 Passkey。不同 RP ID 的 Passkey 不能互换。`workers.dev` 地址也可以作为正式地址，但 Origin 与 RP ID 必须准确匹配。

3. 设置两个独立的随机 Secret。`CONFIG_ENCRYPTION_KEY` 必须是 64 位十六进制字符串；初始化口令至少 32 个字符。

   ```sh
   pnpm exec wrangler secret put ADMIN_BOOTSTRAP_TOKEN
   pnpm exec wrangler secret put CONFIG_ENCRYPTION_KEY
   pnpm db:migrate:remote
   pnpm run deploy
   ```

4. 在正式域名 `/admin` 绑定 Passkey。首次绑定后，普通初始化入口即使持有原口令也无法再使用。
5. 后台填写坚果云账号、应用密码、实际 `Sync` 路径，先测试连接，再保存并开始同步。

R2 不需要开启公共访问。原始文件不提供公共下载接口，展示数据由 Worker 按已发布版本提供。项目未配置自动部署，也不会在测试时访问生产数据库。

### 坚果云配置

- 服务地址固定为 `https://dav.jianguoyun.com/dav`，使用「安全选项 → 第三方应用管理」生成的应用密码。
- 路径必须是你的实际世界迷雾 `Sync` 目录；界面中的 `/Fog of World/Sync` 只是示例。
- 只读取 WebDAV，不修改或删除坚果云文件。
- 跟随 `Link: rel="next"` 分页；默认最多 10 次 WebDAV 请求/分钟，遇到 429 / 503 等错误退避重试。
- 更换账号、服务地址或目录时，下一次成功发布会整体替换展示数据。保存配置会取消尚未完成的同步。

参考：[坚果云 WebDAV 授权与限制](https://help.jianguoyun.com/?p=2064)。

## 同步与存储设计

Cron 每分钟推进一个小任务，默认每小时发起一次目录扫描。任务阶段为：

```text
queued → listing → processing → publishing → success
                       ↘ failed / cancelled
```

- 目录响应暂存至 R2，分批处理 24 个条目，控制单次 D1 查询数量。
- 每个变更文件分别执行下载、解析；下载使用固定长度流，解析验证文件名、块索引、长度和位图校验值。
- 以 ETag 判断变化；没有 ETag 时使用修改时间和文件大小。未变化的文件复用已有解析对象。
- 如果所有展示数据均未变化，成功结束同步并保留当前版本，避免重复发布和使浏览器缓存失效。
- 同一个数据源最多一个活动任务；租约防止并发执行，租约令牌防止已取消任务写回结果。
- 远端删除必须在连续两次完整且成功的扫描中确认。损坏文件、目录扫描失败不会清空已发布地图。
- 分页生成概览与版本清单，所有对象写入成功后，使用 D1 原子批处理切换当前版本。
- 保留当前和上一成功版本；更早版本至少保留 24 小时。后台空闲时每 10 分钟增量回收无引用 R2 对象，任务记录保留 30 天。

D1 保存配置、凭证、会话、任务状态、文件索引和版本引用；R2 保存 `raw/`、`parsed/`、`listing/`、`snapshots/` 对象。公开 API 只访问已发布快照引用的解析对象。

地图缩放较小时使用按块生成的概览；放大后加载对应区域的精细位图，在浏览器 Web Worker 中提取探索轮廓、简化像素阶梯，并以平滑曲线路径按当前缩放与屏幕分辨率绘制。相邻地图块使用边缘数据衔接，内部空洞保留。显示时会以圆滑曲线补接距离近、方向一致的短断点，不跨越较远间隔或连接平行路线。地图显示设置提供五档路径粗细，并在当前浏览器记住选择；左下角探索概览默认折叠，点击带动画展开。原始位图和面积统计不受显示平滑、补接或粗细调整影响；显示轮廓为近似边界。位图保留原始探索像素，地图不包含时间轨迹、行程距离或历史回放。面积基于 Web Mercator 每行像素在球面的面积计算，因此标为估算值，未承诺与原 App 的统计完全一致。

### 免费额度与付费切换

默认按免费额度控制每次任务规模，大量文件的首次同步可能需要数小时甚至更长。免费 Workers 的单次 CPU 限制是 10 ms；分批不能保证一个较大的文件仍能在该限制内完成。

正式接入后检查 Workers 的 CPU 时间、`exceededCpu` 错误，以及后台任务进度。若最小文件解析任务仍反复超限，应将 Worker 切换到 Paid；数据、域名、R2 和 D1 均无需迁移。反复中断的任务会最终标记失败，不会覆盖现有地图。

R2 Standard 有免费存储及操作额度，但不是硬性的零费用保证。公开访问量、文件数量及同步频率都会影响用量。参考 [Workers 限制](https://developers.cloudflare.com/workers/platform/limits/) 与 [R2 计费](https://developers.cloudflare.com/r2/pricing/)。

## Passkey 与恢复

- 固定管理员支持多个 Passkey；必须保留至少一个凭证。
- 新增或删除凭证前重新进行 Passkey 验证，验证窗口为 5 分钟。
- Challenge 单次使用、5 分钟有效；会话有效期 7 天，Cookie 为 HttpOnly、SameSite=Strict，正式 HTTPS 环境启用 Secure。
- 删除一个 Passkey 时，同时撤销该凭证创建的会话。
- WebDAV 应用密码用 AES-GCM 加密；配置读取接口不返回密文或密码。

如果所有 Passkey 都丢失，由持有 Cloudflare 管理权限的人先轮换初始化口令，再执行：

```sh
pnpm exec wrangler secret put ADMIN_BOOTSTRAP_TOKEN
pnpm admin:reset --confirm --remote
```

此命令撤销所有 Passkey、会话和 Challenge，然后允许重新绑定同一个管理员。不会删除地图或数据源配置。省略 `--remote` 仅重置本地开发数据。

保管好 `CONFIG_ENCRYPTION_KEY`；直接更换它会使已保存的应用密码无法解密。更换密钥后，应在后台重新输入应用密码并保存配置。

## API

| 路径                                           | 访问权限 | 用途                                                           |
| ---------------------------------------------- | -------- | -------------------------------------------------------------- |
| `GET /api/public/manifest`                     | 公开     | 当前版本、范围、面积及概览页数；无数据返回 `{ "empty": true }` |
| `GET /api/public/data/:version/overview/:page` | 公开     | 指定版本的概览位图页                                           |
| `GET /api/public/data/:version/tile/:id`       | 公开     | 指定版本的精细位图                                             |
| `/api/auth/*`                                  | 验证流程 | 初始化、Passkey 登录、状态、退出                               |
| `/api/admin/settings`                          | 管理员   | 配置读取和更新                                                 |
| `POST /api/admin/settings/test`                | 管理员   | 测试连接和第一页文件识别                                       |
| `GET /api/admin/runs`                          | 管理员   | 最近同步记录                                                   |
| `POST /api/admin/sync`                         | 管理员   | 幂等创建同步任务，返回 202                                     |
| `POST /api/admin/sync/cancel`                  | 管理员   | 停止任务并延后下一次自动同步                                   |
| `/api/admin/passkeys/*`                        | 管理员   | 凭证管理                                                       |

## 验证

```sh
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
pnpm format:check
```

单元与集成测试在真正的 Workers 本地运行时中执行，使用隔离的 D1 / R2，并模拟 WebDAV 响应。覆盖解析、751 个文件分页、幂等同步、删除确认、发布失败保留旧版本、限流退避和认证边界。

Playwright 使用独立的 **e2e 本地数据库和 R2**，通过 Chromium 虚拟认证器验证真实 WebAuthn 注册和登录，同时检查桌面及手机页面。`.dev.vars.e2e` 仅含公开测试值；不要部署 `e2e` 环境。测试截图保存在 `test-results/`。

正式发布前仍需用自己的 Sync 数据验证：文件格式兼容性、街道级位置对齐、面积估算，以及实际 Workers CPU 消耗。自动测试使用合成数据，未包含个人真实轨迹。

## 主要目录

- `src/`：公开地图、管理界面、浏览器位图渲染线程及 shadcn/ui 组件。
- `worker/`：Hono API、WebAuthn、WebDAV、解析器和定时任务。
- `shared/`：共享数据类型和配置校验。
- `migrations/`：D1 SQL 迁移。
- `tests/`：Workers 集成测试及浏览器端到端测试。

文件格式研究的来源及许可证见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

## 双地图与腾讯 Key

公开地图默认选择“自动选择”：实际加载 OpenFreeMap 的样式及可见资源，首次加载超过 6 秒或资源报错时，若已设置腾讯 Key，则自动切到腾讯 JavaScript GL。腾讯 SDK 加载限时 12 秒，地图首次瓦片加载总限时 16 秒；两个服务均失败时显示重试，不循环切换。右侧“地图显示设置 → 底图”可手动选择 OpenFreeMap、腾讯地图或恢复自动选择。手动选择保存在当前浏览器，优先于自动回退；自动模式每次打开页面重新尝试 OpenFreeMap。

本地将 `TENCENT_MAP_KEY` 填入 `.dev.vars`；生产环境用 `pnpm exec wrangler secret put TENCENT_MAP_KEY` 交互输入自己的腾讯位置服务 JavaScript GL Key（不要提交到仓库）。无需重新构建前端；刷新网页即可读取新配置。未设置时腾讯选项不可选，OpenFreeMap 保持可用。这个浏览器 Key 会通过 `/api/public/map-config` 和 SDK 请求传给浏览器，并非服务器私密凭据。

腾讯地图使用独立 SDK，不使用付费 WMTS 或非公开瓦片接口。足迹轮廓及连接曲线在渲染 Worker 内转换到 GCJ-02 显示坐标；原始数据、统计面积保持 WGS84。显示转换采用本地近似算法，实际道路对齐需用自己的 Key 验证；海外底图权限需在腾讯控制台确认。自动回退及双引擎渲染有模拟 SDK 浏览器测试，但真实 Key 授权、国内连通性和腾讯地图实景效果仍需真实环境验收。
