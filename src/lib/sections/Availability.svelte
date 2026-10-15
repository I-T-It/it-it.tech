<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { variant } from '#lib/site.js';
</script>

<!-- Stub (U1 and U2). S6 owns this file. The chips follow the variant order; the DOM order is the visual order. -->
{#each variant.availabilityOrder as path (path)}
	{#if path === 'job'}
		<section id="job" data-designator="U1" aria-labelledby="job-title">
			<h2 id="job-title">{m.availability_job_title()}</h2>
		</section>
	{:else}
		<section id="freelance" data-designator="U2" aria-labelledby="freelance-title">
			<h2 id="freelance-title">{m.availability_freelance_title()}</h2>
		</section>
	{/if}
{/each}
