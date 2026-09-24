import type { PhotoSetEvidence } from './photo-contracts';
import { textKey } from './semantic-text';
import { incompleteClassFragment, originKey } from './semantic-text-v8';
import { rumType } from './semantic-text-v9';

/** Whole product-category origin claim only. Reuse the existing country lookup,
 * but disallow another claim prefix: countryKey itself accepts some prefixes.
 * No application, brand, producer, warning, photo role or source-specific alias. */
export function explicitRumOrigin(text: string): boolean {
  const match = textKey(text).match(/^(?:rum of|ron de) (.+)$/u);
  return !!match && !/^(?:product of|made in|hecho en|rum of|ron de) /u.test(match[1]) && originKey(match[1]) !== null;
}

/** Ephemeral comparison keys ONLY, never extractor output or stored evidence.
 * Both readable source fields must belong to the same photo. Frozen v9 consumes
 * the key; callers restore real observations and cite the actual source fields. */
export function classCorroboration(input: PhotoSetEvidence) {
  const projected = structuredClone(input);
  const supports: { photoId: string; reason: string }[] = [];
  const contradictions: { photoId: string; reason: string }[] = [];
  for (const photo of projected.photos) {
    const { classType, origin } = photo.evidence;
    if (origin.status !== 'readable' || origin.text === null || !explicitRumOrigin(origin.text) || classType.status !== 'readable' || classType.text === null) continue;
    if (rumType(classType.text) !== null) continue;
    const style = incompleteClassFragment(classType.text) ? rumType(`${classType.text} rum`) : null;
    if (style !== null && style !== '') {
      supports.push({ photoId: photo.photoId, reason: `Class/type: verbatim style ${JSON.stringify(classType.text)} is corroborated by same-photo origin ${JSON.stringify(origin.text)}, explicitly establishing category Rum on photo ${photo.photoId}. Both raw observations are retained; comparison-only composition, not legal classification or country certification.` });
      photo.evidence.classType = { ...classType, text: `${style} rum` };
    } else if (!incompleteClassFragment(classType.text)) {
      contradictions.push({ photoId: photo.photoId, reason: `Class/type: observed ${JSON.stringify(classType.text)} is contradictory to or unsupported by explicit Rum category in same-photo origin ${JSON.stringify(origin.text)} on photo ${photo.photoId}; inspect the source, no category override.` });
    }
  }
  return { projected, supports, contradictions };
}
