import '../../app.css';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { TINTS, TINT_RGB, type Block, type Slice } from '#lib/glitch/schedule.js';
import { clearFx, fx, glitch } from '#lib/glitch/state.svelte.js';
import GlitchFx from './GlitchFx.svelte';

const root = document.documentElement;

/** A 1 by 1 picture, so an <img> has something to show without a request. */
const PICTURE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const OTHER_PICTURE = `${PICTURE}#avatar`;

const slice = (over: Partial<Slice> = {}): Slice => ({
	top: 0.2,
	height: 0.1,
	shift: 0.3,
	source: 'photo',
	cast: false,
	split: false,
	spill: true,
	tint: 'cyan',
	...over
});

const block = (over: Partial<Block> = {}): Block => ({
	left: 0.2,
	top: 0.5,
	width: 0.3,
	height: 0.1,
	dx: 0,
	dy: 0,
	source: 'photo',
	look: 'tint',
	tint: 'magenta',
	...over
});

interface Rig {
	socket: HTMLElement;
	/** The die's box, as the hero makes it: a socket 300 px across with 1/11 and 2 px in on each side. */
	fxBox: () => DOMRect;
	el: () => HTMLElement | null;
}

const rigs: (() => void)[] = [];

function rig(): Rig {
	const socket = document.createElement('div');
	socket.className = 'socket photo-socket';
	socket.style.cssText =
		'position:relative;width:300px;height:300px;margin:100px;--die-inset:calc(100% / 11 + 2px)';
	document.body.append(socket);
	const app = mount(GlitchFx, { target: socket });
	flushSync();
	rigs.push(() => {
		unmount(app);
		socket.remove();
	});
	return {
		socket,
		el: () => socket.querySelector<HTMLElement>('.fx'),
		fxBox: () => socket.querySelector<HTMLElement>('.fx')!.getBoundingClientRect()
	};
}

/** Starts a glitch with these fragments, like GlitchPhoto does. */
function show(slices: Slice[], blocks: Block[], kind: 'tear' | 'swap' = 'tear') {
	fx.kind = kind;
	fx.slices = slices;
	fx.blocks = blocks;
	fx.frame++;
	flushSync();
}

const frags = (r: Rig, part?: 'slice' | 'block') => [
	...r.socket.querySelectorAll<HTMLElement>(part ? `.frag[data-part="${part}"]` : '.frag')
];

beforeEach(() => {
	glitch.paused = false;
	glitch.armed = true;
	glitch.reduced = false;
	fx.photoSrc = PICTURE;
	fx.avatarSrc = OTHER_PICTURE;
	clearFx();
});

afterEach(() => {
	for (const stop of rigs.splice(0)) stop();
	fx.photoSrc = '';
	fx.avatarSrc = '';
	clearFx();
	glitch.armed = false;
	root.classList.remove('reduced');
});

describe('before the glitch has started', () => {
	it('draws nothing at all', () => {
		glitch.armed = false;
		const r = rig();
		expect(r.el()).toBeNull();
		expect(r.socket.innerHTML).not.toContain('svg');
	});

	it('draws nothing when the visitor wants less motion, whatever is asked of it', () => {
		glitch.reduced = true;
		const r = rig();
		expect(r.el()).toBeNull();
	});
});

