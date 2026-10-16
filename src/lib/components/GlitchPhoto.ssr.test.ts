import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import GlitchPhoto from './GlitchPhoto.svelte';

const photoAlt = 'Portret van Robbin Schepers';
const avatarAlt = 'Avatar van Roboroads: een low-poly portret';

/** What the prerender writes, which is all a visitor without JavaScript ever gets. */
function prerender(): string {
	return render(GlitchPhoto, { props: { photoAlt, avatarAlt } }).body;
}

describe('GlitchPhoto prerender', () => {
	it('writes one picture with the photo and its alt text', () => {
		const html = prerender();
		expect(html.match(/<picture/g)).toHaveLength(1);
		expect(html.match(/<img/g)).toHaveLength(1);
		expect(html).toContain(`alt="${photoAlt}"`);
		// AVIF and WebP with a JPEG behind them, like the photo always was.
		expect(html).toContain('image/avif');
		expect(html).toContain('image/webp');
	});

	it('writes no avatar: no address, no alt text, and the photo is not hidden', () => {
		const html = prerender();
		expect(html).not.toContain('roboroads-avatar');
		expect(html).not.toContain(avatarAlt);
		expect(html).not.toContain('aria-hidden="true"');
	});

	it('writes no glitch state, no fragments and no switch', () => {
		const html = prerender();
		expect(html).not.toContain('data-glitch');
		expect(html).not.toContain('frag');
		expect(html).not.toContain('class="fx');
		expect(html).not.toContain('<button');
	});

	it('shows the photo from the start', () => {
		expect(prerender()).toContain('data-show="photo"');
	});
});
