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
