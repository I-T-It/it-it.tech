<script lang="ts">
	import { company } from '#lib/content/company.js';
	import { getContent } from '#lib/content/index.js';
	import { visibleProfiles } from '#lib/content/profiles.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { registerHero, registerObstacle, registerSocket } from '#lib/pcb/registry.svelte.js';
	import { site } from '#lib/site.js';
	import GlitchPhoto from '#lib/components/GlitchPhoto.svelte';
	import GlitchToggle from '#lib/components/GlitchToggle.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import { profileIcons } from '#lib/components/profile-icons.js';
	import ScrollIndicator from '#lib/components/ScrollIndicator.svelte';
	import type { Attachment } from 'svelte/attachments';

	const content = getContent(getLocale());

	/**
	 * The line under the name spans the name: as wide as its widest line, so its pads sit on the
	 * first and last glyph (the grid centres it, like the text). Measured from the glyphs, again
	 * once the fonts are in and whenever the name reflows. Without scripts it is as wide as the
	 * text block.
	 */
	const spanName: Attachment<HTMLElement> = (rule) => {
		const name = rule.parentElement?.querySelector('h1');
		if (!name) return;
		const measure = () => {
			const range = document.createRange();
			range.selectNodeContents(name);
			const lines: { top: number; bottom: number; left: number; right: number }[] = [];
			for (const box of range.getClientRects()) {
				if (box.width === 0) continue;
				const middle = (box.top + box.bottom) / 2;
				const line = lines.find((l) => middle > l.top && middle < l.bottom);
				if (line) {
					line.left = Math.min(line.left, box.left);
					line.right = Math.max(line.right, box.right);
				} else {
					lines.push({ top: box.top, bottom: box.bottom, left: box.left, right: box.right });
				}
			}
			const widest = Math.max(0, ...lines.map((l) => l.right - l.left));
			const block = rule.parentElement!.getBoundingClientRect().width;
			// A share of the text block, not pixels: the line never widens the block it sits in.
			if (widest > 0 && block > 0) {
				rule.style.setProperty('--name-width', `${Math.min(100, (widest / block) * 100)}%`);
			}
		};
		measure();
		void document.fonts?.ready.then(measure);
		const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
		observer?.observe(name);
		return () => observer?.disconnect();
	};

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

	/** A pad's place on the ring, clockwise from the top left corner: 0 to 39. */
	const around = (row: number, col: number) =>
		row === 1
			? col - 1
			: col === GRID
				? GRID - 1 + row - 1
				: row === GRID
					? 2 * (GRID - 1) + GRID - col
					: 3 * (GRID - 1) + GRID - row;
	const RING = 4 * (GRID - 1);
	const leadPlaces = [...LEADS].map((key) =>
		around(...(key.split(',').map(Number) as [number, number]))
	);
	/**
	 * When a pad lights once the leads connect: the ones at the contact points first, round the
	 * ring from there, the ones furthest from both last.
	 */
	const lightDelay = (row: number, col: number) => {
		const place = around(row, col);
		const steps = Math.min(
			...leadPlaces.map((lead) => {
				const gap = Math.abs(place - lead);
				return Math.min(gap, RING - gap);
			})
		);
		return `${(0.1 + (steps / (RING / 2)) * 1.1).toFixed(2)}s`;
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
			port: PORTS[`${row},${col}`],
			lead: LEADS.has(`${row},${col}`),
			delay: lightDelay(row, col)
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
							style:--light-delay={pad.delay}
							style:grid-row={pad.row}
							style:grid-column={pad.col}
						></span>
					{/each}
				</div>
				<div class="die">
					<!-- The photo, which now and then glitches into the Roboroads avatar and back. -->
					<GlitchPhoto photoAlt={content.hero.photoAlt} avatarAlt={content.hero.avatarAlt} />
				</div>
				<!-- The stop switch sits outside the die: the die clips. It shows once the glitch starts. -->
				<GlitchToggle />
			</div>
		{/if}

		<div class="copy" {@attach registerObstacle}>
			<!-- Robbin "Roboroads" Schepers: the nickname set like the handle, the quotes quietly. -->
			<h1 id="hero-title">
				{company.givenName}
				<span class="q">"</span><span class="nick">{company.nickname}</span><span class="q">"</span>
				{company.familyName}
			</h1>
			<span class="rule" aria-hidden="true" {@attach spanName}></span>
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

	/* Scan lines over the photo while it is etched in; unseen otherwise. */
	.die::after {
		content: '';
		position: absolute;
		inset: 0;
		opacity: 0;
		background: repeating-linear-gradient(
			to bottom,
			color-mix(in srgb, var(--trace-cyan) 45%, transparent) 0 1px,
			transparent 1px 4px
		);
		pointer-events: none;
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
		/*
		 * As wide as the name's widest line (--name-width, measured), so the end pads sit on its
		 * first and last glyph. Without it: the text block, less room for the pads, which hang 4px
		 * outside the line and must stay inside the hero, which clips sideways.
		 */
		width: var(--name-width, calc(100% - 10px));
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
		 * With scripts the board powers the socket: its two lead traces run into the lead ports with
		 * the rest of the field, and when they arrive (about 4 s in) it sets data-power="on" on the
		 * socket. Until then the glow, the ports and the photo's outline wait; then the outline
		 * draws from the two contact points, the glow rises and the ports light, all within 2.2 s,
		 * so they end with the field (SOCKET_DRAW_MS in growth.ts). Should the board never come,
		 * all that runs after 6 s.
		 */
		:global(html.js:not(.reduced)) .socket::before {
			animation-delay: 6s;
		}

		/*
		 * The pad ring waits out of sight too, then lights from the contact points round the ring
		 * (--light-delay, set per pad); a port then lights up as well.
		 */
		:global(html.js:not(.reduced)) .pad {
			animation: pad-in 0.4s ease-out calc(6s + var(--light-delay, 0s)) backwards;
		}

		:global(html.js:not(.reduced)) .pad[data-port] {
			animation:
				pad-in 0.4s ease-out calc(6s + var(--light-delay, 0s)) backwards,
				port-on 0.5s ease-out calc(6.3s + var(--light-delay, 0s)) backwards;
		}

		/*
		 * The outline shows from the two contact points outward, along the frame both ways: a mask
		 * of two circles on those points that grow. (A dash animation won't do: the stroke does not
		 * scale, and its dashes would not line up with the path's length.)
		 */
		:global(html.js:not(.reduced)) .courtyard {
			--reveal: 150%;
			mask-image:
				radial-gradient(
					circle at 0.5% 68%,
					#000 var(--reveal),
					transparent calc(var(--reveal) + 10%)
				),
				radial-gradient(
					circle at 99.5% 32%,
					#000 var(--reveal),
					transparent calc(var(--reveal) + 10%)
				);
			animation: outline-reveal 1.2s cubic-bezier(0.45, 0, 0.2, 1) 6s backwards;
		}

		/*
		 * The photo is etched in by the traces: it shows from the two contact points outward, under
		 * scan lines that fade, bright at first and settling to its own colours. The mask's two
		 * circles sit on the contact points (outside the die, which is inset a pad from the frame).
		 */
		:global(html.js:not(.reduced)) .die {
			--etch: 150%;
			mask-image:
				radial-gradient(circle at -11% 72%, #000 var(--etch), transparent calc(var(--etch) + 14%)),
				radial-gradient(circle at 111% 28%, #000 var(--etch), transparent calc(var(--etch) + 14%));
			animation: etch 1.6s cubic-bezier(0.3, 0, 0.2, 1) 6s backwards;
		}

		/*
		 * A new name starts each animation over, from the moment the power comes on. The board
		 * sets the attribute, so it is :global: the template never has it.
		 */
		:global(html.js:not(.reduced)) .socket:global([data-power='on'])::before {
			animation-name: glow-up-powered;
			animation-delay: 0.3s;
		}

		:global(html.js:not(.reduced) [data-power='on']) .pad {
			animation-name: pad-in-powered;
			animation-delay: var(--light-delay, 0s);
		}

		:global(html.js:not(.reduced) [data-power='on']) .pad[data-port] {
			animation-name: pad-in-powered, port-on-powered;
			animation-delay: var(--light-delay, 0s), calc(0.3s + var(--light-delay, 0s));
		}

		:global(html.js:not(.reduced) [data-power='on']) .courtyard {
			animation-name: outline-reveal-powered;
			animation-delay: 0s;
		}

		:global(html.js:not(.reduced) [data-power='on']) .die {
			animation-name: etch-powered;
			animation-delay: 0.3s;
		}

		:global(html.js:not(.reduced) [data-power='on']) .die::after {
			animation: scan 1.2s ease-in 1s backwards;
		}

		/* The photo is the <img> of GlitchPhoto, a component of its own: hence :global. */
		:global(html.js:not(.reduced) [data-power='on']) .die :global(.photo) {
			animation: settle 1.9s ease-out 0.3s backwards;
		}

		/*
		 * The text under the logo or photo comes in when the build is done: 2.2 s after the power
		 * (SOCKET_DRAW_MS in growth.ts), the line under the name drawing as it does. The scroll
		 * link follows 2 s later, and its pulse starts then. Only the look waits: the text is in
		 * the page, the accessibility tree and the layout from the start. Should the board never
		 * come, it all shows after 8 s. Keyboard focus anywhere in the hero shows it at once.
		 */
		:global(html.js:not(.reduced)) .copy {
			animation: text-in 0.6s ease-out 8s backwards;
		}

		:global(html.js:not(.reduced)) .rule {
			animation-delay: 8.4s;
		}

		:global(html.js:not(.reduced)) .hero > :global(.scroll-indicator) {
			animation: text-in 0.6s ease-out 10s backwards;
		}

		:global(html.js:not(.reduced)) .hero :global(.scroll-indicator:not([data-done]) .pulse) {
			animation: hero-pulse 1.3s ease-in 10.6s 3 both;
		}

		:global(html.js:not(.reduced)) .socket:global([data-power='on']) ~ .copy {
			animation-name: text-in-powered;
			animation-delay: 2.2s;
		}

		:global(html.js:not(.reduced)) .socket:global([data-power='on']) ~ .copy .rule {
			animation-name: rule-draw-powered;
			animation-delay: 2.5s;
		}

		:global(html.js:not(.reduced))
			.hero:has(.socket:global([data-power='on']))
			> :global(.scroll-indicator) {
			animation-name: text-in-powered;
			animation-delay: 4.2s;
		}

		:global(html.js:not(.reduced))
			.hero:has(.socket:global([data-power='on']))
			:global(.scroll-indicator:not([data-done]) .pulse) {
			animation-name: hero-pulse-powered;
			animation-delay: 4.8s;
		}

		/* !important: this must beat the powered rules above, whatever their weight. */
		:global(html.js:not(.reduced)) .hero:focus-within .copy,
		:global(html.js:not(.reduced)) .hero:focus-within > :global(.scroll-indicator) {
			animation: none !important;
		}
	}

	/* The text and the scroll link come in: from out of sight, a touch bright, to their own look. */
	@keyframes text-in {
		from {
			opacity: 0;
			filter: brightness(1.8);
		}
	}

	@keyframes text-in-powered {
		from {
			opacity: 0;
			filter: brightness(1.8);
		}
	}

	@keyframes rule-draw-powered {
		from {
			clip-path: inset(-6px 50% -6px 50%);
		}
		to {
			clip-path: inset(-6px);
		}
	}

	/* The scroll link's pulse (as in ScrollIndicator), restarted when the link comes in. */
	@keyframes hero-pulse {
		from {
			opacity: 0;
			transform: translateY(-100%);
		}
		20% {
			opacity: 1;
		}
		80% {
			opacity: 1;
		}
		to {
			opacity: 0;
			transform: translateY(2.5rem);
		}
	}

	@keyframes hero-pulse-powered {
		from {
			opacity: 0;
			transform: translateY(-100%);
		}
		20% {
			opacity: 1;
		}
		80% {
			opacity: 1;
		}
		to {
			opacity: 0;
			transform: translateY(2.5rem);
		}
	}

	/* The etch's reach: a registered property, so it animates smoothly. */
	@property --etch {
		syntax: '<percentage>';
		inherits: false;
		initial-value: 150%;
	}

	/* From -14%: the soft edge of the mask starts outside the die too, so nothing shows yet. */
	@keyframes etch {
		from {
			--etch: -14%;
		}
		to {
			--etch: 150%;
		}
	}

	@keyframes etch-powered {
		from {
			--etch: -14%;
		}
		to {
			--etch: 150%;
		}
	}

	@keyframes scan {
		from {
			opacity: 0.9;
		}
		to {
			opacity: 0;
		}
	}

	/* Bright and pale where the traces have just etched it, then its own colours. */
	@keyframes settle {
		from {
			filter: brightness(1.9) saturate(0.1) contrast(1.15);
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

	/* A pad of the frame lights up: from nothing to its own look, a little bright on the way. */
	@keyframes pad-in {
		from {
			opacity: 0;
			transform: scale(0.4);
		}
	}

	@keyframes pad-in-powered {
		from {
			opacity: 0;
			transform: scale(0.4);
		}
	}

	@keyframes port-on-powered {
		from {
			background: color-mix(in srgb, var(--pad-color) 32%, transparent);
			box-shadow: 0 0 0 transparent;
		}
	}

	/* The outline's reach from the contact points: from -10%, so no soft edge shows yet. */
	@property --reveal {
		syntax: '<percentage>';
		inherits: false;
		initial-value: 150%;
	}

	@keyframes outline-reveal {
		from {
			--reveal: -10%;
		}
		to {
			--reveal: 150%;
		}
	}

	@keyframes outline-reveal-powered {
		from {
			--reveal: -10%;
		}
		to {
			--reveal: 150%;
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
