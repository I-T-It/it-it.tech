import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * The axe tag set for every a11y check: WCAG 2.0, 2.1 and 2.2 level A and AA.
 * Target: zero violations of any impact (not only serious or critical), on NL and EN of both
 * builds, after hydration and with details open.
 */
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export async function expectNoAxeViolations(page: Page): Promise<void> {
	const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
	const summary = results.violations.map((violation) => ({
		id: violation.id,
		impact: violation.impact,
		nodes: violation.nodes.map((node) => node.target.join(' '))
	}));
	expect(summary).toEqual([]);
}
