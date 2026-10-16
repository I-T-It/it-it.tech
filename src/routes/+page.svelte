<script lang="ts">
	import { getContent } from '#lib/content/index.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { site } from '#lib/site.js';
	import PcbBoard from '#lib/components/PcbBoard.svelte';
	import Hero from '#lib/sections/Hero.svelte';
	import Availability from '#lib/sections/Availability.svelte';
	import About from '#lib/sections/About.svelte';
	import Competences from '#lib/sections/Competences.svelte';
	import Experience from '#lib/sections/Experience.svelte';
	import Skills from '#lib/sections/Skills.svelte';
	import Talks from '#lib/sections/Talks.svelte';
	import EducationLanguages from '#lib/sections/EducationLanguages.svelte';
	import Contact from '#lib/sections/Contact.svelte';

	// The title of the page is page copy, so it lives in the content files with the descriptions.
	const meta = getContent(getLocale()).meta[site];
</script>

<!-- S8 replaces this title with the Seo component. -->
<svelte:head>
	<title>{meta.title}</title>
</svelte:head>

<PcbBoard />

<main id="main" tabindex="-1">
	<Hero />
	<!-- The two availability chips are ordered inside, by the variant. -->
	<Availability />
	<About />
	<Competences />
	<Experience />
	<Skills />
	<Talks />
	<EducationLanguages />
	<Contact />
</main>
