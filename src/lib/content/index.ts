import { en } from './en.js';
import { nl } from './nl.js';
import type { Locale, SiteContent } from './types.js';

const content: Record<Locale, SiteContent> = { nl, en };

/** The page content of a locale. Dutch is the source, English is kept in parity. */
export function getContent(locale: Locale): SiteContent {
	return content[locale];
}

export type { Locale, SiteContent } from './types.js';
