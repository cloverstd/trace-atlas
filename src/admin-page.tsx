import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Cloud,
  Database,
  FileClock,
  Fingerprint,
  LayoutDashboard,
  LogOut,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
  Square,
  Trash2,
  X,
  Footprints,
  Clock3,
} from 'lucide-react';
import { Brand } from './components/brand';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './components/ui/card';
import { api, post, ApiError } from './lib/api';
import { dateTime, area, cn } from './lib/utils';
import {
  ACTIVE_STATUSES,
  type SourceSettings,
  type SyncRun,
  type MapManifest,
} from '../shared/types';
type AuthStatus = { initialized: boolean; authenticated: boolean };
type Config = SourceSettings & { passwordConfigured?: boolean };
type Credential = { id: string; name: string; created_at: number; last_used_at: number | null };
const labels: Record<string, string> = {
  queued: '等待执行',
  listing: '扫描目录',
  processing: '解析数据',
  publishing: '发布地图',
  success: '已完成',
  failed: '同步失败',
  cancelled: '已取消',
};
const defaults: Config = {
  endpoint: 'https://dav.jianguoyun.com/dav',
  username: '',
  password: '',
  path: '',
  intervalMinutes: 60,
  enabled: true,
};
const authError = (e: unknown) =>
  e instanceof Error && e.name === 'NotAllowedError'
    ? '操作已取消，或设备未能完成 Passkey 验证。'
    : e instanceof Error
      ? e.message
      : '操作失败，请重试';
