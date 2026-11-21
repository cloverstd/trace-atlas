import { HEADER, BLOCK_BYTES, tileFilename } from '../worker/lib/fog';
import { base64 } from '../worker/lib/crypto';
export function fixture(id = 131328, indices = [0, 63, 64, 4095]) {
  const data = new Uint8Array(HEADER + BLOCK_BYTES);
  new DataView(data.buffer).setUint16(0, 1, true);
  for (const pixel of indices) data[HEADER + (pixel >> 3)] |= 128 >> (pixel % 8);
  const checksum = indices.length * 2 + 1;
  data[HEADER + 513] = checksum >> 8;
  data[HEADER + 514] = checksum & 255;
  return { id, name: tileFilename(id), data, bitmap: base64(data.subarray(HEADER, HEADER + 512)) };
}
export async function deflate(bytes: Uint8Array<ArrayBuffer>) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export function listingXml(
  files: { name: string; size: number; etag?: string }[],
  root = '/dav/Fog%20of%20World/Sync/',
) {
  return `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>${root}</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>${files.map((f) => `<d:response><d:href>${root}${f.name}</d:href><d:propstat><d:prop><d:resourcetype/><d:getetag>${f.etag ?? '&quot;v1&quot;'}</d:getetag><d:getlastmodified>Wed, 28 Oct 2026 00:00:00 GMT</d:getlastmodified><d:getcontentlength>${f.size}</d:getcontentlength></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`).join('')}</d:multistatus>`;
}
