import type { Reroute } from '@sveltejs/kit/hooks';
import { deLocalizeUrl } from '#lib/paraglide/runtime.js';

/** A last path segment with an extension: /_app/env.js, /favicon.svg. Pages have none. */
const FILE_PATH = /\/[^/]+\.[^/]+$/;

export const reroute: Reroute = ({ url }) => {
	const { pathname } = deLocalizeUrl(url);
	// trailingSlash: 'always' makes Paraglide add a slash to every path, files included:
	// /_app/env.js becomes /_app/env.js/. SvelteKit no longer recognises that, so the dev server
	// answers 404 and the page never hydrates. A built site has the file on disk and never asks.
	return FILE_PATH.test(url.pathname) ? pathname.replace(/\/$/, '') : pathname;
};
