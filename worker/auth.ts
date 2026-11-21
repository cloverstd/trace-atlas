import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
  AuthenticatorTransport,
} from '@simplewebauthn/server';
import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv, Session } from './types';
import { base64, unbase64, randomToken, hash, equalSecret } from './lib/crypto';
import { rateLimit, requireOrigin, jsonBody } from './lib/http';
import { z } from 'zod';
const SESSION = 'ta_session',
  CHALLENGE = 'ta_challenge';
interface Credential {
  id: string;
  public_key: string;
  counter: number;
  transports: string;
  name: string;
}
interface Challenge {
  id: string;
  kind: string;
  challenge: string;
  generation: number;
  expires_at: number;
  session_hash: string | null;
}
function cookieOptions(c: Context<AppEnv>) {
  return {
    httpOnly: true,
    secure: new URL(c.env.APP_ORIGIN).protocol === 'https:',
    sameSite: 'Strict' as const,
    path: '/',
  };
}
async function state(c: Context<AppEnv>) {
  return (await c.env.DB.prepare('SELECT * FROM admin_state WHERE id=1').first<{
    initialized: number;
    generation: number;
  }>())!;
}
export async function getSession(c: Context<AppEnv>): Promise<Session | null> {
  const token = getCookie(c, SESSION);
  if (!token) return null;
  return c.env.DB.prepare('SELECT * FROM sessions WHERE hash=? AND expires_at>?')
    .bind(await hash(token), Date.now())
    .first<Session>();
}
export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const s = await getSession(c);
  if (!s) throw new HTTPException(401, { message: '请先使用 Passkey 登录' });
  c.set('session', s);
  if (!['GET', 'HEAD'].includes(c.req.method)) requireOrigin(c);
  await next();
};
async function challenge(
  c: Context<AppEnv>,
  kind: string,
  value: string,
  sessionHash: string | null = null,
) {
  const id = randomToken();
  const s = await state(c);
  await c.env.DB.prepare(
    'INSERT INTO challenges(id,kind,challenge,generation,expires_at,session_hash) VALUES (?,?,?,?,?,?)',
  )
    .bind(id, kind, value, s.generation, Date.now() + 300000, sessionHash)
    .run();
  setCookie(c, CHALLENGE, id, { ...cookieOptions(c), maxAge: 300 });
}
async function consume(c: Context<AppEnv>, kind: string) {
  const id = getCookie(c, CHALLENGE);
  deleteCookie(c, CHALLENGE, { path: '/' });
  if (!id) throw new HTTPException(400, { message: '验证已过期，请重试' });
  const row = await c.env.DB.prepare('DELETE FROM challenges WHERE id=? RETURNING *')
    .bind(id)
    .first<Challenge>();
  const s = await state(c);
  if (!row || row.kind !== kind || row.expires_at < Date.now() || row.generation !== s.generation)
    throw new HTTPException(400, { message: '验证已过期，请重试' });
  return row;
}
async function bootstrapAllowed(c: Context<AppEnv>, token: unknown) {
  if ((await state(c)).initialized) throw new HTTPException(409, { message: '管理员已初始化' });
  if (
    typeof token !== 'string' ||
    !c.env.ADMIN_BOOTSTRAP_TOKEN ||
    c.env.ADMIN_BOOTSTRAP_TOKEN.length < 32 ||
    !(await equalSecret(token, c.env.ADMIN_BOOTSTRAP_TOKEN))
  )
    throw new HTTPException(403, { message: '初始化口令不正确或未配置' });
}
async function newSession(c: Context<AppEnv>, credentialId: string) {
  const token = randomToken(),
    now = Date.now();
  await c.env.DB.prepare(
    'INSERT INTO sessions(hash,credential_id,expires_at,verified_at) VALUES (?,?,?,?)',
  )
    .bind(await hash(token), credentialId, now + 7 * 86400000, now)
    .run();
  setCookie(c, SESSION, token, { ...cookieOptions(c), maxAge: 7 * 86400 });
}
async function registrationOptions(c: Context<AppEnv>) {
  const creds = await c.env.DB.prepare('SELECT id,transports FROM credentials').all<Credential>();
  return generateRegistrationOptions({
    rpName: 'Trace Atlas',
    rpID: c.env.RP_ID,
    userName: 'admin',
    userDisplayName: '管理员',
    userID: new TextEncoder().encode('trace-atlas-administrator'),
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    excludeCredentials: creds.results.map((r) => ({
      id: r.id,
      transports: JSON.parse(r.transports),
    })),
  });
}
async function verifyRegistration(
  c: Context<AppEnv>,
  ch: Challenge,
  response: RegistrationResponseJSON,
) {
  try {
    const v = await verifyRegistrationResponse({
      response,
      expectedChallenge: ch.challenge,
      expectedOrigin: c.env.APP_ORIGIN,
      expectedRPID: c.env.RP_ID,
      requireUserVerification: true,
    });
    if (!v.verified || !v.registrationInfo) throw new Error();
    return v.registrationInfo;
  } catch {
    throw new HTTPException(400, { message: 'Passkey 绑定验证失败，请重试' });
  }
}
const bodySchema = z.object({
  response: z.unknown(),
  name: z.string().trim().min(1).max(80).default('我的 Passkey'),
  token: z.string().optional(),
});
export const auth = new Hono<AppEnv>();
auth.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  if (c.req.method !== 'GET') {
    requireOrigin(c);
    await rateLimit(c.env, `auth:${c.req.header('CF-Connecting-IP') ?? 'local'}`, 30);
  }
  await next();
});
auth.get('/status', async (c) =>
  c.json({ initialized: !!(await state(c)).initialized, authenticated: !!(await getSession(c)) }),
);
auth.post('/bootstrap/options', async (c) => {
  const b = z.object({ token: z.string() }).parse(await jsonBody(c));
  await bootstrapAllowed(c, b.token);
  const opts = await registrationOptions(c);
  await challenge(c, 'bootstrap', opts.challenge);
  return c.json(opts);
});
auth.post('/bootstrap/verify', async (c) => {
  const b = bodySchema.parse(await jsonBody(c));
  await bootstrapAllowed(c, b.token);
  const ch = await consume(c, 'bootstrap');
  const info = await verifyRegistration(c, ch, b.response as RegistrationResponseJSON);
  const cr = info.credential;
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO credentials(id,public_key,counter,transports,device_type,backed_up,name,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM admin_state WHERE id=1 AND initialized=0 AND generation=?)',
    ).bind(
      cr.id,
      base64(cr.publicKey),
      cr.counter,
      JSON.stringify(cr.transports ?? []),
      info.credentialDeviceType,
      +info.credentialBackedUp,
      b.name,
      Date.now(),
      ch.generation,
    ),
    c.env.DB.prepare(
      'UPDATE admin_state SET initialized=1 WHERE id=1 AND initialized=0 AND generation=?',
    ).bind(ch.generation),
  ]);
  if (!results[0].meta.changes) throw new HTTPException(409, { message: '管理员已初始化' });
  await newSession(c, cr.id);
  return c.json({ ok: true });
});
auth.post('/login/options', async (c) => {
  if (!(await state(c)).initialized) throw new HTTPException(409, { message: '请先初始化管理员' });
  const opts = await generateAuthenticationOptions({
    rpID: c.env.RP_ID,
    userVerification: 'required',
  });
  await challenge(c, 'login', opts.challenge);
  return c.json(opts);
});
auth.post('/login/verify', async (c) => {
  const b = z.object({ response: z.unknown() }).parse(await jsonBody(c));
  const ch = await consume(c, 'login');
  const response = b.response as AuthenticationResponseJSON;
  const cr = await c.env.DB.prepare('SELECT * FROM credentials WHERE id=?')
    .bind(typeof response?.id === 'string' ? response.id : '')
    .first<Credential>();
  if (!cr) throw new HTTPException(400, { message: 'Passkey 验证失败' });
  let newCounter: number;
  try {
    const v = await verifyAuthenticationResponse({
      response,
      expectedChallenge: ch.challenge,
      expectedOrigin: c.env.APP_ORIGIN,
      expectedRPID: c.env.RP_ID,
      requireUserVerification: true,
      credential: {
        id: cr.id,
        publicKey: unbase64(cr.public_key),
        counter: cr.counter,
        transports: JSON.parse(cr.transports) as AuthenticatorTransport[],
      },
    });
    if (!v.verified) throw new Error();
    newCounter = v.authenticationInfo.newCounter;
  } catch {
    throw new HTTPException(400, { message: 'Passkey 验证失败，请重试' });
  }
  const changed = await c.env.DB.prepare(
    'UPDATE credentials SET counter=?,last_used_at=? WHERE id=? AND counter=?',
  )
    .bind(newCounter, Date.now(), cr.id, cr.counter)
    .run();
  if (!changed.meta.changes) throw new HTTPException(409, { message: '凭证已变更，请重试' });
  const old = getCookie(c, SESSION);
  if (old)
    await c.env.DB.prepare('DELETE FROM sessions WHERE hash=?')
      .bind(await hash(old))
      .run();
  await newSession(c, cr.id);
  return c.json({ ok: true });
});
auth.post('/logout', async (c) => {
  const token = getCookie(c, SESSION);
  if (token)
    await c.env.DB.prepare('DELETE FROM sessions WHERE hash=?')
      .bind(await hash(token))
      .run();
  deleteCookie(c, SESSION, { path: '/' });
  return c.json({ ok: true });
});
export const passkeys = new Hono<AppEnv>();
passkeys.get('/', async (c) =>
  c.json(
    (
      await c.env.DB.prepare(
        'SELECT id,name,created_at,last_used_at FROM credentials ORDER BY created_at',
      ).all()
    ).results,
  ),
);
passkeys.use('*', async (c, next) => {
  if (c.req.method !== 'GET' && Date.now() - c.get('session').verified_at > 300000)
    throw new HTTPException(403, { message: '请重新使用 Passkey 登录后再管理凭证' });
  await next();
});
passkeys.post('/options', async (c) => {
  const opts = await registrationOptions(c);
  await challenge(c, 'add', opts.challenge, c.get('session').hash);
  return c.json(opts);
});
passkeys.post('/verify', async (c) => {
  const b = bodySchema.parse(await jsonBody(c));
  const ch = await consume(c, 'add');
  if (ch.session_hash !== c.get('session').hash)
    throw new HTTPException(403, { message: '会话不匹配' });
  const info = await verifyRegistration(c, ch, b.response as RegistrationResponseJSON);
  const cr = info.credential;
  await c.env.DB.prepare(
    'INSERT INTO credentials(id,public_key,counter,transports,device_type,backed_up,name,created_at) VALUES (?,?,?,?,?,?,?,?)',
  )
    .bind(
      cr.id,
      base64(cr.publicKey),
      cr.counter,
      JSON.stringify(cr.transports ?? []),
      info.credentialDeviceType,
      +info.credentialBackedUp,
      b.name,
      Date.now(),
    )
    .run();
  return c.json({ ok: true });
});
passkeys.delete('/:id', async (c) => {
  const r = await c.env.DB.prepare(
    'DELETE FROM credentials WHERE id=? AND (SELECT COUNT(*) FROM credentials)>1',
  )
    .bind(c.req.param('id'))
    .run();
  if (!r.meta.changes)
    throw new HTTPException(409, { message: '不能删除最后一个 Passkey，或该凭证已不存在' });
  return c.json({ ok: true });
});