async function authenticate() {
  const optionsJSON = await post<PublicKeyCredentialRequestOptionsJSON>('/api/auth/login/options');
  const response = await startAuthentication({ optionsJSON });
  await post('/api/auth/login/verify', { response });
}
function Badge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'status-badge',
        status === 'success' && 'status-success',
        status === 'failed' && 'status-failed',
        ACTIVE_STATUSES.includes(status) && 'status-active',
      )}
    >
      <span />
      {labels[status] ?? status}
    </span>
  );
}
function Runs({ runs }: { runs: SyncRun[] }) {
  return runs.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>开始时间</th>
            <th>状态</th>
            <th>解析进度</th>
            <th>结果</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td>{dateTime(run.started_at)}</td>
              <td>
                <Badge status={run.status} />
              </td>
              <td className="tabular-nums">
                {run.processed} / {run.discovered}
              </td>
              <td className="run-result">
                {run.error ??
                  (run.status === 'success'
                    ? '同步完成'
                    : run.status === 'queued'
                      ? '等待下一次定时任务'
                      : run.status === 'cancelled'
                        ? '任务已停止'
                        : '正在处理')}
                {run.error && ACTIVE_STATUSES.includes(run.status) && (
                  <small>下次重试：{dateTime(run.next_attempt_at)}</small>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="table-empty">
      <FileClock size={28} strokeWidth={1.3} />
      <p>还没有同步记录</p>
      <span>配置数据源后，开始第一次同步。</span>
    </div>
  );
}
export default function AdminPage() {
  const [auth, setAuth] = useState<AuthStatus | null>(null),
    [fatal, setFatal] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [token, setToken] = useState(''),
    [tab, setTab] = useState('overview'),
    [config, setConfig] = useState<Config>(defaults),
    [runs, setRuns] = useState<SyncRun[]>([]),
    [credentials, setCredentials] = useState<Credential[]>([]),
    [manifest, setManifest] = useState<MapManifest | null>(null),
    [keyName, setKeyName] = useState('备用 Passkey');
  const [configured, setConfigured] = useState(false);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);
  const notify = (text: string, ok = true) => setNotice({ text, ok });
  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401)
      setAuth((old) => (old ? { ...old, authenticated: false } : null));
    notify(authError(e), false);
  };
  useEffect(() => {
    void api<AuthStatus>('/api/auth/status')
      .then(setAuth)
      .catch((e) => setFatal((e as Error).message));
  }, []);
  const refresh = async () => {
    const [r, m] = await Promise.all([
      api<SyncRun[]>('/api/admin/runs'),
      api<MapManifest | { empty: true }>('/api/public/manifest'),
    ]);
    setRuns(r);
    setManifest('empty' in m ? null : m);
  };
  useEffect(() => {
    if (!auth?.authenticated) return;
    let active = true;
    void Promise.all([
      api<Config | null>('/api/admin/settings'),
      api<Credential[]>('/api/admin/passkeys'),
      refresh(),
    ])
      .then(([c, keys]) => {
        if (!active) return;
        setConfig(c ? { ...c, password: '' } : defaults);
        setConfigured(!!c);
        setCredentials(keys);
      })
      .catch(fail);
    const timer = setInterval(() => void refresh().catch(fail), 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [auth?.authenticated]);
  const login = async () => {
    setBusy(true);
    try {
      await authenticate();
      setAuth({ initialized: true, authenticated: true });
      setNotice(null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const bootstrap = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const optionsJSON = await post<PublicKeyCredentialCreationOptionsJSON>(
        '/api/auth/bootstrap/options',
        { token },
      );
      const response = await startRegistration({ optionsJSON });
      await post('/api/auth/bootstrap/verify', { response, token, name: '我的 Passkey' });
      setToken('');
      setAuth({ initialized: true, authenticated: true });
      setNotice(null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const action = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const sync = () =>
    action(async () => {
      await post('/api/admin/sync');
      await refresh();
      notify('同步已加入任务，将在下一分钟开始。');
    });
  const logout = () =>
    action(async () => {
      await post('/api/auth/logout');
      setAuth({ initialized: true, authenticated: false });
      setNotice(null);
    });
  const active = runs.find((r) => ACTIVE_STATUSES.includes(r.status));
  const lastSuccess = runs.find((r) => r.status === 'success');
  const notification = notice && (
    <div
      className={cn('notice', notice.ok && 'notice-success')}
      role={notice.ok ? 'status' : 'alert'}
    >
      {notice.ok ? <CheckCircle2 size={16} /> : null}
      <span>{notice.text}</span>
      <button onClick={() => setNotice(null)} aria-label="关闭提示">
        <X size={16} />
      </button>
    </div>
  );
  if (!auth)
    return (
      <main className="auth-page">
        <Brand />
        <Card className="auth-card">
          <CardHeader>
            <CardTitle>{fatal ? '后台暂时不可用' : '正在连接后台'}</CardTitle>
            <CardDescription>{fatal || '正在检查管理员配置…'}</CardDescription>
          </CardHeader>
          {fatal && (
            <CardContent>
              <Button onClick={() => location.reload()}>重试</Button>
            </CardContent>
          )}
        </Card>
      </main>
    );
  if (!auth.authenticated)
    return (
      <main className="auth-page">
        <div className="auth-top">
          <Brand />
          <Link to="/" className="text-link">
            <ArrowLeft size={15} />
            返回地图
          </Link>
        </div>
        <div className="auth-layout">
          <div className="auth-intro">
            <span className="eyebrow">YOUR JOURNEY, IN GOOD HANDS</span>
            <h1>
              整理足迹，
              <br />
              继续探索。
            </h1>
            <p>
              连接世界迷雾数据，让每一段旅程
              <br />
              在自己的地图上延续。
            </p>
            <div className="auth-features">
              <span>
                <ShieldCheck />
                单管理员，安全访问
              </span>
              <span>
                <RefreshCw />
                自动同步，持续更新
              </span>
            </div>
          </div>
          <Card className="auth-card">
            <CardHeader>
              <div className="auth-icon">
                <Fingerprint size={32} strokeWidth={1.3} />
              </div>
              <CardTitle>{auth.initialized ? '欢迎回来' : '初始化管理员'}</CardTitle>
              <CardDescription>
                {auth.initialized
                  ? '使用设备上的 Passkey 安全登录。'
                  : '输入部署时设置的一次性口令，绑定第一个 Passkey。'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {auth.initialized ? (
                <>
                  <Button className="w-full" disabled={busy} onClick={login}>
                    <Fingerprint />
                    {busy ? '正在验证…' : '使用 Passkey 登录'}
                  </Button>
                  <p className="auth-hint">
                    支持指纹、面容识别或安全密钥。
                    <br />
                    本站不使用账号密码登录。
                  </p>
                </>
              ) : (
                <form onSubmit={bootstrap} className="form-stack">
                  <label htmlFor="bootstrap-token">
                    初始化口令
                    <Input
                      id="bootstrap-token"
                      type="password"
                      autoComplete="off"
                      required
                      minLength={32}
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="输入一次性初始化口令"
                    />
                  </label>
                  <Button disabled={busy} type="submit">
                    <Fingerprint />
                    {busy ? '正在绑定…' : '创建管理员 Passkey'}
                  </Button>
                  <p className="auth-hint">
                    完成后初始化入口会关闭，
                    <br />
                    之后仅通过 Passkey 登录。
                  </p>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
        <p className="auth-footer">TRACE ATLAS · 留下每一步探索的印记</p>
        {notification}
      </main>
    );
  const items = [
    { id: 'overview', label: '概览', icon: LayoutDashboard },
    { id: 'settings', label: '数据源设置', icon: Cloud },
    { id: 'history', label: '同步记录', icon: FileClock },
    { id: 'security', label: '通行密钥', icon: Fingerprint },
  ];
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Brand compact />
        <div className="sidebar-section-label">工作空间</div>
        <nav>
          {items.map((item) => (
            <button
              key={item.id}
              className={cn('nav-item', tab === item.id && 'selected')}
              onClick={() => setTab(item.id)}
            >
              <item.icon size={18} />
              {item.label}
              {tab === item.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link to="/" className="nav-item">
            <ArrowUpRight size={18} />
            查看公开地图
          </Link>
          <div className="admin-identity">
            <span>
              <ShieldCheck size={18} />
            </span>
            <div>
              <strong>管理员</strong>
              <small>Passkey 已验证</small>
            </div>
            <button onClick={logout} disabled={busy} aria-label="退出登录">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <span>
            管理后台 <span className="breadcrumb-divider">/</span>{' '}
            <strong>{items.find((i) => i.id === tab)?.label}</strong>
          </span>
          <span className="secure-label">
            <ShieldCheck size={14} />
            安全会话
          </span>
        </header>
        <main className="admin-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">TRACE ATLAS / WORKSPACE</span>
              <h1>
                {tab === 'overview'
                  ? '探索概览'
                  : tab === 'settings'
                    ? '连接你的足迹'
                    : tab === 'history'
                      ? '每一次更新，都有记录'
                      : '管理通行密钥'}
              </h1>
              <p>
                {tab === 'overview'
                  ? '所有走过的地方，正在这里汇聚。'
                  : tab === 'settings'
                    ? '从坚果云自动读取世界迷雾的云端同步文件。'
                    : tab === 'history'
                      ? '查看同步进度、处理结果和需要关注的问题。'
                      : '为同一个管理员绑定设备，安全地访问后台。'}
              </p>
            </div>
            {tab === 'overview' && (
              <Button disabled={busy || !configured || !!active} onClick={sync}>
                <RefreshCw className={active ? 'spin' : ''} />
                {active ? '同步中' : '立即同步'}
              </Button>
            )}
          </div>
          {tab === 'overview' && (
            <>
              <div className="stat-cards">
                <Card>
                  <CardContent className="pt-5">
                    <span className="metric-label">
                      <Footprints />
                      已探索面积
                    </span>
                    <div className="metric-value">
                      {manifest ? area(manifest.areaM2) : '—'}
                      <small>km²</small>
                    </div>
                    <p>根据探索位图估算</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5">
                    <span className="metric-label">
                      <Database />
                      已发布数据文件
                    </span>
                    <div className="metric-value">
                      {manifest?.tileCount ?? '—'}
                      <small>个</small>
                    </div>
                    <p>来自世界迷雾 Sync 目录</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5">
                    <span className="metric-label">
                      <Clock3 />
                      最近成功同步
                    </span>
                    <div className="metric-time">
                      {dateTime(lastSuccess?.finished_at ?? manifest?.updatedAt)}
                    </div>
                    <p>
                      {active
                        ? labels[active.status]
                        : config.enabled && configured
                          ? `每 ${config.intervalMinutes} 分钟检查更新`
                          : '自动同步尚未开启'}
                    </p>
                  </CardContent>
                </Card>
              </div>
              {!configured && (
                <div className="setup-banner">
                  <div className="banner-icon">
                    <Cloud size={24} />
                  </div>
                  <div>
                    <h2>连接数据源，点亮第一片地图</h2>
                    <p>准备坚果云应用密码和世界迷雾 Sync 路径，即可开始。</p>
                  </div>
                  <Button onClick={() => setTab('settings')}>
                    配置数据源 <ArrowUpRight />
                  </Button>
                </div>
              )}
              {active && (
                <Card className="sync-progress">
                  <CardContent className="pt-5">
                    <div>
                      <strong>
                        <RefreshCw className="spin" size={16} />
                        {labels[active.status]}
                      </strong>
                      <span>
                        {active.processed} / {active.discovered} 个文件
                      </span>
                    </div>
                    <progress value={active.processed} max={Math.max(1, active.discovered)} />
                    <p>
                      {active.error ??
                        '任务分批执行，关闭页面后仍会继续。首次同步可能需要较长时间。'}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        action(async () => {
                          await post('/api/admin/sync/cancel');
                          await refresh();
                          notify('同步已停止。');
                        })
                      }
                    >
                      <Square />
                      停止当前同步
                    </Button>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <div className="card-heading-row">
                    <div>
                      <CardTitle>最近同步</CardTitle>
                      <CardDescription>仅完整成功的数据会发布到地图。</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setTab('history')}>
                      全部记录 <ArrowUpRight />
                    </Button>
                  </div>
                </CardHeader>
                <Runs runs={runs.slice(0, 5)} />
              </Card>
              <div className="workspace-note">
                <ShieldCheck size={15} />
                <span>前台公开展示，数据配置与管理操作仅对你开放。</span>
              </div>
            </>
          )}
          {tab === 'settings' && (
            <Card className="settings-card">
              <CardHeader>
                <div className="section-icon">
                  <Cloud />
                </div>
                <CardTitle>坚果云 WebDAV</CardTitle>
                <CardDescription>使用坚果云「第三方应用管理」生成的应用密码。</CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="form-stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action(async () => {
                      await api('/api/admin/settings', {
                        method: 'PUT',
                        body: JSON.stringify(config),
                      });
                      setConfig({ ...config, password: '', passwordConfigured: true });
                      setConfigured(true);
                      await refresh();
                      notify('数据源设置已保存。');
                    });
                  }}
                >
                  <label htmlFor="endpoint">
                    服务地址
                    <Input id="endpoint" value={config.endpoint} readOnly />
                  </label>
                  <div className="form-columns">
                    <label htmlFor="username">
                      坚果云账号
                      <Input
                        id="username"
                        autoComplete="username"
                        value={config.username}
                        onChange={(e) => setConfig({ ...config, username: e.target.value })}
                        required
                        placeholder="你的坚果云账号"
                      />
                    </label>
                    <label htmlFor="password">
                      应用密码
                      {config.passwordConfigured && <small className="inline-hint">已配置</small>}
                      <Input
                        id="password"
                        type="password"
                        autoComplete="new-password"
                        value={config.password}
                        onChange={(e) => setConfig({ ...config, password: e.target.value })}
                        required={!config.passwordConfigured}
                        placeholder={
                          config.passwordConfigured ? '留空保留已有密码' : '输入应用专用密码'
                        }
                      />
                    </label>
                  </div>
                  <label htmlFor="path">
                    Sync 目录路径
                    <Input
                      id="path"
                      value={config.path}
                      onChange={(e) => setConfig({ ...config, path: e.target.value })}
                      required
                      placeholder="例如 /Fog of World/Sync"
                    />
                    <span className="field-help">
                      填写坚果云中的实际 Sync 路径。程序只读取该目录。
                    </span>
                  </label>
                  <div className="form-separator" />
                  <div className="toggle-row">
                    <div>
                      <strong>自动同步</strong>
                      <p>定期检查新增和修改的数据文件。</p>
                    </div>
                    <input
                      aria-label="开启自动同步"
                      className="switch"
                      type="checkbox"
                      checked={config.enabled}
                      onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                    />
                  </div>
                  <label htmlFor="interval">
                    检查间隔（分钟）
                    <Input
                      id="interval"
                      type="number"
                      min={30}
                      max={10080}
                      required
                      value={config.intervalMinutes}
                      onChange={(e) =>
                        setConfig({ ...config, intervalMinutes: Number(e.target.value) })
                      }
                    />
                    <span className="field-help">默认 60 分钟；同步期间不会重复启动任务。</span>
                  </label>
                  <div className="form-actions">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        action(async () => {
                          const result = await post<{ filesOnPage: number; hasMore: boolean }>(
                            '/api/admin/settings/test',
                            config,
                          );
                          notify(
                            `连接成功，当前页发现 ${result.filesOnPage} 个迷雾文件${result.hasMore ? '，还有后续分页' : ''}。`,
                          );
                        })
                      }
                    >
                      <Play />
                      测试连接
                    </Button>
                    <Button type="submit" disabled={busy}>
                      <Save />
                      保存设置
                    </Button>
                  </div>
                  <p className="field-help">保存配置会停止当前同步任务，后续任务使用新配置。</p>
                </form>
              </CardContent>
            </Card>
          )}
          {tab === 'history' && (
            <Card>
              <CardHeader>
                <div className="card-heading-row">
                  <div>
                    <CardTitle>同步记录</CardTitle>
                    <CardDescription>显示最近 50 次任务，记录保留 30 天。</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    disabled={busy || !configured || !!active}
                    onClick={sync}
                  >
                    <RefreshCw />
                    立即同步
                  </Button>
                </div>
              </CardHeader>
              <Runs runs={runs} />
            </Card>
          )}
          {tab === 'security' && (
            <div className="security-grid">
              <Card>
                <CardHeader>
                  <CardTitle>已绑定的 Passkey</CardTitle>
                  <CardDescription>
                    所有凭证都属于同一个管理员。增删操作需要再次验证。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="credential-list">
                    {credentials.map((key) => (
                      <div className="credential" key={key.id}>
                        <span className="credential-icon">
                          <Fingerprint />
                        </span>
                        <div>
                          <strong>{key.name}</strong>
                          <p>添加于 {dateTime(key.created_at)}</p>
                          <small>
                            最近使用：{key.last_used_at ? dateTime(key.last_used_at) : '尚未使用'}
                          </small>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`删除 ${key.name}`}
                          disabled={busy || credentials.length <= 1}
                          onClick={() => {
                            if (
                              !window.confirm(
                                `删除「${key.name}」后，其登录会话也会失效。确定删除？`,
                              )
                            )
                              return;
                            void action(async () => {
                              await authenticate();
                              await api(`/api/admin/passkeys/${encodeURIComponent(key.id)}`, {
                                method: 'DELETE',
                              });
                              setCredentials(await api<Credential[]>('/api/admin/passkeys'));
                              notify('Passkey 已删除。');
                            });
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <p className="field-help">至少保留一个 Passkey。建议添加备用设备或安全密钥。</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <div className="section-icon">
                    <Fingerprint />
                  </div>
                  <CardTitle>添加备用 Passkey</CardTitle>
                  <CardDescription>先验证已有凭证，再绑定新的设备或安全密钥。</CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    className="form-stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(async () => {
                        await authenticate();
                        const optionsJSON = await post<PublicKeyCredentialCreationOptionsJSON>(
                          '/api/admin/passkeys/options',
                        );
                        const response = await startRegistration({ optionsJSON });
                        await post('/api/admin/passkeys/verify', { response, name: keyName });
                        setCredentials(await api<Credential[]>('/api/admin/passkeys'));
                        notify('备用 Passkey 已添加。');
                      });
                    }}
                  >
                    <label htmlFor="key-name">
                      凭证名称
                      <Input
                        id="key-name"
                        value={keyName}
                        onChange={(e) => setKeyName(e.target.value)}
                        required
                        maxLength={80}
                      />
                    </label>
                    <Button disabled={busy}>
                      <Fingerprint />
                      验证并添加
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}
        </main>
        <footer className="admin-footer">
          <span>TRACE ATLAS</span>
          <span>
            <Check size={13} /> 让足迹持续生长
          </span>
        </footer>
      </div>
      {notification}
    </div>
  );
}