describe('at rest', () => {
	it('has its layer but shows nothing, and holds no fragments', () => {
		const r = rig();
		expect(r.el()).not.toBeNull();
		expect(getComputedStyle(r.el()!).display).toBe('none');
		expect(frags(r)).toHaveLength(0);
	});

	it('is decoration: hidden from assistive technology, with nothing to focus or click', () => {
		const r = rig();
		show([slice()], [block()]);
		expect(r.el()!.getAttribute('aria-hidden')).toBe('true');
		expect(r.el()!.querySelector('a, button, input, [tabindex], [role]:not(svg)')).toBeNull();
		for (const img of r.el()!.querySelectorAll('img')) {
			expect(img.getAttribute('alt')).toBe('');
		}
		expect(getComputedStyle(r.el()!).pointerEvents).toBe('none');
		expect(r.el()!.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
	});

	it('carries the two filters the fragments use', () => {
		const r = rig();
		expect(r.el()!.querySelector('filter#glitch-split')).not.toBeNull();
		expect(r.el()!.querySelector('filter#glitch-posterise')).not.toBeNull();
	});
});

describe('a glitch', () => {
	it('draws a window for every slice and block, over the same box as the picture in the die', () => {
		const r = rig();
		show([slice(), slice({ top: 0.6 })], [block(), block({ look: 'smear', left: 0.5 })]);
		expect(getComputedStyle(r.el()!).display).toBe('block');
		expect(r.el()!.dataset.fx).toBe('tear');
		expect(frags(r, 'slice')).toHaveLength(2);
		expect(frags(r, 'block')).toHaveLength(2);
		// 300 px, a 11th and 2 px in on each side, and a pixel more for the picture's own margin.
		const inset = 300 / 11 + 2 + 1;
		const box = r.fxBox();
		const socket = r.socket.getBoundingClientRect();
		expect(box.left - socket.left).toBeCloseTo(inset, 1);
		expect(box.top - socket.top).toBeCloseTo(inset, 1);
		expect(box.width).toBeCloseTo(300 - 2 * inset, 1);
		expect(box.height).toBeCloseTo(300 - 2 * inset, 1);
	});

	it('puts every window where its slice or block says, in die units', () => {
		const r = rig();
		show(
			[slice({ top: 0.2, height: 0.1, shift: 0.3, spill: true })],
			[block({ left: 0.25, top: 0.5, width: 0.5, height: 0.25 })]
		);
		const box = r.fxBox();
		const [sliceEl] = frags(r, 'slice');
		const [blockEl] = frags(r, 'block');
		const s = sliceEl.getBoundingClientRect();
		expect(s.left - box.left).toBeCloseTo(0.3 * box.width, 1);
		expect(s.width).toBeCloseTo(box.width, 1);
		expect(s.top - box.top).toBeCloseTo(0.2 * box.height, 1);
		expect(s.height).toBeCloseTo(0.1 * box.height, 1);
		const b = blockEl.getBoundingClientRect();
		expect(b.left - box.left).toBeCloseTo(0.25 * box.width, 1);
		expect(b.width).toBeCloseTo(0.5 * box.width, 1);
		expect(b.top - box.top).toBeCloseTo(0.5 * box.height, 1);
		expect(b.height).toBeCloseTo(0.25 * box.height, 1);
	});

	it('lets a slice spill out of the die, and cuts one that must not at the die edge', () => {
		const r = rig();
		show(
			[
				slice({ shift: 0.5, spill: true }),
				slice({ top: 0.5, shift: 0.5, spill: false }),
				slice({ top: 0.7, shift: -0.4, spill: false })
			],
			[]
		);
		const box = r.fxBox();
		const [spilling, cut, cutLeft] = frags(r, 'slice').map((el) => el.getBoundingClientRect());
		expect(spilling.right).toBeCloseTo(box.right + 0.5 * box.width, 1);
		expect(cut.left).toBeCloseTo(box.left + 0.5 * box.width, 1);
		expect(cut.right).toBeCloseTo(box.right, 1);
		expect(cutLeft.left).toBeCloseTo(box.left, 1);
		expect(cutLeft.right).toBeCloseTo(box.left + 0.6 * box.width, 1);
	});

	it('lets a block hang off the die, left or right', () => {
		const r = rig();
		show([], [block({ left: -0.25, width: 0.5 }), block({ top: 0.7, left: 0.9, width: 0.3 })]);
		const box = r.fxBox();
		const [left, right] = frags(r, 'block').map((el) => el.getBoundingClientRect());
		expect(left.left).toBeCloseTo(box.left - 0.25 * box.width, 1);
		expect(right.right).toBeCloseTo(box.right + 0.2 * box.width, 1);
	});

	it('does not catch the pointer: whatever is under a fragment still gets the click', () => {
		const r = rig();
		show([slice({ top: 0.4, height: 0.2, shift: 0, spill: true })], []);
		const rect = frags(r, 'slice')[0].getBoundingClientRect();
		const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
		expect(hit).not.toBeNull();
		expect(r.el()!.contains(hit)).toBe(false);
	});

	it('goes away again when the glitch ends', () => {
		const r = rig();
		show([slice()], [block()]);
		clearFx();
		flushSync();
		expect(frags(r)).toHaveLength(0);
		expect(r.el()!.hasAttribute('data-fx')).toBe(false);
		expect(getComputedStyle(r.el()!).display).toBe('none');
	});

	it('counts every change in data-frame, the end of the glitch too', () => {
		const r = rig();
		const frames = [r.el()!.dataset.frame];
		show([slice()], [block()]);
		frames.push(r.el()!.dataset.frame);
		show([slice({ top: 0.3 })], [block()]);
		frames.push(r.el()!.dataset.frame);
		clearFx();
		flushSync();
		frames.push(r.el()!.dataset.frame);
		expect(new Set(frames).size).toBe(4);
		// Nothing to end: no change.
		clearFx();
		flushSync();
		expect(r.el()!.dataset.frame).toBe(frames[3]);
	});

	it('is gone for a visitor who asked for less motion, and in print', () => {
		const r = rig();
		show([slice()], [block()]);
		root.classList.add('reduced');
		expect(getComputedStyle(r.el()!).display).toBe('none');
	});
});

describe('what the fragments are cut from', () => {
	it('draws the avatar fragments from the avatar once it has decoded', () => {
		const r = rig();
		show([slice({ source: 'avatar' })], [block({ source: 'avatar' }), block({ source: 'photo' })]);
		expect(frags(r).map((el) => el.dataset.source)).toEqual(['avatar', 'avatar', 'photo']);
		for (const el of frags(r)) {
			const shown = [...el.querySelectorAll<HTMLElement>('img')].filter(
				(img) => getComputedStyle(img).display !== 'none'
			);
			expect(shown).toHaveLength(1);
			expect(shown[0].classList.contains(`of-${el.dataset.source}`)).toBe(true);
		}
	});

	it('cuts them from the photo until then: nothing is half an image', () => {
		fx.avatarSrc = '';
		const r = rig();
		show([slice({ source: 'avatar' })], [block({ source: 'avatar' })]);
		expect(frags(r).map((el) => el.dataset.source)).toEqual(['photo', 'photo']);
		expect(r.el()!.querySelector('img.of-avatar')).toBeNull();
		fx.avatarSrc = OTHER_PICTURE;
		flushSync();
		expect(frags(r).map((el) => el.dataset.source)).toEqual(['avatar', 'avatar']);
	});

	it('draws nothing from a picture it does not know yet', () => {
		fx.photoSrc = '';
		fx.avatarSrc = '';
		const r = rig();
		show([slice()], [block()]);
		expect(r.el()!.querySelector('img')).toBeNull();
	});
});

describe('the looks of a block', () => {
	it('flips the lightness of a negative and crushes a posterised one, in filters that do not make red', () => {
		const r = rig();
		show([], [block({ look: 'negative' }), block({ look: 'posterise', top: 0.7 })]);
		const [negative, posterise] = frags(r, 'block');
		expect(negative.style.filter).toContain('invert(1)');
		// The hue turns back by half a circle after the invert, so a colour is not turned to its opposite.
		expect(negative.style.filter).toContain('hue-rotate(180deg)');
		expect(posterise.style.filter).toMatch(/url\("?#glitch-posterise"?\)/);
	});

	it('splits a slice in two ghosts through the filter in the document', () => {
		const r = rig();
		show([slice({ split: true }), slice({ split: false, top: 0.6 })], []);
		const [split, plain] = frags(r, 'slice');
		expect(split.style.filter).toMatch(/url\("?#glitch-split"?\)/);
		expect(plain.style.filter).toBe('');
	});

	it('smears a column of the picture along the row', () => {
		const r = rig();
		show([], [block({ look: 'smear', left: 0.4, width: 0.4, dx: 0.1 })]);
		const [smear] = frags(r, 'block');
		const col = smear.querySelector<HTMLElement>('.col')!;
		const window = smear.getBoundingClientRect();
		// The column is a 120th of the window, scaled up 120 times to cover it.
		expect(col.getBoundingClientRect().width).toBeCloseTo(window.width, 0);
		expect(getComputedStyle(col).transform).toContain('120');
	});

	it('uses the colours of the schedule, none of them red', () => {
		const r = rig();
		show(
			TINTS.map((tint, i) => slice({ top: i * 0.1, tint })),
			[]
		);
		const colors = frags(r, 'slice').map((el) => el.style.getPropertyValue('--tint'));
		expect(colors).toEqual(TINTS.map((tint) => `rgb(${TINT_RGB[tint].join(' ')})`));
	});
});
