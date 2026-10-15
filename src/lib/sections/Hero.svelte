<script lang="ts">
	import { getContent } from '#lib/content/index.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { registerObstacle, registerSocket } from '#lib/pcb/registry.svelte.js';
	import { site } from '#lib/site.js';
	import Logo from '#lib/components/Logo.svelte';
	import ScrollIndicator from '#lib/components/ScrollIndicator.svelte';

	const content = getContent(getLocale());
	const lead = site === 'company' ? content.hero.lead.company : content.hero.lead.personal;

	/**
	 * The photo's footprint: an 11 by 11 grid with pads round the outside and the photo in the
	 * middle, like a ball grid array. Row and column are 1 to 11. The corner at 1,1 holds the pin-1
	 * mark instead of a pad. The ports are the pads the board plugs its traces into: two on each
	 * side, cyan on the left half and green on the right half, like the traces that arrive there.
	 */
	const GRID = 11;
	const PORTS: Record<string, 'cyan' | 'green'> = {
		'1,4': 'cyan',
		'1,8': 'green',
		'4,1': 'cyan',
		'4,11': 'green',
		'8,1': 'cyan',
		'8,11': 'green',
		'11,4': 'cyan',
		'11,8': 'green'
	};

	const ring = Array.from({ length: GRID * GRID }, (_, i) => ({
		row: Math.floor(i / GRID) + 1,
		col: (i % GRID) + 1
	}))
		.filter(({ row, col }) => row === 1 || row === GRID || col === 1 || col === GRID)
		.map(({ row, col }) => ({
			row,
			col,
			pin1: row === 1 && col === 1,
			side: col <= (GRID + 1) / 2 ? 'left' : 'right',
			port: PORTS[`${row},${col}`]
		}));
</script>

<!--
	U0. The hero is a socket: the traces of the board arrive from all four edges and plug into the
	logo (company) or the photo's footprint (personal). The board draws them; this component only
	says where the socket is and which block of text the traces must stay out from under.
	No CTAs here: they live in the availability chips.
