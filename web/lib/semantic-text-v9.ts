import { compatibleClass, nameKey } from './semantic-text';
import { partialClassCompatibility as partialV8 } from './semantic-text-v8';

const STYLES: ReadonlyMap<string, string> = new Map([
  ['gold','gold'], ['oro','gold'], ['white','white'], ['blanco','white'],
  ['dark','dark'], ['oscuro','dark'], ['aged','aged'], ['anejo','aged'], ['spiced','spiced'],
]);
/** Whole-token rum grammar, never a substring/brand allowlist. Every word must
 * have a known role: RUM/RON category, one consistent style (possibly repeated
 * or translated), SUPERIOR quality, CARTA style designator. CARTA requires a
 * style; neither designator supplies the category. Unknown words, punctuation,
 * negation, ages, flavors and conflicting styles make the parse unsupported.
 * This key is comparison-only: no observation or provenance is rewritten. */
export function rumType(text: string): string | null {
  const tokens = nameKey(text).split(' ');
  let category = false, carta = false, style = '';
  for (const token of tokens) {
    if (token === 'rum' || token === 'ron') { category = true; continue; }
    if (token === 'superior') continue;
    if (token === 'carta') { carta = true; continue; }
    const next = STYLES.get(token);
    if (next === undefined || (style !== '' && style !== next)) return null;
    style = next;
  }
  return category && (!carta || style !== '') ? style : null;
}
/** Keep the exact v8 fragment vocabulary and tequila policy. Only the complete
 * rum side gains the new grammar; a style fragment still cannot establish rum. */
export function partialClassCompatibility(fragment: string, complete: string): boolean | null {
  const rum = rumType(complete);
  return rum !== null ? partialV8(fragment, rum ? `${rum} rum` : 'rum') : partialV8(fragment, complete);
}
export function compatibleClassV9(a: string, b: string): boolean {
  if (partialClassCompatibility(a,b) === true || partialClassCompatibility(b,a) === true) return true;
  if (compatibleClass(a,b)) return true;
  const x = rumType(a), y = rumType(b);
  return x !== null && y !== null && (x === y || x === '' || y === '');
}
