export function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
export function unbase64(s: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
export function randomToken(): string {
  return base64(crypto.getRandomValues(new Uint8Array(32)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
export async function hash(s: string): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))),
    (v) => v.toString(16).padStart(2, '0'),
  ).join('');
}
export async function equalSecret(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([hash(a), hash(b)]);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}
async function key(hex: string) {
  if (!/^[0-9a-f]{64}$/i.test(hex ?? ''))
    throw new Error('CONFIG_ENCRYPTION_KEY must be 32 random bytes in hexadecimal');
  return crypto.subtle.importKey(
    'raw',
    Uint8Array.from(hex.match(/../g)!, (b) => parseInt(b, 16)),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function encrypt(secret: string, hex: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('trace-atlas:webdav:v1') },
    await key(hex),
    new TextEncoder().encode(secret),
  );
  return `${base64(iv)}.${base64(new Uint8Array(data))}`;
}
export async function decrypt(cipher: string, hex: string) {
  const [iv, data] = cipher.split('.');
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: unbase64(iv),
        additionalData: new TextEncoder().encode('trace-atlas:webdav:v1'),
      },
      await key(hex),
      unbase64(data),
    ),
  );
}