-->
<section id="hero" class="hero" data-designator="U0" aria-labelledby="hero-title">
	<div class="stage">
		{#if site === 'company'}
			<div class="socket logo-socket" {@attach registerSocket}>
				<Logo animate title={content.hero.logoAlt} />
			</div>
		{:else}
			<div class="socket photo-socket" {@attach registerSocket}>
				<svg
					class="courtyard"
					viewBox="0 0 100 100"
					preserveAspectRatio="none"
					aria-hidden="true"
					focusable="false"
				>
					<polygon points="11,0.5 99.5,0.5 99.5,99.5 0.5,99.5 0.5,11" />
				</svg>
				<div class="pads" aria-hidden="true">
					{#each ring as pad (`${pad.row},${pad.col}`)}
						<span
							class="pad"
							class:pin1={pad.pin1}
							data-side={pad.side}
							data-port={pad.port}
							style:grid-row={pad.row}
							style:grid-column={pad.col}
						></span>
					{/each}
				</div>
				<div class="die">
					<enhanced:img
						class="photo"
						src="../assets/robbin-schepers.jpg"
						alt={content.hero.photoAlt}
						sizes="(min-width: 40rem) 26rem, 46vw"
					/>
				</div>
			</div>
		{/if}

		<div class="copy" {@attach registerObstacle}>
			<h1 id="hero-title">{content.profile.name}</h1>
			<span class="rule" aria-hidden="true"></span>
			<p class="tagline" lang="en">{content.profile.tagline}</p>
			<p class="lead">{lead}</p>
		</div>
	</div>

	<ScrollIndicator />
</section>

<style>
	/*
	 * main pads its top by this much (app.css). The hero starts at the very top of the window
	 * instead, so it is exactly one window high.
	 */
	.hero {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		min-height: 100vh;
		min-height: 100svh;
		margin-block-start: calc(-1 * clamp(1.5rem, 4vw, 3rem));
		padding-block: clamp(0.75rem, 2svh, 2.5rem) 0.5rem;
		/* The glow behind the socket reaches past the window edge; it must not scroll sideways. */
		overflow-x: clip;
	}

	/* The socket and the text, centred in what the scroll indicator leaves of the window. */
	.stage {
		flex: 1 0 auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		/*
		 * Free board between the socket and the text: the traces that arrive from below turn
		 * into the bottom ports through it. The board keeps a cell clear round both.
		 */
		gap: clamp(3.5rem, 8svh, 5rem);
		width: 100%;
		padding-block: clamp(0.25rem, 1.5svh, 1rem);
	}

	.socket {
		position: relative;
		isolation: isolate;
	}

	/* The board powering up: a faint light under the socket as the traces arrive. */
	.socket::before {
		content: '';
		position: absolute;
		inset: -35%;
		z-index: -1;
		background: radial-gradient(
			closest-side,
			color-mix(in srgb, var(--trace-cyan) 16%, transparent),
			color-mix(in srgb, var(--trace-green) 9%, transparent) 55%,
			transparent
		);
		pointer-events: none;
	}

	.logo-socket {
		width: clamp(16rem, min(52vw, 100svh), 42rem);
	}

	/*
	 * The photo in its footprint, and the focal point of the personal page: a square as big as the
	 * window allows, up to 26rem. 100svh - 27rem is what the text block, the corridor and the scroll
	 * indicator leave of the window, so the hero stays one window high; on a phone the width wins.
	 */
	.photo-socket {
		--size: clamp(10rem, min(46vw, calc(100svh - 27rem)), 26rem);
		width: var(--size);
		height: var(--size);
	}

	/* More light round the photo than round the logo: this is what the eye goes to first. */
	.photo-socket::before {
		inset: -45%;
		background: radial-gradient(
			closest-side,
			color-mix(in srgb, var(--trace-cyan) 24%, transparent),
			color-mix(in srgb, var(--trace-green) 14%, transparent) 55%,
			transparent
		);
	}

	/* Silkscreen outline of the footprint, cut at the top left like the chips. */
	.courtyard {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	.courtyard polygon {
		fill: none;
		stroke: var(--silk);
		stroke-width: 1px;
		vector-effect: non-scaling-stroke;
	}

	.pads {
		position: absolute;
		inset: 0;
		display: grid;
		grid-template: repeat(11, 1fr) / repeat(11, 1fr);
	}

	.pad {
		--pad-color: var(--trace-cyan);
		--pad-bright: var(--pad-cyan);
		place-self: center;
		width: 46%;
		aspect-ratio: 1;
		border-radius: 50%;
		background: color-mix(in srgb, var(--pad-color) 32%, transparent);
	}

	.pad[data-side='right'] {
		--pad-color: var(--trace-green);
		--pad-bright: var(--pad-green);
	}

	/* The pin-1 mark where the first pad would be. */
	.pad.pin1 {
		width: 34%;
		background: var(--silk);
		border-radius: 0;
		clip-path: polygon(0 0, 100% 0, 0 100%);
		place-self: start;
		margin: 14% 0 0 14%;
	}

	/* A port is a pad a trace ends on: lit once the traces have arrived. */
	.pad[data-port] {
		background: var(--pad-bright);
		box-shadow: 0 0 8px color-mix(in srgb, var(--pad-color) 70%, transparent);
	}

	/* The photo sits in the middle 9 by 9 cells, inside a thin chamfered frame. */
	.die {
		position: absolute;
		inset: calc(100% / 11 + 2px);
		background: var(--silk);
		clip-path: polygon(14% 0, 100% 0, 100% 100%, 0 100%, 0 14%);
	}

	/* enhanced:img puts the class on the <img> inside a <picture>. */
	.photo {
		display: block;
		width: calc(100% - 2px);
		height: calc(100% - 2px);
		margin: 1px;
		object-fit: cover;
		object-position: 45% 30%;
		clip-path: polygon(14% 0, 100% 0, 100% 100%, 0 100%, 0 14%);
	}

	.copy {
		display: grid;
		justify-items: center;
		width: fit-content;
		max-width: 100%;
		margin-inline: auto;
		text-align: center;
	}

	h1 {
		margin: 0;
		letter-spacing: -0.02em;
	}

	/* A trace under the name: cyan from the left, green from the right, a pad at each end. */
	.rule {
		position: relative;
		display: block;
		/* The end pads hang 4px outside the line: stay that far inside the hero, which clips sideways. */
		width: min(calc(100% - 10px), 24rem);
		height: 2px;
		margin-block: 1rem 1.25rem;
		background: linear-gradient(90deg, var(--trace-cyan), var(--ink) 50%, var(--trace-green));
	}

	.rule::before,
	.rule::after {
		content: '';
		position: absolute;
		top: 50%;
		width: 9px;
		height: 9px;
		margin-top: -4.5px;
		border-radius: 50%;
	}

	.rule::before {
		left: -4px;
		background: var(--pad-cyan);
	}

	.rule::after {
		right: -4px;
		background: var(--pad-green);
	}

	/* The part marking on a chip: the tagline in a thin box with a pin-1 dot. */
	.tagline {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		margin: 0;
		padding: 0.3rem 0.9rem;
		border: 1px solid var(--silk);
		background: var(--chip-fill);
		font-family: var(--font-display);
		font-size: var(--text-small);
		letter-spacing: 0.02em;
	}

	.tagline::before {
		content: '';
		flex: none;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--silk);
	}

	.lead {
		margin: 1.25rem 0 0;
		max-width: 36rem;
		color: var(--ink-muted);
		font-size: 1.125rem;
		text-wrap: pretty;
	}

	/*
	 * The board powering up, once, about 2.5 s from the load: the traces arrive (the board draws
	 * them, and the logo draws itself), the glow rises behind the socket, the ports light as the
	 * traces reach them and the line under the name runs out from the middle. The text takes no
	 * part: it is there from the first frame. Reduced motion gets the finished picture.
	 */
	@media (prefers-reduced-motion: no-preference) {
		:global(html:not(.reduced)) .socket::before {
			animation: glow-up 1.4s ease-out 0.9s backwards;
		}

		:global(html:not(.reduced)) .pad[data-port] {
			animation: port-on 0.5s ease-out 1.6s backwards;
		}

		:global(html:not(.reduced)) .rule {
			animation: rule-draw 0.9s cubic-bezier(0.45, 0, 0.2, 1) 1.7s backwards;
		}
	}

	@keyframes glow-up {
		from {
			opacity: 0;
		}
	}

	/* From a dim pad to a lit one: the end state is the pad's own style. */
	@keyframes port-on {
		from {
			background: color-mix(in srgb, var(--pad-color) 32%, transparent);
			box-shadow: 0 0 0 transparent;
		}
	}

	/* The 6px of margin let the pads at the ends show once the line is whole. */
	@keyframes rule-draw {
		from {
			clip-path: inset(-6px 50% -6px 50%);
		}
		to {
			clip-path: inset(-6px);
		}
	}
</style>
