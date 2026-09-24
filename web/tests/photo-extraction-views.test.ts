import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { expect, test } from 'vitest';
import { groupPhotoContent } from '../lib/extraction/photo-views';
import { MAX_GROUP_NORMALIZED_BYTES, MAX_GROUP_REQUEST_BYTES } from '../lib/photo-contracts';
import { groupFixture } from './fixtures/photo-groups';

async function photo(width: number, height: number) {
  const fixture = await groupFixture(1);
  const image = await sharp({ create: { width, height, channels: 3, background: '#5a17bb' } }).png().toBuffer();
  const descriptor = structuredClone(fixture.prepared.photos[0].descriptor);
  descriptor.normalized = { width, height, mime: 'image/png', bytes: image.length, sha256: createHash('sha256').update(image).digest('hex') };
  return { descriptor, image };
}

test.each([[1600, 686, { left: 285, top: 0, width: 1029, height: 686 }], [686, 1600, { left: 0, top: 285, width: 686, height: 1029 }]] as const)('detail geometry works for %sx%s without depending on role or bottle text', async (width, height, crop) => {
  const p = await photo(width, height);
  p.descriptor.role = 'other';
  const content = await groupPhotoContent([p]); expect(content).toHaveLength(4);
  const tag = content[2]; if (tag.type !== 'text') throw Error('Expected tag');
  expect(JSON.parse(tag.text).crop).toEqual(crop);
  const full = content[1], detail = content[3];
  if (full.type !== 'image_url' || detail.type !== 'image_url') throw Error('Expected image');
  expect(full.image_url.url).toBe(`data:image/png;base64,${p.image.toString('base64')}`);
  expect((await sharp(Buffer.from(detail.image_url.url.split(',')[1], 'base64')).raw().toBuffer()).equals(await sharp(p.image).extract(crop).raw().toBuffer())).toBe(true);
});

test.each([[255, 1600], [600, 900], [1000, 1000], [1100, 2400]])('skip unnecessary or over-budget %sx%s detail work, retain full image', async (width, height) => {
  const p = await photo(width, height);
  const content = await groupPhotoContent([p]); expect(content).toHaveLength(2);
  const full = content[1]; if (full.type !== 'image_url') throw Error('Expected image');
  expect(full.image_url.url).toBe(`data:image/png;base64,${p.image.toString('base64')}`);
});

async function noisyPhoto(width: number, height: number) {
  const p = await photo(width, height);
  const pixels = Buffer.alloc(width * height * 3);
  let seed = 0x12345678;
  for (let i = 0; i < pixels.length; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    pixels[i] = seed & 255;
  }
  p.image = await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
  p.descriptor.normalized.bytes = p.image.length;
  p.descriptor.normalized.sha256 = createHash('sha256').update(p.image).digest('hex');
  return p;
}

test('encoded detail above two MiB is optional, never replacing the full photo', async () => {
  const p = await noisyPhoto(1000, 2200);
  const content = await groupPhotoContent([p]);
  expect(content).toHaveLength(2);
  const full = content[1]; if (full.type !== 'image_url') throw Error('Expected full photo');
  expect(full.image_url.url).toBe(`data:image/png;base64,${p.image.toString('base64')}`);
});

test('near-limit full photos remain within the transport budget by omitting otherwise eligible detail views', async () => {
  const photos = await Promise.all([noisyPhoto(600, 1600), noisyPhoto(600, 1600)]);
  expect(await groupPhotoContent([photos[0]])).toHaveLength(4); // Eligible alone.
  for (const p of photos) {
    // PNG permits trailing data. Padding models large normalized-byte occupancy
    // without expensive giant image fixtures; decoded dimensions remain valid.
    p.image = Buffer.concat([p.image, Buffer.alloc(MAX_GROUP_NORMALIZED_BYTES / 2 - p.image.length)]);
    p.descriptor.normalized.bytes = p.image.length;
    p.descriptor.normalized.sha256 = createHash('sha256').update(p.image).digest('hex');
  }
  const content = await groupPhotoContent(photos);
  expect(content).toHaveLength(4); // Only two full views; no optional crop fits.
  expect(Buffer.byteLength(JSON.stringify(content)) + 64 * 1024).toBeLessThan(MAX_GROUP_REQUEST_BYTES);
  for (let i = 0; i < photos.length; i++) {
    const full = content[i * 2 + 1]; if (full.type !== 'image_url') throw Error('Expected full photo');
    expect(Buffer.from(full.image_url.url.split(',')[1], 'base64').equals(photos[i].image)).toBe(true);
  }
});

test('invalid normalized dimensions fail before producing a misleading crop tag', async () => {
  const p = await photo(686, 1600); p.descriptor.normalized.height++;
  await expect(groupPhotoContent([p])).rejects.toThrow('Invalid normalized dimensions');
});

test('already cancelled request does not enter image decoding', async () => {
  const p = await photo(686, 1600); p.image = Buffer.from('invalid');
  await expect(groupPhotoContent([p], AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' });
});
