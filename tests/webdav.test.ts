import { describe, it, expect } from 'vitest';
import { parseListing, safeUrl, rootUrl } from '../worker/lib/webdav';
import { fixture, listingXml } from './fixtures';
import type { StoredSettings } from '../shared/types';
const config: StoredSettings = {
  endpoint: 'https://dav.jianguoyun.com/dav',
  username: 'test',
  encryptedPassword: 'unused',
  path: '/Fog of World/Sync',
  enabled: true,
  intervalMinutes: 60,
};
describe('Nutstore WebDAV', () => {
  it('reads namespaced properties and follows next Link without dropping the first actual file', () => {
    const f = fixture();
    const xml = listingXml([{ name: f.name, size: 42 }]);
    const p = parseListing(
      xml,
      config,
      rootUrl(config),
      `<${rootUrl(config)}?cursor=next>; rel="next"`,
    );
    expect(p.files).toEqual([
      {
        path: f.name,
        tileId: f.id,
        size: 42,
        etag: '"v1"',
        modified: 'Wed, 28 Oct 2026 00:00:00 GMT',
      },
    ]);
    expect(p.next).toContain('cursor=next');
    const noDirectory = xml.replace(/<d:response>[\s\S]*?<\/d:response>/, '');
    expect(parseListing(noDirectory, config, rootUrl(config), null).files).toHaveLength(1);
  });
  it('supports root entries without a trailing slash', () =>
    expect(safeUrl(rootUrl(config).slice(0, -1), config).pathname).toContain('/Sync'));
  it('rejects off-host pagination, path escapes and XML entities', () => {
    const xml = listingXml([]);
    for (const url of [
      'https://evil.test/dav/Fog%20of%20World/Sync/',
      '../elsewhere/',
      '%2e%2e/private',
      'https://dav.jianguoyun.com/dav/Other/',
    ])
      expect(() => safeUrl(url, config)).toThrow();
    expect(() =>
      parseListing(xml, config, rootUrl(config), '<https://evil.test/>; rel="next"'),
    ).toThrow();
    expect(() =>
      parseListing('<!DOCTYPE x [<!ENTITY x "bad">]>' + xml, config, rootUrl(config), null),
    ).toThrow();
  });
  it('rejects partial property failures instead of treating missing files as deletions', () => {
    const f = fixture();
    const xml = listingXml([{ name: f.name, size: 4 }]).replaceAll(
      'HTTP/1.1 200 OK',
      'HTTP/1.1 403 Forbidden',
    );
    expect(() => parseListing(xml, config, rootUrl(config), null)).toThrow();
  });
});
