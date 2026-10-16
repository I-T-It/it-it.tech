import { render } from 'svelte/server';
import type { Component } from 'svelte';

/** Test helpers: read back the head that the prerender writes. Not part of the app. */

export interface Tag {
	tag: 'meta' | 'link' | 'title' | 'script';
	attrs: Record<string, string>;
	/** The text inside <title> and <script>. */
	text?: string;
}

const entities: Record<string, string> = {
	'&quot;': '"',
	'&#39;': "'",
	'&lt;': '<',
	'&gt;': '>',
	'&amp;': '&'
};

const decode = (value: string) => value.replace(/&(quot|#39|lt|gt|amp);/g, (m) => entities[m]!);

function attributes(source: string): Record<string, string> {
	const attrs: Record<string, string> = {};
	for (const [, name, value] of source.matchAll(/([\w:-]+)="([^"]*)"/g)) {
		attrs[name!] = decode(value!);
	}
	return attrs;
}

/** Every meta, link, title and script tag of the head a component writes. */
export function headTags(component: Component<Record<string, never>>): Tag[] {
	const { head } = render(component, { props: {} });
	const tags: Tag[] = [];
	for (const m of head.matchAll(/<(meta|link)\b([^>]*?)\/?>/g)) {
		tags.push({ tag: m[1] as 'meta' | 'link', attrs: attributes(m[2]!) });
	}
	for (const m of head.matchAll(/<title>([\s\S]*?)<\/title>/g)) {
		tags.push({ tag: 'title', attrs: {}, text: decode(m[1]!) });
	}
	for (const m of head.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
		tags.push({ tag: 'script', attrs: attributes(m[1]!), text: m[2]! });
	}
	return tags;
}

/** The content of `<meta name="...">` or `<meta property="...">`, all of them. */
export function metaContent(tags: Tag[], key: string): string[] {
	return tags
		.filter((t) => t.tag === 'meta' && (t.attrs.name === key || t.attrs.property === key))
		.map((t) => t.attrs.content ?? '');
}

export function linkTags(tags: Tag[], rel: string): Tag[] {
	return tags.filter((t) => t.tag === 'link' && t.attrs.rel === rel);
}

/** The parsed JSON-LD of the head. Exactly one script is expected. */
export function jsonLdOf(tags: Tag[]): { '@graph': Record<string, unknown>[] } {
	const scripts = tags.filter((t) => t.tag === 'script' && t.attrs.type === 'application/ld+json');
	if (scripts.length !== 1) throw new Error(`expected one ld+json script, got ${scripts.length}`);
	return JSON.parse(scripts[0]!.text!);
}

/** Something that looks like an email address. The JSON-LD keys (@id, @type) do not match. */
export const EMAIL_PATTERN = /[A-Za-z0-9._-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/;
