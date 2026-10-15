<script lang="ts">
	import { company } from '#lib/content/company.js';
	import { getContent } from '#lib/content/index.js';
	import { visibleProfiles } from '#lib/content/profiles.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { registerHero, registerObstacle, registerSocket } from '#lib/pcb/registry.svelte.js';
	import { site } from '#lib/site.js';
	import Icon from '#lib/components/Icon.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import { profileIcons } from '#lib/components/profile-icons.js';
	import ScrollIndicator from '#lib/components/ScrollIndicator.svelte';

	const content = getContent(getLocale());

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

	/**
	 * The two ports the board's lead traces run into, one on each side. When they arrive, the
	 * footprint's outline draws itself from those two points (see the frame halves below).
	 */
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

	/** Where a lead port's row meets the outline, in the outline's 0 to 100 box. */
	const contact = (row: number) => (((row - 0.5) / GRID) * 100).toFixed(2);
	/** The outline in two halves, each from one lead's contact point round to the other's. */
	const FRAME = [
		`0.5,${contact(8)} 0.5,11 11,0.5 99.5,0.5 99.5,${contact(4)}`,
		`99.5,${contact(4)} 99.5,99.5 0.5,99.5 0.5,${contact(8)}`
	];
</script>

<!--
	U0. The hero is a socket: the traces of the board arrive from all four edges and plug into the
	logo (company) or the photo's footprint (personal). The board draws them; this component only
	says where the socket is and which block of text the traces must stay out from under.
	No CTAs here: they live in the availability chips.
-->
<section
	id="hero"
	class="hero"
	data-designator="U0"
	aria-labelledby="hero-title"
	{@attach registerHero}
