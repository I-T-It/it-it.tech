/**
 * Paraglide compiler options, shared by vite.config.ts and scripts/compile-paraglide.mjs so the
 * generated runtime is the same wherever it is compiled.
 *
 * Paraglide matches on the full URL, base path included. NL has no prefix and EN lives at /en.
 * No cookies and no storage: the URL is the only source of the locale.
 *
 * @param {string} base The SvelteKit base path: '' or something like '/it-it.tech'.
 * @returns {import('@inlang/paraglide-js').CompilerOptions}
 */
export function paraglideOptions(base) {
	const origin = ':protocol://:domain(.*)::port?';
	return {
		project: './project.inlang',
		outdir: './src/lib/paraglide',
		emitTsDeclarations: true,
		strategy: ['url', 'baseLocale'],
		trailingSlash: 'always',
		urlPatterns: [
			{
				pattern: `${origin}${base}/:path(.*)?`,
				localized: [
					['en', `${origin}${base}/en/:path(.*)?`],
					['nl', `${origin}${base}/:path(.*)?`]
				]
			}
		]
	};
}
