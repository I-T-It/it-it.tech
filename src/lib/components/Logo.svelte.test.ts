import '../../app.css';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Logo from './Logo.svelte';

const root = document.documentElement;
afterEach(() => root.classList.remove('reduced'));

const svg = () => document.querySelector<SVGSVGElement>('svg.logo')!;
const animationName = (selector: string) =>
	getComputedStyle(document.querySelector(selector)!).animationName;

describe('structure', () => {
	it('draws the two traces, the two pads and the letters', async () => {
		await render(Logo, {});
		expect(svg().querySelectorAll('polyline.trace')).toHaveLength(2);
		expect(svg().querySelectorAll('.pad')).toHaveLength(2);
		expect(svg().querySelectorAll('.letters path')).toHaveLength(2);
	});

	it('is an image with a name when it gets a title', async () => {
		const screen = await render(Logo, { title: 'I.T. It' });
		await expect.element(screen.getByRole('img', { name: 'I.T. It' })).toBeInTheDocument();
		expect(svg().hasAttribute('aria-hidden')).toBe(false);
	});

	it('is decoration, hidden from screen readers, without a title', async () => {
		await render(Logo, {});
		expect(svg().getAttribute('aria-hidden')).toBe('true');
		expect(svg().hasAttribute('role')).toBe(false);
	});

	it('is not focusable', async () => {
		await render(Logo, { title: 'I.T. It' });
		expect(svg().getAttribute('focusable')).toBe('false');
		expect(svg().hasAttribute('tabindex')).toBe(false);
	});

	it('gives every instance its own gradient ids', async () => {
		await render(Logo, {});
		await render(Logo, {});
		const ids = Array.from(document.querySelectorAll('[id]')).map((el) => el.id);
		expect(ids.length).toBeGreaterThanOrEqual(4);
		expect(new Set(ids).size).toBe(ids.length);
		// Every stroke points at a gradient that exists.
		for (const trace of document.querySelectorAll('polyline.trace')) {
			const ref = trace.getAttribute('stroke')!.match(/url\(#([^)]+)\)/)![1];
			expect(document.getElementById(ref)).not.toBeNull();
		}
	});
});

describe('ports', () => {
	/** Where the last point of a trace lands on the screen. */
	function endOf(trace: SVGPolylineElement): { x: number; y: number } {
		const points = trace.points;
		const last = points.getItem(points.numberOfItems - 1);
		const m = trace.getScreenCTM()!;
		return { x: m.a * last.x + m.c * last.y + m.e, y: m.b * last.x + m.d * last.y + m.f };
	}

	const centre = (el: Element) => {
		const box = el.getBoundingClientRect();
		return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
	};

	it('marks the two open trace ends with data-port, one per colour', async () => {
		await render(Logo, {});
		const ports = Array.from(svg().querySelectorAll('[data-port]'));
		expect(ports.map((port) => port.getAttribute('data-port')).sort()).toEqual(['cyan', 'green']);
	});

	for (const size of [72, 300, 640]) {
		it(`puts each port on the end of its trace in rendered coordinates, at ${size}px`, async () => {
			await render(Logo, { size });
			for (const colour of ['cyan', 'green']) {
				const port = centre(svg().querySelector(`[data-port="${colour}"]`)!);
				const end = endOf(svg().querySelector(`polyline.trace-${colour}`)!);
				expect(port.x).toBeCloseTo(end.x, 0);
				expect(port.y).toBeCloseTo(end.y, 0);
			}
		});
	}

	it('keeps them on the open ends, not on the pads at the other end of the traces', async () => {
		await render(Logo, { size: 640 });
		for (const colour of ['cyan', 'green']) {
			const port = centre(svg().querySelector(`[data-port="${colour}"]`)!);
			const pad = centre(svg().querySelector(`.pad-${colour}`)!);
			expect(Math.hypot(port.x - pad.x, port.y - pad.y)).toBeGreaterThan(100);
		}
	});

	it('follows the logo when it moves: the port stays at the same fraction of the logo', async () => {
		await render(Logo, { size: 400 });
		const box = svg().getBoundingClientRect();
		const port = centre(svg().querySelector('[data-port="cyan"]')!);
		// The cyan trace ends low and left of centre, the green one high and right of it.
		expect((port.x - box.left) / box.width).toBeLessThan(0.3);
		expect((port.y - box.top) / box.height).toBeGreaterThan(0.9);
		const green = centre(svg().querySelector('[data-port="green"]')!);
		expect((green.x - box.left) / box.width).toBeGreaterThan(0.5);
		expect((green.y - box.top) / box.height).toBeLessThan(0.1);
	});

	it('does not draw, take the pointer or change the accessible name', async () => {
		await render(Logo, { title: 'I.T. It' });
		for (const port of svg().querySelectorAll<SVGElement>('[data-port]')) {
			const style = getComputedStyle(port);
			expect(style.pointerEvents).toBe('none');
			expect(style.fill).toBe('none');
			expect(style.stroke).toBe('none');
		}
		expect(svg().getAttribute('aria-label')).toBe('I.T. It');
	});

	it('are there whether the logo animates or not', async () => {
		await render(Logo, { animate: true });
		expect(svg().querySelectorAll('[data-port]')).toHaveLength(2);
	});
});

describe('size', () => {
	it('takes a number as pixels of width and keeps the aspect ratio', async () => {
		await render(Logo, { size: 200 });
		const box = svg().getBoundingClientRect();
		expect(box.width).toBe(200);
		expect(box.height).toBeCloseTo(200 / (860 / 297), 0);
	});

	it('takes any CSS length', async () => {
		await render(Logo, { size: '10rem' });
		expect(svg().getBoundingClientRect().width).toBe(160);
	});
});

describe('motion', () => {
	it('is static by default', async () => {
		await render(Logo, {});
		expect(animationName('.trace')).toBe('none');
		expect(animationName('.letters')).toBe('none');
		expect(svg().getAnimations({ subtree: true })).toHaveLength(0);
	});

	it('draws itself when animate is set: traces, then pads, then letters', async () => {
		await render(Logo, { animate: true });
		expect(animationName('.trace')).not.toBe('none');
		expect(animationName('.pad')).not.toBe('none');
		expect(animationName('.letters')).not.toBe('none');
		expect(svg().getAnimations({ subtree: true }).length).toBeGreaterThanOrEqual(5);
	});

	it('ends on the fully drawn logo', async () => {
		await render(Logo, { animate: true });
		for (const animation of svg().getAnimations({ subtree: true })) animation.finish();
		const trace = getComputedStyle(document.querySelector('.trace')!);
		expect(Number(trace.strokeDashoffset.replace('px', ''))).toBe(0);
		expect(getComputedStyle(document.querySelector('.letters')!).opacity).toBe('1');
	});

	it('marks both open trace ends as the ports the lead traces run into', async () => {
		await render(Logo, { animate: true });
		const leads = svg().querySelectorAll('[data-port][data-lead]');
		expect(leads).toHaveLength(2);
	});

	it('draws each trace from its open end, the port, back to its pad', async () => {
		await render(Logo, { animate: true });
		const trace = document.querySelector<SVGPolylineElement>('.trace-cyan')!;
		const [draw] = trace.getAnimations() as CSSAnimation[];
		draw.pause();
		draw.currentTime = 0.5 * 1400;
		// Part way: a negative offset puts the dash on the far end of the line, the port's end.
		const offset = Number(getComputedStyle(trace).strokeDashoffset.replace('px', ''));
		expect(offset).toBeLessThan(0);
		expect(offset).toBeGreaterThan(-1);
	});

	describe('with scripts, in the hero', () => {
		afterEach(() => root.classList.remove('js'));

		it('waits, dark, for the board to power it', async () => {
			root.classList.add('js');
			await render(Logo, { animate: true });
			const trace = getComputedStyle(document.querySelector('.trace')!);
			expect(trace.animationDelay).toBe('3s');
			expect(Number(trace.strokeDashoffset.replace('px', ''))).toBe(-1);
			expect(getComputedStyle(document.querySelector('.letters')!).opacity).toBe('0');
		});

		it('draws at once when the lead traces reach it', async () => {
			root.classList.add('js');
			await render(Logo, { animate: true });
			svg().parentElement!.setAttribute('data-power', 'on');
			const trace = getComputedStyle(document.querySelector('.trace')!);
			expect(trace.animationName).toMatch(/draw-powered/);
			expect(trace.animationDelay).toBe('0s');
			expect(getComputedStyle(document.querySelector('.letters')!).animationName).toMatch(
				/fade-powered/
			);
		});

		it('is the finished logo under reduced motion, powered or not', async () => {
			root.classList.add('js', 'reduced');
			await render(Logo, { animate: true });
			expect(svg().getAnimations({ subtree: true })).toHaveLength(0);
		});
	});

	it('does not animate under reduced motion', async () => {
		root.classList.add('reduced');
		await render(Logo, { animate: true });
		expect(animationName('.trace')).toBe('none');
		expect(animationName('.pad')).toBe('none');
		expect(animationName('.letters')).toBe('none');
		expect(svg().getAnimations({ subtree: true })).toHaveLength(0);
	});

	it('finishes the draw in about two seconds', async () => {
		await render(Logo, { animate: true });
		const end = Math.max(
			...svg()
				.getAnimations({ subtree: true })
				.map((animation) => Number(animation.effect!.getComputedTiming().endTime))
		);
		expect(end).toBeGreaterThan(1400);
		expect(end).toBeLessThanOrEqual(2600);
	});
});
