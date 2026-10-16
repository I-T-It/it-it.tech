/**
 * The preview card (Open Graph image) of a site: one picture per site and language, 1200 by 630,
 * made at build time. `scripts/og-images.mjs` opens the prerendered `/og/` and `/en/og/` pages in
 * Chromium and screenshots the card (`OgCard.svelte`); the pages and the screenshot step are
 * removed from the output again. The script has the size and the ready flag as plain constants of
 * its own (it is plain node), `e2e/og.spec.ts` checks the PNGs it makes.
 */

/** CSS px. The size every platform that shows a large preview card asks for. */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/**
 * The seed of the board on the card, fixed: the same card every build, so a preview that was
 * shared once does not change when the site is built again.
 */
export const OG_SEED = 0x17_17_c0_de;

/** Set on the card when the fonts are in and the board is drawn; the build script waits for it. */
export const OG_READY_ATTRIBUTE = 'data-og-ready';

/**
 * Splits a page title like "I.T. It - Voor alles met stekkers" into the name and what follows it.
 * The logo says the name on the company card, so the card sets only the rest as its line. A title
 * without a separator is all line.
 */
export function titleLine(title: string): string {
	const separator = ' - ';
	const cut = title.indexOf(separator);
	return cut === -1 ? title : title.slice(cut + separator.length);
}
