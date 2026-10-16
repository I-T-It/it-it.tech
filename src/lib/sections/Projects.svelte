<script lang="ts">
	import Chip from '#lib/components/Chip.svelte';
	import { getContent } from '#lib/content/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';

	const content = getContent(getLocale()).projects;
</script>

<!-- U10. Projects of his own, 2 by 2 on a wide window, laid out like the cells of a datasheet table. -->
<Chip id="projects" designator="U10" labelledby="projects-title" side="both">
	<h2 id="projects-title">{content.title}</h2>
	{#if content.intro}
		<p class="intro">{content.intro}</p>
	{/if}

	<ul class="grid">
		{#each content.projects as project (project.id)}
			<li class="project" data-project={project.id} data-status={project.status}>
				<div class="head">
					<h3>{project.title}</h3>
					<!-- The dot before the word is decoration; the word says the status. -->
					<p class="status">{content.labels.status[project.status]}</p>
				</div>

				<div class="description">
					{#each project.description as paragraph (paragraph)}
						<p>{paragraph}</p>
					{/each}
				</div>

				<ul class="tech">
					{#each project.tech as tech (tech)}
						<li>{tech}</li>
					{/each}
				</ul>

				{#if project.links.length}
					<ul class="links">
						{#each project.links as link (link.url)}
							<li>
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an external address, not a route -->
								<a href={link.url}
									>{link.label}<span class="sr-only"
										>{', ' + project.title + ' ' + m.external_site()}</span
									></a
								>
							</li>
						{/each}
					</ul>
				{/if}
			</li>
		{/each}
	</ul>
</Chip>

<style>
	.intro {
		color: var(--ink-muted);
	}

	/* The gap between the cells shows the hairline colour behind them. */
	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1px;
		margin: 1.25rem 0 0;
		padding: 0;
		border: 1px solid var(--silk-faint);
		background: var(--silk-faint);
		list-style: none;
	}

	@media (min-width: 48rem) {
		.grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	.project {
		display: flex;
		flex-direction: column;
		min-width: 0;
		padding: 1.25rem clamp(1rem, 4vw, 1.5rem);
		background: var(--chip-fill);
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.25rem 1rem;
	}

	h3 {
		margin: 0;
		font-size: var(--text-h3);
		overflow-wrap: anywhere;
	}

	/* A lit pad before the word: green for a project that is out, cyan for one that is coming. */
	.status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		color: var(--ink-muted);
		font-family: var(--font-display);
		font-size: 0.8125rem;
		line-height: 1.5;
	}

	.status::before {
		content: '';
		flex: none;
		width: 8px;
		height: 8px;
		box-sizing: border-box;
		border: 1px solid var(--silk);
		border-radius: 50%;
	}

	.project[data-status='live'] .status::before {
		border-color: var(--pad-green);
		background: var(--pad-green);
		box-shadow: 0 0 6px color-mix(in srgb, var(--trace-green) 60%, transparent);
	}

	.project[data-status='soon'] .status::before {
		border-color: var(--pad-cyan);
		background: var(--pad-cyan);
		box-shadow: 0 0 6px color-mix(in srgb, var(--trace-cyan) 60%, transparent);
	}

	.project[data-status='wip'] .status::before {
		border-color: var(--pad-cyan);
	}

	.description {
		margin-top: 0.75rem;
		color: var(--ink-muted);
		overflow-wrap: anywhere;
	}

	.description p {
		margin-bottom: 0.5em;
	}

	.description p:last-child {
		margin-bottom: 0;
	}

	/* Technologies: small parts with a pad at each end, like surface-mount components. */
	.tech {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin: 0.75rem 0 0;
		padding: 0;
		list-style: none;
	}

	.tech li {
		padding: 0.0625rem 0.5rem;
		border: 1px solid var(--silk-faint);
		border-inline-width: 3px;
		color: var(--ink-muted);
		font-family: var(--font-display);
		font-size: 0.8125rem;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}

	.links {
		margin: auto 0 0;
		padding: 0.5rem 0 0;
		list-style: none;
	}

	.links li {
		overflow-wrap: anywhere;
	}

	/* A pointer target of at least 24px, even for a one-line link. */
	.links a {
		display: inline-block;
		padding-block: 0.25rem;
	}
</style>
