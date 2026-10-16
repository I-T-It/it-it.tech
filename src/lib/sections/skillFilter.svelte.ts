/**
 * The skill the Experience chip is filtered on, shared by Experience (the filter and the list)
 * and Skills (the links that set it). The address is the source of truth: `?skill=laravel` in the
 * query restores the filter on load, and a choice is written back, so the address in the bar is
 * always a link that shows the same roles. Client only; the prerendered page shows every role.
 */
import { goto } from '$app/navigation';
import { readSkillParam, skillAddress } from '#lib/format/skills.js';

/** The id of the Experience chip. The address ends in it, so a shared link lands on the roles. */
export const EXPERIENCE_ID = 'experience';

let active = $state<string>();

/**
 * Puts the address in the bar without a new history entry. SvelteKit does it as a shallow
 * navigation, which also updates `page.url`. Where its router is not running (a component test,
 * or a page that failed to start) the history API does the same through the prototype, which
 * SvelteKit's development warning does not watch.
 */
function writeAddress(key: string | undefined): void {
	const next = skillAddress(location.href, key, EXPERIENCE_ID);
	if (next === location.href) return;
	const plain = () => History.prototype.replaceState.call(history, history.state, '', next);
	// `next` is the address of this page with another query, so the base path is already in it.
	// eslint-disable-next-line svelte/no-navigation-without-resolve -- not a route to resolve
	goto(next, { shallow: true, replace: true }).catch(plain);
}

export const skillFilter = {
	/** The key of the skill the roles are filtered on, or nothing for all of them. */
	get active(): string | undefined {
		return active;
	},

	/** Takes the filter from the address. A skill that no role has counts as no skill. */
	restore(available: ReadonlySet<string>): void {
		active = readSkillParam(location.search, available);
	},

	/** Filters on a skill (or on nothing) and writes it to the address. */
	select(key: string | undefined): void {
		active = key;
		writeAddress(key);
	}
};
