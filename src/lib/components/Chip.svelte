<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { registerChip, type ChipHandle, type ChipSide } from '#lib/pcb/registry.svelte.js';

	/** Where the trace colours meet: cyan from the left, green from the right, `split` for both. */
	type Accent = 'cyan' | 'green' | 'split';

	interface Props {
		/** Unique on the page. It becomes the section id, so it is also the anchor. */
		id: string;
		/** "U3". Silkscreen text, never read aloud. */
		designator: string;
		/** Which sides get feeder traces from the board. */
		side?: ChipSide;
		/** Colour of the ring and the LED once the chip is on. Default: from `side`. */
		accent?: Accent;
		/** The id of the h2 inside the content. It names the section for screen readers. */
		labelledby: string;
		class?: string;
		children: Snippet;
	}

	let {
		id,
		designator,
		side = 'both',
		accent,
		labelledby,
		class: className,
		children
	}: Props = $props();

	/** One pin per this many pixels of chip height, on each side. */
	const PIN_PITCH = 48;
	const MIN_PINS = 2;

	/** The 45-degree cut at the top left, in pixels. The outline, the fill and the pins use it. */
	const CHAMFER = 18;

	// Gradient ids must be unique per chip: there are nine of them on the page.
	const uid = $props.id();

	/**
	 * The outline, drawn in this order: top (left to right), right, bottom (right to left), left
	 * (upwards), then the cut that closes it. Percentages are of the SVG, which is the chip.
	 */
	const segments = [
		{ x1: CHAMFER, y1: 0, x2: '100%', y2: 0 },
		{ x1: '100%', y1: 0, x2: '100%', y2: '100%' },
		{ x1: '100%', y1: '100%', x2: 0, y2: '100%' },
		{ x1: 0, y1: '100%', x2: 0, y2: CHAMFER },
		{ x1: 0, y1: CHAMFER, x2: CHAMFER, y2: 0 }
	];

	// The handle exists only in the browser, after mount: `{@attach}` never runs during prerender.
	// Without it the chip has no data-state and renders `on` (see the style block).
	let handle = $state.raw<ChipHandle>();
	let pinCount = $state(MIN_PINS);

	const resolvedAccent = $derived<Accent>(
		accent ?? (side === 'left' ? 'cyan' : side === 'right' ? 'green' : 'split')
	);

	const attachChip: Attachment<HTMLElement> = (el) => {
		const chip = registerChip(el, { id, designator, side });
		handle = chip;

		const measure = () => {
			pinCount = Math.max(MIN_PINS, Math.floor(el.offsetHeight / PIN_PITCH));
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(el);

		return () => {
			observer.disconnect();
			chip.destroy();
			handle = undefined;
		};
	};
</script>

<section
	{id}
	class={['chip', className]}
	aria-labelledby={labelledby}
	data-state={handle?.state}
	data-accent={resolvedAccent}
	style:--n={pinCount}
	style:--chamfer="{CHAMFER}px"
	{@attach attachChip}
>
	<!--
		All of the chrome below is decoration: hidden from screen readers, nothing focusable.
		The outline is two inline SVGs (the silkscreen line and the lit ring), each a chamfered
		rectangle made of five lines: top, right, bottom, left, then the cut. Percentages place the
		lines, so the outline fits any chip size with no JS and no measuring. The SVG sits half a
		pixel inside the chip so the 1px stroke is not clipped. pathLength="1" lets --draw (0 to 1)
		say how much of each line is drawn, whatever its length.
	-->
	<div class="chrome" aria-hidden="true">
		<span class="fill"></span>

		<svg class="outline base" focusable="false">
			{#each segments as segment, seg (seg)}
				<line class="seg" style:--seg={seg} pathLength="1" {...segment} />
			{/each}
		</svg>

		<span class="glow">
			<svg class="outline accent" focusable="false">
				<defs>
					<linearGradient
						id="{uid}-edge"
						gradientUnits="userSpaceOnUse"
						x1="0%"
						y1="0"
						x2="100%"
						y2="0"
					>
						<stop class="edge-a" offset="0" />
						<stop class="edge-b" offset="1" />
					</linearGradient>
				</defs>
				{#each segments as segment, seg (seg)}
					<line
						class="seg"
						style:--seg={seg}
						pathLength="1"
						stroke="url(#{uid}-edge)"
						{...segment}
					/>
				{/each}
			</svg>
		</span>
	</div>

	<span class="designator" aria-hidden="true">
		<span class="pin1"></span>
		<span class="ref">{designator}</span>
		<span class="led"></span>
	</span>

	<div class="pins pins-left" aria-hidden="true">
		{#each { length: pinCount }, i (i)}
			<span class="pin" data-pin={i} data-pin-side="left" style:--i={i}></span>
		{/each}
	</div>
	<div class="pins pins-right" aria-hidden="true">
		{#each { length: pinCount }, i (i)}
			<span class="pin" data-pin={pinCount + i} data-pin-side="right" style:--i={i}></span>
		{/each}
	</div>

	<div class="body">
		{@render children()}
	</div>
</section>

<style>
	/*
	 * The default look is `on`. A chip starts dark only under html.js:not(.reduced), which the
	 * inline script in app.html sets before the first paint, and only until the board lights it.
	 * No JS or reduced motion: the chip is on and nothing animates.
	 */
	.chip {
		/* --chamfer comes from the script, inline. */
		--pin-w: 14px;
		--pin-h: 6px;
		--pin-off: rgba(255, 255, 255, 0.14);
		--pin-step: min(60ms, calc(900ms / var(--n)));

		/* State: on. --draw (a registered number, see app.css) is how much of the outline is drawn. */
		--draw: 1;
		--frame-edge: color-mix(in srgb, var(--silk) 25%, transparent);
		--ring: 1;
		--led-fill: var(--led-color);
		--led-glow: color-mix(in srgb, var(--led-color) 70%, transparent);

		position: relative;
		isolation: isolate;
		padding: 2.75rem clamp(1.25rem, 3vw, 2rem) clamp(1.25rem, 3vw, 2rem);
		text-align: left;
		/* Without scroll-driven animation the outline draws over a second when the state changes. */
		transition: --draw 1s linear;
	}

	.chip[data-accent='cyan'] {
		--edge-a: var(--trace-cyan);
		--edge-b: var(--trace-cyan);
		--led-color: var(--trace-cyan);
	}

	.chip[data-accent='green'] {
		--edge-a: var(--trace-green);
		--edge-b: var(--trace-green);
		--led-color: var(--trace-green);
	}

	.chip[data-accent='split'] {
		--edge-a: var(--trace-cyan);
		--edge-b: var(--trace-green);
		--led-color: var(--ink);
	}

	/* State: off. Outline undrawn, pins dark, no ring, LED dark. */
	:global(html.js:not(.reduced)) .chip:not([data-state]),
	:global(html.js:not(.reduced)) .chip[data-state='off'] {
		--draw: 0;
		--ring: 0;
		--led-fill: transparent;
		--led-glow: transparent;
	}

	/* State: booting. The outline draws, the pins light one after another. */
	:global(html.js:not(.reduced)) .chip[data-state='booting'] {
		--frame-edge: var(--silk);
		--ring: 0;
		--led-fill: transparent;
		--led-glow: transparent;
	}

	.chrome {
		position: absolute;
		inset: 0;
		z-index: -1;
		pointer-events: none;
	}

	/* The translucent body of the chip, cut at the top left to match the outline. */
	.fill {
		position: absolute;
		inset: 0;
		background: var(--chip-fill);
		clip-path: polygon(var(--chamfer) 0, 100% 0, 100% 100%, 0 100%, 0 var(--chamfer));
	}

	/*
	 * The outline layers. They sit half a pixel inside the chip so the 1px stroke is not clipped.
	 * Each segment is dashed with one dash as long as the line (pathLength 1) and the offset hides
	 * part of it: segment n is undrawn at --draw n/5, whole at (n+1)/5, so the five lines draw one
	 * after another, round the chip.
	 */
	.outline {
		position: absolute;
		top: 0.5px;
		left: 0.5px;
		width: calc(100% - 1px);
		height: calc(100% - 1px);
		overflow: visible;
		pointer-events: none;
	}

	.seg {
		fill: none;
		stroke-width: 1px;
		stroke-dasharray: 1 2;
		stroke-dashoffset: calc(1px * (1 - clamp(0, var(--draw) * 5 - var(--seg), 1)));
	}

	.base .seg {
		stroke: var(--frame-edge);
		transition: stroke 0.5s ease;
	}

	.edge-a {
		stop-color: var(--edge-a);
	}

	.edge-b {
		stop-color: var(--edge-b);
	}

	/* The lit ring in the side colour, with a faint glow around it. */
	.glow {
		position: absolute;
		inset: 0;
		opacity: var(--ring);
		filter: drop-shadow(0 0 5px color-mix(in srgb, var(--edge-a) 35%, transparent))
			drop-shadow(0 0 9px color-mix(in srgb, var(--edge-b) 22%, transparent));
		transition: opacity 0.8s ease;
	}

	/*
	 * Where the browser has animation-timeline, the outline draws as the chip scrolls in: --draw
	 * runs from 0 to 1 over the first 520px of scrolling after the top edge of the chip enters at
	 * the bottom of the window. A view timeline follows the scroll both ways and takes no JS. It
	 * replaces the state-driven draw above, which every other browser keeps. Reduced motion gets
	 * neither: the outline is whole from the first paint.
	 */
	@supports (animation-timeline: view()) {
		@media (prefers-reduced-motion: no-preference) {
			:global(html:not(.reduced)) .chrome {
				animation: draw-outline linear both;
				animation-timeline: view();
				animation-range: cover 0px cover 520px;
			}
		}
	}

	@keyframes draw-outline {
		from {
			--draw: 0;
		}
		to {
			--draw: 1;
		}
	}

	/* Designator row: pin-1 dot, the reference text and the LED. */
	.designator {
		position: absolute;
		top: 0.8rem;
		left: 1.75rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--silk);
		font-family: var(--font-display);
		font-size: 0.8125rem;
		line-height: 1;
		pointer-events: none;
	}

	.pin1 {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--silk);
	}

	.led {
		width: 8px;
		height: 8px;
		border: 1px solid var(--silk);
		border-radius: 50%;
		background: var(--led-fill);
		box-shadow: 0 0 6px var(--led-glow);
		transition:
			background-color 0.6s ease,
			box-shadow 0.6s ease;
	}

	/* Pins: real elements outside the border, measured by the board. */
	.pins {
		position: absolute;
		top: calc(var(--chamfer) + 0.5rem);
		bottom: 0.75rem;
		display: flex;
		flex-direction: column;
		justify-content: space-evenly;
		pointer-events: none;
	}

	.pins-left {
		right: 100%;
		--pin-color: var(--trace-cyan);
	}

	.pins-right {
		left: 100%;
		--pin-color: var(--trace-green);
	}

	.pin {
		display: block;
		width: var(--pin-w);
		height: var(--pin-h);
		border-radius: 1px;
		background: var(--pin-off);
		transition:
			background-color 0.3s ease,
			box-shadow 0.3s ease;
		transition-delay: calc(var(--i) * var(--pin-step));
	}

	/* A lit pin. The same rule serves `booting` and `on`; only `off` overrides it. */
	.pin {
		background: var(--pin-color);
		box-shadow: 0 0 6px color-mix(in srgb, var(--pin-color) 55%, transparent);
	}

	:global(html.js:not(.reduced)) .chip:not([data-state]) .pin,
	:global(html.js:not(.reduced)) .chip[data-state='off'] .pin {
		background: var(--pin-off);
		box-shadow: none;
		transition-delay: 0s;
	}

	/*
	 * The board flashes a pin when a pulse arrives: the registry sets data-flash from outside the
	 * template, hence :global. The flash beats every state.
	 */
	.pin:global([data-flash='true']) {
		background: var(--ink) !important;
		box-shadow:
			0 0 10px var(--pin-color),
			0 0 2px var(--ink) !important;
		transition-duration: 0s;
		transition-delay: 0s;
	}

	.body {
		position: relative;
	}

	.body > :global(:last-child) {
		margin-bottom: 0;
	}

	@media (prefers-reduced-motion: reduce) {
		.chip,
		.base .seg,
		.glow,
		.led,
		.pin {
			transition: none;
		}
	}

	:global(html.reduced) .chip,
	:global(html.reduced) .base .seg,
	:global(html.reduced) .glow,
	:global(html.reduced) .led,
	:global(html.reduced) .pin {
		transition: none;
	}
</style>
