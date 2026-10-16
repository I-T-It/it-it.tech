import '../../app.css';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { faGithub, faXTwitter } from '@fortawesome/free-brands-svg-icons';
import Icon from './Icon.svelte';

const svg = () => document.querySelector<SVGSVGElement>('svg.icon')!;

describe('Icon', () => {
	it('draws the icon as an inline SVG path, sized to its own box', async () => {
		await render(Icon, { icon: faGithub });
		const [width, height, , , path] = faGithub.icon;
		expect(svg().getAttribute('viewBox')).toBe(`0 0 ${width} ${height}`);
		expect(svg().querySelectorAll('path')).toHaveLength(1);
		expect(svg().querySelector('path')!.getAttribute('d')).toBe(path);
	});

	it('is decoration: hidden from screen readers, not focusable, no text', async () => {
		await render(Icon, { icon: faXTwitter });
		expect(svg().getAttribute('aria-hidden')).toBe('true');
		expect(svg().getAttribute('focusable')).toBe('false');
		expect(svg().hasAttribute('tabindex')).toBe(false);
		expect(svg().textContent?.trim()).toBe('');
		expect(svg().hasAttribute('role')).toBe(false);
	});

	it('follows the font size and the text colour of its parent', async () => {
		await render(Icon, { icon: faGithub });
		const box = svg().getBoundingClientRect();
		const em = parseFloat(getComputedStyle(svg()).fontSize);
		expect(box.height).toBeCloseTo(em, 0);
		expect(getComputedStyle(svg().querySelector('path')!).fill).toBe(getComputedStyle(svg()).color);
	});

	it('keeps the proportions of an icon that is wider than it is high', async () => {
		await render(Icon, { icon: faXTwitter });
		const [width, height] = faXTwitter.icon;
		const box = svg().getBoundingClientRect();
		expect(box.width / box.height).toBeCloseTo(width / height, 1);
	});

	it('takes extra classes', async () => {
		await render(Icon, { icon: faGithub, class: 'big' });
		expect(svg().classList.contains('big')).toBe(true);
		expect(svg().classList.contains('icon')).toBe(true);
	});
});
