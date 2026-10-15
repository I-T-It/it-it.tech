import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	chips,
	obstacles,
	onChange,
	PIN_FLASH_MS,
	registerChip,
	registerObstacle,
	type ChipHandle
} from './registry.svelte.js';

let created: ChipHandle[] = [];

function makeChip(id: string, pins = 0): { el: HTMLElement; handle: ChipHandle } {
	const el = document.createElement('section');
	for (let i = 0; i < pins; i++) {
		const pin = document.createElement('span');
		pin.setAttribute('data-pin', String(i));
		el.append(pin);
	}
	document.body.append(el);
	const handle = registerChip(el, { id, designator: 'U3', side: 'both' });
	created.push(handle);
	return { el, handle };
}

afterEach(() => {
	for (const handle of created) handle.destroy();
	created = [];
	document.body.innerHTML = '';
	vi.useRealTimers();
});

describe('chips', () => {
	it('registers and unregisters a chip', () => {
		const { el, handle } = makeChip('about');
		expect(chips()).toEqual([handle]);
		expect(handle.el).toBe(el);
		expect(handle.designator).toBe('U3');
		expect(handle.side).toBe('both');
		handle.destroy();
		expect(chips()).toEqual([]);
	});

	it('throws on a duplicate id and keeps the first chip', () => {
		const { handle } = makeChip('about');
		expect(() => makeChip('about')).toThrow(/about/);
		expect(chips()).toEqual([handle]);
	});

	it('allows the id again after destroy', () => {
		makeChip('about').handle.destroy();
		const again = makeChip('about').handle;
		expect(chips()).toEqual([again]);
	});

	it('makes destroy idempotent', () => {
		const first = makeChip('about').handle;
		first.destroy();
		const second = makeChip('about').handle;
		first.destroy();
		expect(chips()).toEqual([second]);
		expect(first.destroyed).toBe(true);
	});

	it('starts off and keeps state reactive', () => {
		const { handle } = makeChip('about');
		expect(handle.state).toBe('off');
		const seen: string[] = [];
		const stop = $effect.root(() => {
			$effect(() => {
				seen.push(handle.state);
			});
		});
		flushSync();
		handle.state = 'booting';
		flushSync();
		handle.state = 'on';
		flushSync();
		stop();
		expect(seen).toEqual(['off', 'booting', 'on']);
	});
});

describe('pins', () => {
	it('lists the data-pin elements and flashes one for a moment', () => {
		vi.useFakeTimers();
		const { handle } = makeChip('about', 3);
		const pins = handle.pins();
		expect(pins).toHaveLength(3);
		handle.flashPin(1);
		expect(pins[1].getAttribute('data-flash')).toBe('true');
		expect(pins[0].hasAttribute('data-flash')).toBe(false);
		vi.advanceTimersByTime(PIN_FLASH_MS);
		expect(pins[1].hasAttribute('data-flash')).toBe(false);
	});

	it('ignores a pin that does not exist', () => {
		const { handle } = makeChip('about', 1);
		expect(() => handle.flashPin(5)).not.toThrow();
	});

	it('clears a running flash on destroy', () => {
		vi.useFakeTimers();
		const { handle } = makeChip('about', 1);
		const [pin] = handle.pins();
		handle.flashPin(0);
		handle.destroy();
		expect(pin.hasAttribute('data-flash')).toBe(false);
		handle.flashPin(0);
		expect(pin.hasAttribute('data-flash')).toBe(false);
	});
});

describe('obstacles', () => {
	it('registers and unregisters an obstacle', () => {
		const el = document.createElement('div');
		const unregister = registerObstacle(el);
		expect(obstacles()).toEqual([el]);
		unregister();
		expect(obstacles()).toEqual([]);
	});

	it('makes the unregister function idempotent', () => {
		const a = document.createElement('div');
		const b = document.createElement('div');
		const unregisterA = registerObstacle(a);
		const unregisterB = registerObstacle(b);
		unregisterA();
		unregisterA();
		expect(obstacles()).toEqual([b]);
		unregisterB();
	});
});

describe('onChange', () => {
	let calls = 0;
	let stop: () => void;

	beforeEach(() => {
		calls = 0;
		stop = onChange(() => {
			calls++;
		});
	});

	afterEach(() => stop());

	it('fires when chips and obstacles come and go', () => {
		const { handle } = makeChip('about');
		expect(calls).toBe(1);
		const unregister = registerObstacle(document.createElement('div'));
		expect(calls).toBe(2);
		unregister();
		expect(calls).toBe(3);
		handle.destroy();
		expect(calls).toBe(4);
	});

	it('does not fire for a repeated destroy or a state change', () => {
		const { handle } = makeChip('about');
		calls = 0;
		handle.state = 'on';
		handle.destroy();
		handle.destroy();
		expect(calls).toBe(1);
	});

	it('stops after the returned function is called', () => {
		stop();
		makeChip('about');
		expect(calls).toBe(0);
	});
});
