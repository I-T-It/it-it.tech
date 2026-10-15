import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Contrast tests on the design tokens in src/app.css (WCAG 2.2 AA, plan section 9).
 * The tokens are read from the stylesheet itself, so a changed value is tested, not a copy of it.
 * Backgrounds: the page gradient at both ends and in the middle, plus the worst case of a bright
 * trace or pad showing through the translucent chip and header fills.
 */

type Rgba = { r: number; g: number; b: number; a: number };

const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');

const rawTokens = new Map<string, string>();
for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
	rawTokens.set(match[1], match[2].trim());
}

function token(name: string): string {
	let value = rawTokens.get(name);
	if (value === undefined) throw new Error(`Token ${name} is not defined in src/app.css`);
	for (let depth = 0; depth < 5 && value.includes('var('); depth++) {
		value = value.replace(/var\((--[\w-]+)\)/g, (_, ref: string) => {
			const resolved = rawTokens.get(ref);
			if (resolved === undefined) throw new Error(`Token ${ref} is not defined in src/app.css`);
			return resolved;
		});
	}
	return value;
}

function parseColor(value: string): Rgba {
	const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
	if (hex) {
		const digits =
			hex[1].length === 3
				? hex[1]
						.split('')
						.map((d) => d + d)
						.join('')
				: hex[1];
		return {
			r: parseInt(digits.slice(0, 2), 16),
			g: parseInt(digits.slice(2, 4), 16),
			b: parseInt(digits.slice(4, 6), 16),
			a: 1
		};
	}
	const rgba = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
	if (rgba) {
		return { r: +rgba[1], g: +rgba[2], b: +rgba[3], a: rgba[4] === undefined ? 1 : +rgba[4] };
	}
	throw new Error(`Cannot parse the colour "${value}"`);
}

function color(name: string): Rgba {
	return parseColor(token(name));
}

/** `fg` painted over an opaque `bg`. */
function over(fg: Rgba, bg: Rgba): Rgba {
	const mix = (f: number, b: number) => Math.round(f * fg.a + b * (1 - fg.a));
	return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a: 1 };
}

function mixHalf(a: Rgba, b: Rgba): Rgba {
	return {
		r: Math.round((a.r + b.r) / 2),
		g: Math.round((a.g + b.g) / 2),
		b: Math.round((a.b + b.b) / 2),
		a: 1
	};
}

function luminance({ r, g, b }: Rgba): number {
	const channel = (value: number) => {
		const s = value / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fg: Rgba, bg: Rgba): number {
	const flat = fg.a < 1 ? over(fg, bg) : fg;
	const [light, dark] = [luminance(flat), luminance(bg)].sort((x, y) => y - x);
	return (light + 0.05) / (dark + 0.05);
}

const navy = color('--board-navy');
const moss = color('--board-moss');
const page = { navy, middle: mixHalf(navy, moss), moss };

/** Bright things the canvas can draw behind a translucent fill. */
const brightest = {
	'cyan trace': color('--trace-cyan'),
	'green trace': color('--trace-green'),
	'cyan pad': color('--pad-cyan'),
	'green pad': color('--pad-green')
};

/** Every background that text or a control can sit on. */
function backgrounds(): Record<string, Rgba> {
	const chipFill = color('--chip-fill');
	const headerFill = color('--header-fill');
	const all: Record<string, Rgba> = {};
	for (const [name, bg] of Object.entries(page)) {
		all[`page ${name}`] = bg;
		all[`chip on page ${name}`] = over(chipFill, bg);
		all[`header on page ${name}`] = over(headerFill, bg);
	}
	for (const [name, bg] of Object.entries(brightest)) {
		all[`chip over ${name}`] = over(chipFill, bg);
		all[`header over ${name}`] = over(headerFill, bg);
	}
	return all;
}

describe('tokens', () => {
	it('keeps the brand colours from the logo and the card', () => {
		expect(token('--board-navy').toLowerCase()).toBe('#001333');
		expect(token('--board-moss').toLowerCase()).toBe('#0b1f02');
		expect(token('--trace-cyan').toLowerCase()).toBe('#00e7ff');
		expect(token('--trace-green').toLowerCase()).toBe('#3fd83f');
		expect(token('--pad-cyan').toLowerCase()).toBe('#d9fbff');
		expect(token('--pad-green').toLowerCase()).toBe('#c9f4c9');
		expect(token('--ink').toLowerCase()).toBe('#ffffff');
		expect(token('--ink-muted').toLowerCase()).toBe('#a9bcc6');
	});

	it('maps the paths to the trace colours', () => {
		expect(token('--path-job')).toBe(token('--trace-cyan'));
		expect(token('--path-freelance')).toBe(token('--trace-green'));
	});

	it('paints the focus ring in cyan', () => {
		expect(token('--focus')).toBe(token('--trace-cyan'));
	});
});

describe('text contrast (4.5:1)', () => {
	for (const [name, bg] of Object.entries(backgrounds())) {
		it(`ink and muted ink on ${name}`, () => {
			expect(contrast(color('--ink'), bg)).toBeGreaterThanOrEqual(4.5);
			expect(contrast(color('--ink-muted'), bg)).toBeGreaterThanOrEqual(4.5);
		});

		it(`silkscreen text on ${name}`, () => {
			expect(contrast(color('--silk'), bg)).toBeGreaterThanOrEqual(4.5);
		});
	}

	it('keeps muted ink at 7:1 on the navy end, as the plan says', () => {
		expect(contrast(color('--ink-muted'), navy)).toBeGreaterThanOrEqual(7);
	});

	it('reads the dark label on both filled button colours', () => {
		for (const fill of ['--trace-cyan', '--trace-green']) {
			expect(contrast(color('--on-accent'), color(fill))).toBeGreaterThanOrEqual(4.5);
		}
	});
});

describe('component contrast (3:1)', () => {
	const components = [
		'--trace-cyan',
		'--trace-green',
		'--pad-cyan',
		'--pad-green',
		'--silk',
		'--focus'
	];

	for (const [name, bg] of Object.entries(page)) {
		it(`traces, pads, outlines and the focus ring on page ${name}`, () => {
			for (const component of components) {
				expect(contrast(color(component), bg), component).toBeGreaterThanOrEqual(3);
			}
		});

		it(`the same on the chip fill over page ${name}`, () => {
			const bgChip = over(color('--chip-fill'), bg);
			for (const component of components) {
				expect(contrast(color(component), bgChip), component).toBeGreaterThanOrEqual(3);
			}
		});

		it(`the same on the header fill over page ${name}`, () => {
			const bgHeader = over(color('--header-fill'), bg);
			for (const component of components) {
				expect(contrast(color(component), bgHeader), component).toBeGreaterThanOrEqual(3);
			}
		});
	}

	it('keeps the focus ring visible against both filled button colours', () => {
		for (const fill of ['--trace-cyan', '--trace-green']) {
			// The ring sits outside the button, but a ring beside a button must differ from it too.
			expect(contrast(color('--board-navy'), color(fill))).toBeGreaterThanOrEqual(3);
		}
	});
});
