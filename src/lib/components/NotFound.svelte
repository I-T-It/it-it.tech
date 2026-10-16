<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { localizeHref } from '#lib/paraglide/runtime.js';

	// One file answers every unknown address, /en/ ones included, so the page cannot follow the
	// locale of the URL. It always shows both languages, each from its own message file. The
	// prerender and the browser then write the same thing.
	const nl = { locale: 'nl' } as const;
	const en = { locale: 'en' } as const;

	const title = `${m.not_found_title({}, nl)} / ${m.not_found_title({}, en)}`;
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main id="main" tabindex="-1">
	<div class="card">
		<!-- A silkscreen mark, not content. -->
		<p class="code" aria-hidden="true">404</p>

		<h1>
			<span lang="nl">{m.not_found_title({}, nl)}</span>
			<span class="slash" aria-hidden="true">/</span>
			<span lang="en">{m.not_found_title({}, en)}</span>
		</h1>

		<!--
			localizeHref needs the resolved path, so the lint rule cannot see the resolve() call.
			data-sveltekit-reload forces a full page load: lang and data-site live in the prerendered
			<html>, and this page may be shown at any depth of the site.
		-->
		<div class="languages">
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<div class="language">
				<p lang="nl">{m.not_found_text({}, nl)}</p>
				<a
					class="cta cta-job"
					href={localizeHref(resolve('/'), { locale: 'nl' })}
					hreflang="nl"
					lang="nl"
					data-sveltekit-reload>{m.not_found_home({}, nl)}</a
				>
			</div>
			<div class="language">
				<p lang="en">{m.not_found_text({}, en)}</p>
				<a
					class="cta cta-freelance"
					href={localizeHref(resolve('/'), { locale: 'en' })}
					hreflang="en"
					lang="en"
					data-sveltekit-reload>{m.not_found_home({}, en)}</a
				>
			</div>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</div>
	</div>
</main>

<style>
	/* The card sits in the middle of the room the short page leaves. */
	main {
		justify-content: center;
	}

	/* Ruled like a chip outline: a silkscreen border on a translucent fill. */
	.card {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: clamp(1.25rem, 4vw, 2.5rem);
		border: 1px solid var(--silk);
		background: var(--chip-fill);
	}

	.code {
		margin: 0;
		color: var(--ink-muted);
		font-family: var(--font-display);
		font-size: var(--text-small);
		letter-spacing: 0.3em;
	}

	h1 {
		margin: 0;
		font-size: clamp(1.75rem, 5vw, 3rem);
		overflow-wrap: anywhere;
	}

	.slash {
		margin-inline: 0.25em;
		color: var(--ink-muted);
	}

	.languages {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
		gap: 1px;
		border: 1px solid var(--silk-faint);
		background: var(--silk-faint);
	}

	/* The gap shows the background: a hairline between the two languages. */
	.language {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1rem;
		padding: 1.25rem;
		background: var(--chip-fill);
	}

	.language p {
		margin: 0;
	}
</style>
