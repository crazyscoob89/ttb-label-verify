import { compatibleClass, countryKey, nameKey, textKey } from './semantic-text';
export { nameKey as brandKey } from './semantic-text';

/** Whole positive metric amount only; rational arithmetic has no rounding or
 * tolerance. Never normalize a source observation or accept multiple amounts. */
export function metricVolume(text: string): readonly [bigint, bigint] | null {
  const m = text.trim().match(/^(\d{1,32}(?:\.\d{1,32})?)\s*(ml|l|ltr|liters?|litres?)$/i);
  if (!m) return null;
  const [whole, fraction = ''] = m[1].split('.');
  const n = BigInt(whole + fraction) * (m[2].toLowerCase() === 'ml' ? 1n : 1000n);
  return n > 0n ? [n, 10n ** BigInt(fraction.length)] : null;
}
export function equalVolume(a: string, b: string): boolean | null {
  const x = metricVolume(a), y = metricVolume(b);
  return x && y ? x[0] * y[1] === y[0] * x[1] : null;
}
export function abvNotation(text: string): string {
  const m = text.trim().match(/^(\d+(?:\.\d+)?)\s*%\s*alc\.?\/vol\.?$/i);
  return m ? `${m[1]}% alc/vol` : text;
}

/** Bounded full designations, not substring detection or brand aliases. Spanish
 * carta oro is gold only when accompanied by the explicit commodity RON.
 * Unknown modifiers/age numbers are not stripped. GOLD alone is never rum. */
export function rumType(text: string): string | null {
  const value = nameKey(text);
  if (['rum', 'ron', 'ron superior'].includes(value)) return '';
  const english = value.match(/^(?:(gold|white|dark|aged|spiced) rum|rum (gold|white|dark|aged|spiced))$/);
  if (english) return english[1] ?? english[2];
  const spanish = value.match(/^ron (?:superior )?(?:carta )?(oro|blanco|oscuro|anejo)$/);
  return spanish ? ({ oro: 'gold', blanco: 'white', oscuro: 'dark', anejo: 'aged' } as Record<string,string>)[spanish[1]] : null;
}
export function compatibleClassV8(a: string, b: string): boolean {
  if (compatibleClass(a,b)) return true;
  const x = rumType(a), y = rumType(b);
  return x !== null && y !== null && (x === y || x === '' || y === '');
}

/** Territory remains a specific place, not an alias of US for equality. Only
 * whole origin slots and bounded explicit origin claims: not addresses,
 * historical establishments, recipes, imported-from, or marketing prose. */
export function originKey(text: string): string | null {
  const value = textKey(text).replace(/^(?:product of|made in|hecho en|rum of|ron de) /u, '');
  if (['puerto rico', 'pr', 'p.r.'].includes(value)) return 'puerto rico';
  if (value === 'cuba') return 'cuba';
  // Do not strip a second prefix ("Made in Product of Mexico").
  return /^(?:product of|made in|hecho en) /u.test(value) ? null : countryKey(value);
}
export const domesticOrigin = (key: string | null) => key === 'united states' || key === 'puerto rico';
