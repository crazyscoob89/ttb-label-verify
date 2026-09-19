import { afterEach, describe, expect, test, vi } from 'vitest';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { crc32, deflateSync } from 'node:zlib';
import { parseApplication } from '../lib/contracts';
import { bindPairs, sanitizeImage, preparePair, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS } from '../lib/intake';
import { application, image, animationControl } from './fixtures/synthetic';

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const file = async (format: 'png' | 'jpeg' = 'png') => ({ filename: `label.${format}`, mime: `image/${format}`, bytes: await image(format) });
const manifest = (filename = 'label.png') => [{ filename, application }];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('application contract', () => {
  test('preserves declared identity and strings, normalizes only decimal ABV', () => {
    const result = parseApplication({ ...application, brand: ' Sample Brand ' });
    expect(result).toEqual({ ...application, brand: ' Sample Brand ', abv: 40 });
  });
  test.each([undefined, null, '', ' ', '\t', true, [], {}, 'NaN', NaN, Infinity, 'Infinity', '0x28', '4e1', '40%', '+40', '-0', '1,5', '40junk', -1, 101])('rejects missing or ambiguous ABV: %j', abv => {
    expect(() => parseApplication({ ...application, abv })).toThrow();
  });
  test.each([0, '0', '40.5', ' 40.5 ', 100])('accepts explicit bounded decimal ABV %j', abv => {
    expect(parseApplication({ ...application, abv }).abv).toBe(Number(abv));
  });
  test.each(['applicationId', 'applicationVersion', 'brand', 'classType', 'netContents', 'producerName', 'producerAddress', 'commodity'])('requires %s rather than defaults', key => {
    expect(() => parseApplication({ ...application, [key]: undefined })).toThrow();
    expect(() => parseApplication({ ...application, [key]: '   ' })).toThrow();
  });
  test.each(['applicationId', 'applicationVersion'])('rejects surrounding identifier whitespace for %s', key => {
    expect(() => parseApplication({ ...application, [key]: ' id ' })).toThrow();
  });
  test('requires explicit import flag and origin context', () => {
    for (const value of [undefined, 'false', 0]) expect(() => parseApplication({ ...application, imported: value })).toThrow();
    expect(() => parseApplication({ ...application, origin: undefined })).toThrow();
    expect(() => parseApplication({ ...application, imported: true })).toThrow();
    expect(() => parseApplication({ ...application, origin: { kind: 'imported', country: 'France' } })).toThrow();
    expect(() => parseApplication({ ...application, imported: true, origin: { kind: 'imported', country: ' ' } })).toThrow();
    expect(() => parseApplication({ ...application, imported: true, origin: { kind: 'imported', country: 'United States' } })).toThrow();
    expect(parseApplication({ ...application, imported: true, origin: { kind: 'imported', country: 'France' } }).origin.country).toBe('France');
  });
  test('rejects editable warning and other undeclared fields', () => {
    expect(() => parseApplication({ ...application, governmentWarning: 'replacement' })).toThrow();
    expect(() => parseApplication({ ...application, actor: 'admin' })).toThrow();
  });
});

describe('explicit filename binding', () => {
  test('maps by exact filename, never array order', async () => {
    const a = await file(); const b = { ...a, filename: 'second.png' };
    const other = { ...application, applicationId: 'SYNTH-002' };
    const result = bindPairs([b, a], [...manifest(), { filename: b.filename, application: other }]);
    expect(result[0].image.filename).toBe(a.filename);
    expect(result[0].application.applicationId).toBe(application.applicationId);
    expect(result[1].image.filename).toBe(b.filename);
    expect(result[1].application.applicationId).toBe(other.applicationId);
  });
  test('rejects duplicate manifest and file names', async () => {
    const a = await file();
    expect(() => bindPairs([a], [...manifest(), ...manifest()])).toThrow();
    expect(() => bindPairs([a, a], manifest())).toThrow();
  });
  test('rejects missing, unmatched and extra files before decoding', async () => {
    const a = await file();
    expect(() => bindPairs([], manifest())).toThrow();
    expect(() => bindPairs([a], [])).toThrow();
    expect(() => bindPairs([a], manifest('missing.png'))).toThrow();
    expect(() => bindPairs([a, { ...a, filename: 'extra.png' }], manifest())).toThrow();
  });
  test.each(['../label.png', '/label.png', 'C:\\label.png', 'https://example.com/label.png', ' label.png', 'label.png ', 'a\u0000.png'])('rejects paths, URLs and ambiguous names %j', async filename => {
    const a = await file();
    expect(() => bindPairs([{ ...a, filename }], manifest(filename))).toThrow();
  });
  test('rejects repeated application identity/version and too many pairs', async () => {
    const a = await file();
    expect(() => bindPairs([a, { ...a, filename: 'b.png' }], [...manifest(), ...manifest('b.png')])).toThrow();
    expect(() => bindPairs(Array(301).fill(a), Array(301).fill(manifest()[0]))).toThrow();
  });
  test('validates application before dispatch and rejects malformed manifest', async () => {
    const a = await file();
    expect(() => bindPairs([a], [{ filename: a.filename, application: { ...application, abv: undefined } }])).toThrow();
    expect(() => bindPairs([a], { arbitrary: true })).toThrow();
  });
});

