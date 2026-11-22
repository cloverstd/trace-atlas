import { useEffect, useState, type FormEvent } from 'react';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';
import { RefreshCw } from 'lucide-react';
import { AdminAuthLoadingView, AdminAuthView } from '@/components/admin/admin-auth-view';
import { AdminShell } from '@/components/admin/admin-shell';
import { HistoryTab } from '@/components/admin/history-tab';
import { OverviewTab } from '@/components/admin/overview-tab';
import { SecurityTab } from '@/components/admin/security-tab';
import { SettingsTab } from '@/components/admin/settings-tab';
import {
  DEFAULT_CONFIG,
  type AdminConfig,
  type AdminTabId,
  type AuthStatus,
  type PasskeyCredential,
} from '@/components/admin/types';
import { NoticeToast } from '@/components/notice-toast';
import { Button } from '@/components/ui/button';
import { api, post, ApiError } from '@/lib/api';
import { ACTIVE_STATUSES, type SyncRun, type MapManifest } from '../shared/types';

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

export default function AdminPage() {
  const [auth, setAuth] = useState<AuthStatus | null>(null),
    [fatal, setFatal] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [token, setToken] = useState(''),
    [tab, setTab] = useState<AdminTabId>('overview'),
    [config, setConfig] = useState<AdminConfig>(DEFAULT_CONFIG),
    [runs, setRuns] = useState<SyncRun[]>([]),
    [credentials, setCredentials] = useState<PasskeyCredential[]>([]),
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
      api<AdminConfig | null>('/api/admin/settings'),
      api<PasskeyCredential[]>('/api/admin/passkeys'),
      refresh(),
    ])
      .then(([c, keys]) => {
        if (!active) return;
        setConfig(c ? { ...c, password: '' } : DEFAULT_CONFIG);
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
  const cancelSync = () =>
    action(async () => {
      await post('/api/admin/sync/cancel');
      await refresh();
      notify('同步已停止。');
    });
  const saveSettings = (e: FormEvent) => {
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
  };
  const testSettings = () =>
    action(async () => {
      const result = await post<{ filesOnPage: number; hasMore: boolean }>(
        '/api/admin/settings/test',
        config,
      );
      notify(
        `连接成功，当前页发现 ${result.filesOnPage} 个迷雾文件${result.hasMore ? '，还有后续分页' : ''}。`,
      );
    });
  const deletePasskey = (key: PasskeyCredential) => {
    if (!window.confirm(`删除「${key.name}」后，其登录会话也会失效。确定删除？`)) return;
    void action(async () => {
      await authenticate();
      await api(`/api/admin/passkeys/${encodeURIComponent(key.id)}`, {
        method: 'DELETE',
      });
      setCredentials(await api<PasskeyCredential[]>('/api/admin/passkeys'));
      notify('Passkey 已删除。');
    });
  };
  const addPasskey = (e: FormEvent) => {
    e.preventDefault();
    void action(async () => {
      await authenticate();
      const optionsJSON = await post<PublicKeyCredentialCreationOptionsJSON>(
        '/api/admin/passkeys/options',
      );
      const response = await startRegistration({ optionsJSON });
      await post('/api/admin/passkeys/verify', { response, name: keyName });
      setCredentials(await api<PasskeyCredential[]>('/api/admin/passkeys'));
      notify('备用 Passkey 已添加。');
    });
  };
  const notification = notice && (
    <NoticeToast text={notice.text} ok={notice.ok} onDismiss={() => setNotice(null)} />
  );

  if (!auth) return <AdminAuthLoadingView fatal={fatal} />;
  if (!auth.authenticated)
    return (
      <AdminAuthView
        initialized={auth.initialized}
        busy={busy}
        token={token}
        onTokenChange={setToken}
        onLogin={login}
        onBootstrap={bootstrap}
        notification={notification}
      />
    );

  return (
    <AdminShell
      tab={tab}
      onTabChange={setTab}
      busy={busy}
      onLogout={logout}
      headerAction={
        tab === 'overview' ? (
          <Button disabled={busy || !configured || !!active} onClick={sync}>
            <RefreshCw className={active ? 'spin' : ''} aria-hidden="true" />
            {active ? '同步中' : '立即同步'}
          </Button>
        ) : undefined
      }
      notification={notification}
    >
      {tab === 'overview' && (
        <OverviewTab
          manifest={manifest}
          config={config}
          configured={configured}
          runs={runs}
          active={active}
          lastSuccess={lastSuccess}
          busy={busy}
          onNavigate={setTab}
          onCancelSync={cancelSync}
        />
      )}
      {tab === 'settings' && (
        <SettingsTab
          config={config}
          busy={busy}
          onChange={setConfig}
          onTest={testSettings}
          onSubmit={saveSettings}
        />
      )}
      {tab === 'history' && (
        <HistoryTab
          runs={runs}
          busy={busy}
          configured={configured}
          hasActive={!!active}
          onSync={sync}
        />
      )}
      {tab === 'security' && (
        <SecurityTab
          credentials={credentials}
          keyName={keyName}
          busy={busy}
          onKeyNameChange={setKeyName}
          onDelete={deletePasskey}
          onAdd={addPasskey}
        />
      )}
    </AdminShell>
  );
}