>
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
					{#each FRAME as points (points)}
						<polyline class="outline" pathLength="1" {points} />
					{/each}
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
			<!-- Robbin "Roboroads" Schepers: the nickname set like the handle, the quotes quietly. -->
			<h1 id="hero-title">
				{company.givenName}
				<span class="q">"</span><span class="nick">{company.nickname}</span><span class="q">"</span>
				{company.familyName}
			</h1>
			<span class="rule" aria-hidden="true"></span>
			<p class="tagline" lang="en">{content.profile.tagline}</p>
			<!-- The same name everywhere he is online, as in his talks. Text, not a link. -->
			<p class="follow">{m.hero_follow()} <span class="handle">{company.githubHandle}</span></p>
			<!-- The profiles under that name. The address of each is in content/profiles.ts; one whose address is still TODO is left out. -->
			<ul class="profiles" aria-label={m.hero_profiles_label()}>
				{#each visibleProfiles() as profile (profile.id)}
					<li>
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an external address, not a route -->
						<a href={profile.url} rel="me noopener"
							><Icon icon={profileIcons[profile.id]} /><span class="sr-only"
								>{m.profile_on({ service: profile.name }) + ' ' + m.external_site()}</span
							></a
						>
					</li>
				{/each}
			</ul>
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
		gap: clamp(3rem, 7svh, 5rem);
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
		--size: clamp(10rem, min(48vw, calc(100svh - 27rem)), 26rem);
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

	.courtyard .outline {
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

	/*
	 * Robbin "Roboroads" Schepers is 27 characters of Fira Code: 4.6vw keeps it on one line from
	 * about 600px up to 3.75rem, and on a phone it wraps to two lines at 1.75rem, which the
	 * hero's height budget (photo, handle line, icon row, one phone window) allows.
	 */
	h1 {
		margin: 0;
		font-size: clamp(1.75rem, 4.6vw, 3.75rem);
		letter-spacing: -0.02em;
	}

	/* The nickname like the handle below it: Fira Code (the whole heading is) in the accent colour. */
	.nick {
		color: var(--trace-cyan);
	}

	.q {
		color: var(--ink-muted);
	}

	/* A trace under the name: cyan from the left, green from the right, a pad at each end. */
	.rule {
		position: relative;
		display: block;
		/* The end pads hang 4px outside the line: stay that far inside the hero, which clips sideways. */
		width: min(calc(100% - 10px), 24rem);
		height: 2px;
		margin-block: 0.875rem 1rem;
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

	/* One line under the tagline, like a note on a drawing: small, muted, the handle in the display face. */
	.follow {
		margin: 1rem 0 0;
		color: var(--ink-muted);
		font-size: var(--text-small);
	}

	/*
	 * The profile icons, one compact row of 24px targets (the WCAG minimum) with a few pixels
	 * between them: ten fit across a 320 CSS px window. Muted until hovered or focused; nothing
	 * depends on the hover.
	 */
	.profiles {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.1875rem;
		margin: 0.5rem 0 0;
		padding: 0;
		list-style: none;
	}

	.profiles a {
		display: grid;
		place-items: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 50%;
		color: var(--ink-muted);
		font-size: 1rem;
	}

	@media (hover: hover) {
		.profiles a:hover {
			color: var(--ink);
			background: color-mix(in srgb, var(--ink) 12%, transparent);
		}
	}

	/* The handle: Fira Code, white, with a short cyan to green trace under it like the line under the name. */
	.handle {
		padding-bottom: 2px;
		background: linear-gradient(90deg, var(--trace-cyan), var(--trace-green)) bottom / 100% 2px
			no-repeat;
		color: var(--ink);
		font-family: var(--font-display);
		font-weight: 500;
		letter-spacing: 0.02em;
	}

	/*
	 * The board powering up, once: the lead traces arrive (the board draws them, and the logo or
	 * the photo's outline draws itself from where they touch), the glow rises behind the socket,
	 * the ports light and the line under the name runs out from the middle. The text takes no part:
	 * it is there from the first frame. Reduced motion gets the finished picture.
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

		/*
		 * With scripts the board powers the socket: its two lead traces run into the lead ports,
		 * and when they arrive it sets data-power="on" on the socket. Until then the glow, the ports
		 * and the photo's outline wait; then the outline draws from the two contact points, the
		 * glow rises and the ports light. Should the board never come, all that runs after 3 s.
		 */
		:global(html.js:not(.reduced)) .socket::before {
			animation-delay: 3s;
		}

		:global(html.js:not(.reduced)) .pad[data-port] {
			animation-delay: 3.8s;
		}

		:global(html.js:not(.reduced)) .courtyard .outline {
			animation: outline-draw 1.2s cubic-bezier(0.45, 0, 0.2, 1) 3s backwards;
		}

		/*
		 * A new name starts each animation over, from the moment the power comes on. The board
		 * sets the attribute, so it is :global: the template never has it.
		 */
		:global(html.js:not(.reduced)) .socket:global([data-power='on'])::before {
			animation-name: glow-up-powered;
			animation-delay: 0.3s;
		}

		:global(html.js:not(.reduced) [data-power='on']) .pad[data-port] {
			animation-name: port-on-powered;
			animation-delay: 0.8s;
		}

		:global(html.js:not(.reduced) [data-power='on']) .courtyard .outline {
			animation-name: outline-draw-powered;
			animation-delay: 0s;
		}
	}

	@keyframes glow-up {
		from {
			opacity: 0;
		}
	}

	@keyframes glow-up-powered {
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

	@keyframes port-on-powered {
		from {
			background: color-mix(in srgb, var(--pad-color) 32%, transparent);
			box-shadow: 0 0 0 transparent;
		}
	}

	/* Each half of the outline from its lead's contact point on. */
	@keyframes outline-draw {
		from {
			stroke-dasharray: 1;
			stroke-dashoffset: 1;
		}
		to {
			stroke-dasharray: 1;
			stroke-dashoffset: 0;
		}
	}

	@keyframes outline-draw-powered {
		from {
			stroke-dasharray: 1;
			stroke-dashoffset: 1;
		}
		to {
			stroke-dasharray: 1;
			stroke-dashoffset: 0;
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