describe('buffer-only image sanitation', () => {
  test.each(['png', 'jpeg'] as const)('fully decodes and re-encodes %s with dimensions, MIME and both hashes', async format => {
    const input = await file(format);
    const result = await sanitizeImage(input);
    expect(result.mime).toBe(`image/${format}`);
    expect(result.width).toBe(4); expect(result.height).toBe(3);
    expect(result.sourceSha256).toBe(sha(input.bytes));
    expect(result.sanitizedSha256).toBe(sha(result.bytes));
    expect(result.bytes).not.toBe(input.bytes);
    expect((await sharp(result.bytes).metadata()).format).toBe(format);
    expect(Object.keys(result).sort()).toEqual(['bytes', 'height', 'mime', 'sanitizedSha256', 'sourceSha256', 'width']);
  });
  test.each(['jpeg', 'png'] as const)('strips %s EXIF and ICC while applying orientation; hashes original and sanitized independently', async format => {
    const bytes = await sharp(await image(format)).withMetadata({ orientation: 6 })[format]().toBuffer();
    expect((await sharp(bytes).metadata()).exif).toBeDefined();
    const result = await sanitizeImage({ filename: `meta.${format}`, mime: `image/${format}`, bytes });
    const metadata = await sharp(result.bytes).metadata();
    expect(metadata.exif).toBeUndefined(); expect(metadata.icc).toBeUndefined(); expect(metadata.xmp).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
    expect([result.width, result.height]).toEqual([3, 4]);
    expect(result.sourceSha256).toBe(sha(bytes));
    expect(result.sanitizedSha256).not.toBe(result.sourceSha256);
  });
  test('rejects zero bytes and byte overflow without decoding', async () => {
    const input = await file();
    await expect(sanitizeImage({ ...input, bytes: Buffer.alloc(0) })).rejects.toThrow();
    await expect(sanitizeImage({ ...input, bytes: Buffer.alloc(MAX_IMAGE_BYTES + 1) })).rejects.toThrow();
  });
  test('enforces the 20MP decoder limit', async () => {
    expect(MAX_IMAGE_PIXELS).toBe(20_000_000);
    await expect(sanitizeImage({ filename: 'large.png', mime: 'image/png', bytes: await image('png', 5000, 4001) })).rejects.toThrow();
  });
  test.each([
    { filename: 'fake.jpg', mime: 'image/png' },
    { filename: 'fake.png', mime: 'image/jpeg' },
    { filename: 'fake.svg', mime: 'image/png' },
    { filename: 'fake.png', mime: 'application/octet-stream' },
  ])('rejects misleading extension/MIME %j', async overrides => {
    await expect(sanitizeImage({ ...await file(), ...overrides })).rejects.toThrow();
  });
  test('rejects corrupt, spoofed, truncated and unsupported buffers', async () => {
    const input = await file();
    for (const bytes of [Buffer.from('<svg/>'), Buffer.from('GIF89a'), Buffer.concat([input.bytes.subarray(0, 8), Buffer.alloc(50)]), input.bytes.subarray(0, -5)]) {
      await expect(sanitizeImage({ ...input, bytes })).rejects.toThrow();
    }
    const jpeg = await file('jpeg');
    await expect(sanitizeImage({ ...jpeg, bytes: jpeg.bytes.subarray(0, -2) })).rejects.toThrow();
    await expect(sanitizeImage({ ...jpeg, bytes: Buffer.concat([jpeg.bytes.subarray(0, 12), Buffer.alloc(30), jpeg.bytes.subarray(-2)]) })).rejects.toThrow();
  });
  test('animation rejection uses a well-formed two-frame APNG, not just corrupt bytes', async () => {
    const bytes = animationControl(await image());
    const types: string[] = [];
    for (let offset = 8; offset < bytes.length;) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.toString('ascii', offset + 4, offset + 8);
      types.push(type);
      expect(bytes.readUInt32BE(offset + 8 + length)).toBe(crc32(bytes.subarray(offset + 4, offset + 8 + length)));
      offset += 12 + length;
    }
    expect(types.filter(type => type === 'fcTL')).toHaveLength(2);
    expect(types).toContain('fdAT');
    // A decoder can display its first frame; our still-image boundary must reject it.
    expect((await sharp(bytes).png().toBuffer()).length).toBeGreaterThan(0);
    await expect(sanitizeImage({ filename: 'animation.png', mime: 'image/png', bytes })).rejects.toThrow();
  });
  test('rejects animation containers, concatenated frames and MPO', async () => {
    const input = await file();
    await expect(sanitizeImage({ ...input, bytes: animationControl(input.bytes) })).rejects.toThrow();
    await expect(sanitizeImage({ ...input, bytes: Buffer.concat([input.bytes, input.bytes]) })).rejects.toThrow();
    const jpeg = await file('jpeg');
    await expect(sanitizeImage({ ...jpeg, bytes: Buffer.concat([jpeg.bytes, jpeg.bytes]) })).rejects.toThrow();
    const mpf = Buffer.from([0xff, 0xe2, 0, 6, 0x4d, 0x50, 0x46, 0]);
    await expect(sanitizeImage({ ...jpeg, bytes: Buffer.concat([jpeg.bytes.subarray(0, 2), mpf, jpeg.bytes.subarray(2)]) })).rejects.toThrow();
  });
  test.each(['zTXt', 'iTXt'])('accepts and strips bounded compressed PNG %s metadata', async type => {
    const input = await file();
    const prefix = type === 'zTXt' ? Buffer.from('Comment\0\0') : Buffer.concat([Buffer.from('Comment\0'), Buffer.from([1, 0, 0, 0])]);
    const data = Buffer.concat([prefix, deflateSync(Buffer.from('Synthetic note'))]);
    const chunk = Buffer.alloc(data.length + 12);
    chunk.writeUInt32BE(data.length); chunk.write(type, 4); data.copy(chunk, 8);
    chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
    const bytes = Buffer.concat([input.bytes.subarray(0, 33), chunk, input.bytes.subarray(33)]);
    const result = await sanitizeImage({ ...input, bytes });
    expect(result.bytes.includes(Buffer.from(type))).toBe(false);
    expect(result.sourceSha256).toBe(sha(bytes));
  });
  test('bounds compressed PNG metadata independently of pixel dimensions', async () => {
    const input = await file();
    const data = Buffer.concat([Buffer.from('Comment\0\0'), deflateSync(Buffer.alloc(1_048_577, 65))]);
    const chunk = Buffer.alloc(data.length + 12);
    chunk.writeUInt32BE(data.length); chunk.write('zTXt', 4); data.copy(chunk, 8);
    chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
    const bytes = Buffer.concat([input.bytes.subarray(0, 33), chunk, input.bytes.subarray(33)]);
    await expect(sanitizeImage({ ...input, bytes })).rejects.toThrow();
  });
  test('rejects a PNG with a damaged IDAT checksum even when its pixels decode', async () => {
    const input = await file();
    const bytes = Buffer.from(input.bytes);
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      if (bytes.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
        bytes[offset + 8 + length] ^= 1;
        break;
      }
      offset += 12 + length;
    }
    await expect(sanitizeImage({ ...input, bytes })).rejects.toThrow();
  });
  test('snapshots source bytes before asynchronous decoding', async () => {
    const input = await file();
    const expected = sha(input.bytes);
    const pending = sanitizeImage(input);
    input.bytes.fill(0);
    expect((await pending).sourceSha256).toBe(expected);
  });
  test('rejects path/string byte sources rather than opening or fetching them', async () => {
    const a = await file();
    await expect(sanitizeImage({ ...a, bytes: '/tmp/secret.jpg' })).rejects.toThrow();
    await expect(sanitizeImage({ ...a, bytes: 'https://example.com/image.jpg' })).rejects.toThrow();
  });
  test('single pair composes binding/sanitation with zero fetch calls and no original buffer returned', async () => {
    const fetch = vi.fn(() => { throw new Error('Network prohibited'); }); vi.stubGlobal('fetch', fetch);
    const a = await file();
    const result = await preparePair(a, manifest()[0]);
    expect(result.application.applicationId).toBe(application.applicationId);
    expect(result.image.sourceSha256).toBe(sha(a.bytes));
    expect(result.image.bytes).not.toBe(a.bytes);
    await expect(preparePair(a, manifest('wrong.png')[0])).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
