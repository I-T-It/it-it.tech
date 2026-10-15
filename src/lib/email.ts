import { emailEncoded } from './content/company.js';

/**
 * What the server renders, and what shows without JavaScript. It has no "@" so a scraper that
 * looks for an address finds nothing.
 */
export const EMAIL_FALLBACK_TEXT = 'info [at] it-it [dot] tech';

/**
 * Turns the encoded address back into the real one. Call it on mount in the browser, never during
 * prerender, and only on the company build: the personal build shows no email at all.
 */
export function decodeEmail(encoded: string = emailEncoded): string {
	const reversed = atob(encoded);
	return Array.from(reversed).reverse().join('');
}
