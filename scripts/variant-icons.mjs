// The two builds have an icon set each: static/icons/company and static/icons/personal. SvelteKit
// copies all of static/ into every build, so a finished build is cleaned up here: the other
// variant's icons go, and the icon of this variant is also answered at /favicon.ico, where browsers
// and feed readers look when a page has no link tag.
import { cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { SITES } from './site-env.mjs';

/**
 * @param {string} dir The output folder of a build, e.g. dist/personal.
 * @param {'company' | 'personal'} site The variant that was built.
 */
export async function pruneVariantIcons(dir, site) {
	for (const other of SITES) {
		if (other !== site) await rm(path.join(dir, 'icons', other), { recursive: true, force: true });
	}
	// Throws when the icons of this variant are missing: a build without them must not pass.
	await cp(path.join(dir, 'icons', site, 'favicon.ico'), path.join(dir, 'favicon.ico'), {
		errorOnExist: false
	});
}
