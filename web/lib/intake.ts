import { createHash } from 'node:crypto';
import { crc32, inflateSync } from 'node:zlib';
import sharp from 'sharp';
import { z } from 'zod';
import { filenameSchema, manifestSchema, MAX_BATCH_PAIRS, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, type Application } from './contracts';

export { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS } from './contracts';

const imageSchema = z.object({
  filename: filenameSchema,
  mime: z.enum(['image/jpeg', 'image/png']),
  bytes: z.custom<Buffer>(Buffer.isBuffer, 'Image bytes must be an in-memory Buffer'),
}).strict();
export type ImageInput = z.infer<typeof imageSchema>;
export type BoundPair = { application: Application; image: ImageInput };
export type SanitizedImage = {
  bytes: Buffer; mime: 'image/jpeg' | 'image/png'; width: number; height: number;
  sourceSha256: string; sanitizedSha256: string;
};

/** Validate the COMPLETE manifest before any image is decoded or dispatched.
 * Bindings are case-sensitive and literal. No filesystem/URL resolution.
 * This helper is not a batch queue; callers still own request aggregate limits.
 */
export function bindPairs(filesInput: unknown, manifestInput: unknown): BoundPair[] {
  const files = z.array(imageSchema).min(1).max(MAX_BATCH_PAIRS).parse(filesInput);
  const manifest = manifestSchema.parse(manifestInput);
  const byName = new Map<string, ImageInput>();
  for (const file of files) {
    if (byName.has(file.filename)) throw new Error('Duplicate image filename');
    byName.set(file.filename, file);
  }
  const names = new Set<string>();
  const identities = new Set<string>();
  const pairs = manifest.map(entry => {
    const identity = JSON.stringify([entry.application.applicationId, entry.application.applicationVersion]);
    if (names.has(entry.filename) || identities.has(identity)) throw new Error('Duplicate binding');
    const image = byName.get(entry.filename);
    if (!image) throw new Error('Missing image for application binding');
    names.add(entry.filename); identities.add(identity);
    return { application: entry.application, image };
  });
  if (names.size !== files.length) throw new Error('Image without an application binding');
  return pairs;
}

function reject(): never { throw new Error('Unsupported, corrupt, multi-frame or oversized image'); }

// PNG can hide inflated profiles/text behind tiny pixel dimensions. Bound all
// ancillary metadata to 1 MiB (expanded), before handing compressed chunks to libvips.
const MAX_PNG_METADATA_BYTES = 1024 * 1024;
function metadataSize(type: string, data: Buffer, remaining: number): number {
  if (!['zTXt', 'iCCP', 'iTXt'].includes(type)) return data.length;
  const keywordEnd = data.indexOf(0);
  if (keywordEnd < 1 || keywordEnd > 79 || keywordEnd + 2 >= data.length) reject();
  let start = keywordEnd + 2;
  let compressed = true;
  if (type === 'iTXt') {
    const flag = data[keywordEnd + 1];
    if (flag !== 0 && flag !== 1 || data[keywordEnd + 2] !== 0) reject();
    compressed = flag === 1;
    const languageEnd = data.indexOf(0, keywordEnd + 3);
    const translatedEnd = languageEnd < 0 ? -1 : data.indexOf(0, languageEnd + 1);
    if (translatedEnd < 0) reject();
    start = translatedEnd + 1;
  } else if (data[keywordEnd + 1] !== 0) reject();
  if (!compressed) return data.length;
  if (remaining <= start) reject();
  return start + inflateSync(data.subarray(start), { maxOutputLength: remaining - start }).length;
}

// Require a complete single PNG container, not APNG or concatenated evidence.
function validatePng(bytes: Buffer) {
  let offset = 8;
  let metadataBytes = 0;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > bytes.length || type === 'acTL' || type === 'fcTL' || type === 'fdAT') reject();
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) reject();
    if (bytes[offset + 4] & 0x20) {
      metadataBytes += metadataSize(type, bytes.subarray(offset + 8, end - 4), MAX_PNG_METADATA_BYTES - metadataBytes);
      if (metadataBytes > MAX_PNG_METADATA_BYTES) reject();
    }
    if (type === 'IEND') { if (length !== 0 || end !== bytes.length) reject(); return; }
    offset = end;
  }
  reject();
}

// Walk marker lengths and entropy byte stuffing; reject MPO/concatenated JPEGs.
function validateJpeg(bytes: Buffer) {
  let offset = 2;
  let inScan = false;
  while (offset < bytes.length) {
    if (inScan && bytes[offset] !== 0xff) { offset++; continue; }
    if (bytes[offset++] !== 0xff) reject();
    while (bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) reject();
    const marker = bytes[offset++];
    if (inScan && (marker === 0 || (marker >= 0xd0 && marker <= 0xd7))) continue;
    if (marker === 0xd9) { if (offset !== bytes.length) reject(); return; }
    if (marker === 0xd8 || marker === 0 || marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) reject();
    if (offset + 2 > bytes.length) reject();
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) reject();
    if (marker === 0xe2 && bytes.toString('ascii', offset + 2, offset + 6) === 'MPF\0') reject();
    offset += length;
    inScan = marker === 0xda;
  }
  reject();
}

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** Node-only, memory-only boundary. No URLs, paths, temp files, logs or provider.
 * Returns only re-encoded bytes; originals stay with the caller and are not retained.
 * Limits bound each decode, not concurrent callers or a future HTTP request envelope.
 */
export async function sanitizeImage(input: unknown): Promise<SanitizedImage> {
  try {
    const image = imageSchema.parse(input);
    if (image.bytes.length === 0 || image.bytes.length > MAX_IMAGE_BYTES) reject();
    // Snapshot before the first await: caller mutation cannot change validated bytes.
    const bytes = Buffer.from(image.bytes);
    const format = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'png'
      : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? 'jpeg' : null;
    if (!format || image.mime !== `image/${format}`) reject();
    const extension = image.filename.split('.').at(-1)?.toLowerCase();
    if (format === 'png' ? extension !== 'png' : extension !== 'jpg' && extension !== 'jpeg') reject();
    if (format === 'png') validatePng(bytes); else validateJpeg(bytes);
    const decoder = sharp(bytes, { failOn: 'warning', limitInputPixels: MAX_IMAGE_PIXELS, sequentialRead: true });
    const metadata = await decoder.metadata();
    if (metadata.format !== format || (metadata.pages ?? 1) !== 1 || !metadata.width || !metadata.height || metadata.width * metadata.height > MAX_IMAGE_PIXELS) reject();
    // No keepMetadata/withMetadata: Sharp discards EXIF/XMP/IPTC/ICC on output.
    const oriented = decoder.autoOrient();
    const { data, info } = await (format === 'png' ? oriented.png() : oriented.jpeg({ quality: 95 })).toBuffer({ resolveWithObject: true });
    if (!info.width || !info.height || info.width * info.height > MAX_IMAGE_PIXELS || data.length > MAX_IMAGE_BYTES) reject();
    return { bytes: data, mime: format === 'png' ? 'image/png' : 'image/jpeg', width: info.width, height: info.height, sourceSha256: sha256(bytes), sanitizedSha256: sha256(data) };
  } catch {
    // Never leak decoder payloads, filenames or applicant content to future UI/logs.
    return reject();
  }
}

export async function preparePair(file: unknown, binding: unknown) {
  const [pair] = bindPairs([file], [binding]);
  return { application: pair.application, filename: pair.image.filename, image: await sanitizeImage(pair.image) };
}
