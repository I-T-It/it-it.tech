/**
 * Dates in the CV, written for a locale with Intl.DateTimeFormat. Content stores a year and a
 * month ("2023-03"), talks may carry a day ("2023-03-14"); nothing here holds copy, the word for
 * "now" comes in from the content labels.
 */
import type { Locale, YearMonth } from '../content/types.js';

/** What sits between the start and the end of a period: an en dash with a space on each side. */
export const PERIOD_SEPARATOR = ' – ';

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// English dates are British, day before month ("21 Jun 2024"): the readers are mostly European.
const TAGS: Record<Locale, string> = { nl: 'nl-NL', en: 'en-GB' };

/** The BCP 47 tag the CV formats dates and lists with for a site locale. */
export function localeTag(locale: Locale): string {
	return TAGS[locale];
}

// A formatter is slow to build and the CV formats about forty dates, so keep one per shape.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: Locale, withDay: boolean): Intl.DateTimeFormat {
	const key = `${locale}:${withDay}`;
	let format = formatters.get(key);
	if (!format) {
		// UTC on both sides: a date built at 00:00 UTC must not slip into the month before in a
		// zone west of Greenwich.
		format = new Intl.DateTimeFormat(TAGS[locale], {
			day: withDay ? 'numeric' : undefined,
			month: 'short',
			year: 'numeric',
			timeZone: 'UTC'
		});
		formatters.set(key, format);
	}
	return format;
}

/** "2023-03" as "mrt 2023" (nl) or "Mar 2023" (en). Throws on anything that is not a year-month. */
export function formatMonth(value: YearMonth, locale: Locale): string {
	const match = MONTH.exec(value);
	if (!match) throw new Error(`Not a year-month: "${value}"`);
	return formatter(locale, false).format(new Date(Date.UTC(+match[1], +match[2] - 1, 1)));
}

/** "2024-06-21" as "21 jun 2024". A value without a day gets the month format. */
export function formatDay(value: string, locale: Locale): string {
	const match = DAY.exec(value);
	if (!match) return formatMonth(value, locale);
	return formatter(locale, true).format(new Date(Date.UTC(+match[1], +match[2] - 1, +match[3])));
}

export interface PeriodPart {
	text: string;
	/** For <time datetime>. An open end has none: "heden" is a label, not a point in time. */
	iso?: string;
}

/** The start and the end of a role, each with its text and, when it is a date, its ISO value. */
export function periodParts(
	start: YearMonth,
	end: YearMonth | null,
	locale: Locale,
	present: string
): [PeriodPart, PeriodPart] {
	return [
		{ text: formatMonth(start, locale), iso: start },
		end === null ? { text: present } : { text: formatMonth(end, locale), iso: end }
	];
}

/** "mrt 2023 – jan 2024", or "apr 2026 – heden" when the role is ongoing. */
export function formatPeriod(
	start: YearMonth,
	end: YearMonth | null,
	locale: Locale,
	present: string
): string {
	const [from, to] = periodParts(start, end, locale, present);
	return from.text + PERIOD_SEPARATOR + to.text;
}
