// The 404 page. SvelteKit prerenders it as a route, /not-found/. GitHub Pages serves 404.html, with
// status 404, for every address the site does not have, so the build moves the page there and
// removes the route's folders: /not-found/ itself must answer 404 too.
import { access, cp, rm } from 'node:fs/promises';
import path from 'node:path';

/**
 * @param {string} dir The output folder of a build, e.g. dist/company.
 */
export async function promoteNotFound(dir) {
	const source = path.join(dir, 'not-found', 'index.html');
	try {
		await access(source);
	} catch {
		throw new Error(
			`Cannot build 404.html: ${source} is missing. Is /not-found/ in the prerender entries?`
		);
	}
	await cp(source, path.join(dir, '404.html'));
	// en/not-found only exists if something linked to it; the page itself shows both languages.
	await rm(path.join(dir, 'not-found'), { recursive: true, force: true });
	await rm(path.join(dir, 'en', 'not-found'), { recursive: true, force: true });
}
