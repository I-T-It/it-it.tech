<script lang="ts">
	import { company } from '#lib/content/company.js';
	import { m } from '#lib/paraglide/messages.js';

	// The year is fixed when the page is built; the sites rebuild on every push.
	const year = new Date().getFullYear();

	const links = [
		{ href: company.linkedin, label: () => m.link_linkedin() },
		{ href: company.github, label: () => m.link_github() }
	];
</script>

<!-- No email in the footer, on either build: the address lives in the contact chip (company only). -->
<footer class="site-footer">
	<!-- Laid out like the title block in the corner of a drawing: ruled cells, one fact each. -->
	<div class="block">
		<p class="cell who">
			<span class="name">{company.name}</span>
			<span class="muted">{company.city}</span>
		</p>

		<dl class="numbers">
			<div class="cell">
				<dt class="muted">{m.footer_kvk()}</dt>
				<dd>{company.kvk}</dd>
			</div>
			<div class="cell">
				<dt class="muted">{m.footer_btw()}</dt>
				<dd>{company.btw}</dd>
			</div>
		</dl>

		<ul class="cell links">
			{#each links as link (link.href)}
				<li>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an external address, not a route -->
					<a href={link.href}
						>{link.label()}<span class="sr-only">{' ' + m.external_site()}</span></a
					>
				</li>
			{/each}
		</ul>
	</div>

	<p class="copyright">{m.footer_copyright({ year, name: company.name })}</p>
</footer>

<style>
	.site-footer {
		position: relative;
		width: min(var(--content-max), calc(100% - 2 * var(--gutter)));
		margin: 0 auto;
		padding-block: 2.5rem 2rem;
	}

	/* A trace along the top edge, the mirror of the one under the header. */
	.site-footer::before {
		content: '';
		position: absolute;
		inset: 0 0 auto;
		height: 1px;
		background: linear-gradient(
			90deg,
			color-mix(in srgb, var(--trace-cyan) 65%, transparent),
			color-mix(in srgb, var(--trace-green) 65%, transparent)
		);
		pointer-events: none;
	}

	/* The cells sit on a hairline grid: the gap shows the background. */
	.block {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: 1px;
		border: 1px solid var(--silk-faint);
		background: var(--silk-faint);
	}

	.numbers {
		display: contents;
		margin: 0;
	}

	.cell {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.125rem;
		min-width: 0;
		margin: 0;
		padding: 0.75rem 1rem;
		background: var(--chip-fill);
		font-family: var(--font-display);
		font-size: var(--text-small);
		line-height: 1.4;
	}

	.numbers .cell {
		overflow-wrap: anywhere;
	}

	.name {
		font-weight: 500;
	}

	.muted {
		color: var(--ink-muted);
		font-size: 0.8125rem;
	}

	dd {
		margin: 0;
	}

	.links {
		padding-inline-start: 1rem;
		list-style: none;
	}

	.links a {
		display: inline-flex;
		align-items: center;
		min-height: 1.75rem;
	}

	.copyright {
		margin: 1rem 0 0;
		color: var(--ink-muted);
		font-size: 0.8125rem;
	}
</style>
