import { describe, expect, it } from 'vitest';
import type { Point } from './geometry.js';
import { makeTrace, type Trace } from './layout.js';
import { MAX_PULSES, PULSE_INTERVAL_MS, PULSE_RADIUS, PULSE_SPEED, Pulses } from './pulses.js';

const T = 5000;

/** A horizontal trace at `y` from x 0 to `length`, ending on pin 3 of chip "c" or in a via. */
function straight(id: string, y: number, length = 300, pin = true): Trace {
	return makeTrace({
		id,
		kind: pin ? 'feeder' : 'decor',
		side: 'left',
		bus: 'b',
		points: [
			{ x: 0, y },
			{ x: length, y }
		],
		end: pin ? { kind: 'pin', chipId: 'c', pin: 3 } : { kind: 'via' },
		chipId: pin ? 'c' : null,
		triggerY: y
	});
}

const at = (x: number, y: number): Point => ({ x, y });

describe('constants', () => {
	it('match the design', () => {
		expect(PULSE_RADIUS).toBe(96);
		expect(PULSE_INTERVAL_MS).toBe(500);
		expect(MAX_PULSES).toBe(16);
		expect(PULSE_SPEED).toBe(600);
	});
});

describe('Pulses.spawn', () => {
	it('spawns on the nearest point of the nearest trace', () => {
		const pulses = new Pulses([straight('far', 200), straight('near', 100)]);
		const pulse = pulses.spawn(at(150, 140), T)!;
		expect(pulse.traceId).toBe('near');
		expect(pulse.along).toBeCloseTo(150);
		expect(pulse.point).toEqual({ x: 150, y: 100 });
		expect(pulses.size).toBe(1);
	});

	it('does not spawn beyond 96 px', () => {
		const pulses = new Pulses([straight('a', 100)]);
		expect(pulses.spawn(at(150, 100 + 96.5), T)).toBeNull();
		expect(pulses.spawn(at(150, 100 + 96), T)).not.toBeNull();
	});

	it('spawns at most one pulse per trace per 500 ms', () => {
		const pulses = new Pulses([straight('a', 100)]);
		expect(pulses.spawn(at(10, 100), T)).not.toBeNull();
		expect(pulses.spawn(at(10, 100), T + PULSE_INTERVAL_MS - 1)).toBeNull();
		expect(pulses.spawn(at(10, 100), T + PULSE_INTERVAL_MS)).not.toBeNull();
	});

	it('moves on to the next nearest trace while the nearest one waits', () => {
		const pulses = new Pulses([straight('a', 100), straight('b', 124)]);
		expect(pulses.spawn(at(10, 105), T)!.traceId).toBe('a');
		expect(pulses.spawn(at(10, 105), T)!.traceId).toBe('b');
		expect(pulses.spawn(at(10, 105), T)).toBeNull();
	});

	it('keeps at most 16 pulses alive', () => {
		const traces = Array.from({ length: 20 }, (_, i) => straight(`t${i}`, 100 + i));
		const pulses = new Pulses(traces);
		const spawned = traces.map(() => pulses.spawn(at(10, 110), T));
		expect(spawned.filter(Boolean)).toHaveLength(MAX_PULSES);
		expect(pulses.size).toBe(16);
		pulses.advance(T + 5000);
		expect(pulses.size).toBe(0);
		expect(pulses.spawn(at(10, 110), T + 5000)).not.toBeNull();
	});

	it('only spawns on the drawn part of a trace', () => {
		const pulses = new Pulses([straight('a', 100)], { reach: () => 100 });
		expect(pulses.spawn(at(250, 100), T)).toBeNull();
		expect(pulses.spawn(at(90, 110), T)!.along).toBeCloseTo(90);
		const none = new Pulses([straight('a', 100)], { reach: () => 0 });
		expect(none.spawn(at(0, 100), T)).toBeNull();
	});
});

describe('Pulses.advance', () => {
	it('travels toward the chip end at 600 px/s', () => {
		const pulses = new Pulses([straight('a', 100)]);
		const pulse = pulses.spawn(at(0, 100), T)!;
		expect(pulses.advance(T + 250)).toEqual([]);
		expect(pulse.along).toBeCloseTo(150);
		expect(pulse.point.x).toBeCloseTo(150);
		expect(pulse.point.y).toBe(100);
		expect(pulses.alive).toEqual([pulse]);
	});

	it('reports the pin it hits on arrival and dies', () => {
		const pulses = new Pulses([straight('a', 100)]);
		pulses.spawn(at(240, 100), T);
		expect(pulses.advance(T + 50)).toEqual([]);
		expect(pulses.advance(T + 100)).toEqual([{ chipId: 'c', pin: 3, traceId: 'a' }]);
		expect(pulses.size).toBe(0);
	});

	it('dies silently at a via', () => {
		const pulses = new Pulses([straight('d', 100, 300, false)]);
		pulses.spawn(at(290, 100), T);
		expect(pulses.advance(T + 1000)).toEqual([]);
		expect(pulses.size).toBe(0);
	});

	it('dies without a hit at the end of a trace that is still growing', () => {
		let reach = 100;
		const pulses = new Pulses([straight('a', 100)], { reach: () => reach });
		pulses.spawn(at(90, 100), T);
		reach = 120;
		expect(pulses.advance(T + 1000)).toEqual([]);
		expect(pulses.size).toBe(0);
	});

	it('clears all pulses', () => {
		const pulses = new Pulses([straight('a', 100)]);
		pulses.spawn(at(0, 100), T);
		pulses.clear();
		expect(pulses.size).toBe(0);
		expect(pulses.advance(T + 1000)).toEqual([]);
	});

	it('drops pulses and rate limits when the traces change', () => {
		const pulses = new Pulses([straight('a', 100)]);
		pulses.spawn(at(0, 100), T);
		pulses.setTraces([straight('a', 200)]);
		expect(pulses.size).toBe(0);
		expect(pulses.spawn(at(0, 200), T + 1)).not.toBeNull();
	});
});
