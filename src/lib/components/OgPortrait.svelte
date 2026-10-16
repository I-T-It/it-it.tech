<script lang="ts">
	interface Props {
		/** The alt text of the photo (`hero.photoAlt`). The caller passes it, this component holds no copy. */
		alt: string;
	}

	let { alt }: Props = $props();

	/**
	 * The photo's footprint as the hero draws it (Hero.svelte): an 11 by 11 grid with pads round the
	 * outside and the photo in the middle, like a ball grid array. The corner at 1,1 holds the pin-1
	 * mark. The ports are the pads the board plugs its traces into, two of them the lead traces,
	 * one on each side. Still, no glitch: this is the finished picture.
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
	const LEADS = new Set(['8,1', '4,11']);

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
			port: PORTS[`${row},${col}`],
			lead: LEADS.has(`${row},${col}`)
		}));
</script>

<!--
	Personal card only. The company build swaps this component for an empty one (vite.config.ts), so
	the photo's image files stay out of the company output, as with the hero's photo.
-->
<div class="portrait">
	<svg
		class="courtyard"
		viewBox="0 0 100 100"
		preserveAspectRatio="none"
		aria-hidden="true"
		focusable="false"
	>
		<polygon class="outline" points="0.5,11 11,0.5 99.5,0.5 99.5,99.5 0.5,99.5" />
	</svg>
	<div class="pads" aria-hidden="true">
		{#each ring as pad (`${pad.row},${pad.col}`)}
			<span
				class="pad"
				class:pin1={pad.pin1}
				data-side={pad.side}
				data-port={pad.port}
				data-lead={pad.lead ? '' : undefined}
				style:grid-row={pad.row}
				style:grid-column={pad.col}
			></span>
		{/each}
	</div>
	<div class="die">
		<enhanced:img class="photo" src="../assets/robbin-schepers.jpg" {alt} sizes="200px" />
	</div>
</div>

<style>
	.portrait {
		position: relative;
		width: 100%;
		height: 100%;
	}

	.courtyard {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	.outline {
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

	.pad.pin1 {
		width: 34%;
		background: var(--silk);
		border-radius: 0;
		clip-path: polygon(0 0, 100% 0, 0 100%);
		place-self: start;
		margin: 14% 0 0 14%;
	}

	/* A port is a pad a trace ends on, lit. */
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

	.photo {
		display: block;
		width: calc(100% - 2px);
		height: calc(100% - 2px);
		margin: 1px;
		object-fit: cover;
		object-position: 45% 30%;
		clip-path: polygon(14% 0, 100% 0, 100% 100%, 0 100%, 0 14%);
	}
</style>
