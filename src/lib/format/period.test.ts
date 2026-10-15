import { describe, expect, it } from 'vitest';
import { formatDay, formatMonth, formatPeriod, periodParts } from './period.js';

// ICU data differs a little between runtimes, but month names do not: "mrt" and "Mar" are stable.
describe('formatMonth', () => {
	it('writes the short month and the year in Dutch', () => {
		expect(formatMonth('2023-03', 'nl')).toBe('mrt 2023');
		expect(formatMonth('2024-01', 'nl')).toBe('jan 2024');
		expect(formatMonth('2022-05', 'nl')).toBe('mei 2022');
	});

	it('writes English months in English', () => {
		expect(formatMonth('2023-03', 'en')).toBe('Mar 2023');
		expect(formatMonth('2024-01', 'en')).toBe('Jan 2024');
		expect(formatMonth('2022-10', 'en')).toBe('Oct 2022');
	});

	it('does not move a date across a month edge with the local time zone', () => {
		// January 1st at 00:00 UTC is still December in zones west of Greenwich.
		const zone = process.env.TZ;
		process.env.TZ = 'America/Los_Angeles';
		try {
			expect(formatMonth('2024-01', 'en')).toBe('Jan 2024');
			expect(formatMonth('2024-01', 'nl')).toBe('jan 2024');
			expect(formatDay('2024-01-01', 'nl')).toBe('1 jan 2024');
		} finally {
			if (zone === undefined) delete process.env.TZ;
			else process.env.TZ = zone;
		}
	});

	it('rejects a value that is not a year and a month', () => {
		expect(() => formatMonth('2023', 'nl')).toThrow();
		expect(() => formatMonth('2023-13', 'nl')).toThrow();
		expect(() => formatMonth('maart 2023', 'nl')).toThrow();
	});
});

describe('formatDay', () => {
	it('writes the day, the short month and the year', () => {
		expect(formatDay('2024-06-21', 'nl')).toBe('21 jun 2024');
		expect(formatDay('2024-06-21', 'en')).toBe('21 Jun 2024');
		expect(formatDay('2022-10-05', 'nl')).toBe('5 okt 2022');
	});

	it('falls back to the month when the date has no day', () => {
		expect(formatDay('2024-06', 'nl')).toBe('jun 2024');
	});
});

describe('formatPeriod', () => {
	it('joins start and end with an en dash', () => {
		expect(formatPeriod('2023-03', '2024-01', 'nl', 'heden')).toBe('mrt 2023 – jan 2024');
		expect(formatPeriod('2023-03', '2024-01', 'en', 'present')).toBe('Mar 2023 – Jan 2024');
	});

	it('ends an ongoing role with the label for now', () => {
		expect(formatPeriod('2026-04', null, 'nl', 'heden')).toBe('apr 2026 – heden');
		expect(formatPeriod('2026-04', null, 'en', 'present')).toBe('Apr 2026 – present');
	});
});

describe('periodParts', () => {
	it('gives each end its text and its machine-readable date', () => {
		const [start, end] = periodParts('2023-03', '2024-01', 'nl', 'heden');
		expect(start).toEqual({ text: 'mrt 2023', iso: '2023-03' });
		expect(end).toEqual({ text: 'jan 2024', iso: '2024-01' });
	});

	it('has no date on an ongoing end: it is the label, not a time', () => {
		const [, end] = periodParts('2026-04', null, 'en', 'present');
		expect(end).toEqual({ text: 'present' });
	});
});
