import sharp from 'sharp';
import { MAX_GROUP_REQUEST_BYTES } from '../photo-contracts';
import type { snapshotGroupRequest } from './group-provider';

type Photo = ReturnType<typeof snapshotGroupRequest>['photos'][number];
type Content = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
const tag = (value: unknown): Content => ({ type: 'text', text: JSON.stringify(value) });
const image = (mime: string, bytes: Buffer): Content => ({ type: 'image_url', image_url: { url: `data:${mime};base64,${bytes.toString('base64')}` } });

/** General geometric attention aid, not OCR/label detection or bottle-specific ROI.
 * The central 3:2 view of a tall/wide photo reduces irrelevant peripheral context.
 * Full normalized bytes ALWAYS remain present; neck/edge evidence is never cut out.
 * No resize, sharpen, color manipulation or lossy re-encoding. Derived views never
 * acquire a new photo identity or replace the original descriptor/hash in records.
 */
async function detail(photo: Photo): Promise<Content[]> {
  const { width, height } = photo.descriptor.normalized;
  const short = Math.min(width, height), long = Math.max(width, height);
  if (short < 256 || long < 1024 || long < short * 2) return [];
  const span = Math.floor(short * 1.5);
  if (short * span > 1_500_000) return []; // Bounded decoding/output work, never downsample small text.
  const crop = width < height
    ? { left: 0, top: Math.floor((height - span) / 2), width, height: span }
    : { left: Math.floor((width - span) / 2), top: 0, width: span, height };
  const source = sharp(photo.image, { limitInputPixels: 20_000_000 });
  const metadata = await source.metadata();
  if (metadata.width !== width || metadata.height !== height || (metadata.pages ?? 1) !== 1) throw Error('Invalid normalized dimensions');
  // Adaptive PNG filtering reduces photographic payload bytes without changing
  // pixels (unlike palette quantization/JPEG); keep the CPU budget bounded.
  const bytes = await source.extract(crop).png({ adaptiveFiltering: true, compressionLevel: 6 }).toBuffer();
  if (bytes.length > 2 * 1024 * 1024) return [];
  return [tag({ photoId: photo.descriptor.photoId, view: 'detail', sourceImageSha256: photo.descriptor.normalized.sha256, crop }), image('image/png', bytes)];
}

export async function groupPhotoContent(photos: Photo[], signal?: AbortSignal): Promise<Content[]> {
  const full = photos.map(p => [tag({ photoId: p.descriptor.photoId, role: p.descriptor.role }), image(p.descriptor.normalized.mime, p.image)]);
  // Reserve ample JSON/prompt overhead. Optional views never cause an otherwise
  // valid near-limit full-photo request to exceed the existing transport ceiling.
  let remaining = MAX_GROUP_REQUEST_BYTES - Buffer.byteLength(JSON.stringify(full.flat())) - 64 * 1024;
  const result: Content[] = [];
  // At most two decodes at once; maintain request order regardless of completion.
  for (let i = 0; i < photos.length; i += 2) {
    signal?.throwIfAborted();
    const details = remaining > 0 ? await Promise.all(photos.slice(i, i + 2).map(detail)) : [[], []];
    signal?.throwIfAborted();
    for (let j = 0; j < Math.min(2, photos.length - i); j++) {
      result.push(...full[i + j]);
      const bytes = Buffer.byteLength(JSON.stringify(details[j]));
      if (bytes <= remaining) { result.push(...details[j]); remaining -= bytes; }
    }
  }
  return result;
}
