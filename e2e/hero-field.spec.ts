import { expect, test, type Page } from '@playwright/test';

// The hero field: a full-window field of traces round a clear ellipse that holds the hero
// content. The canvas tells test runs where the ellipse is (`data-hero-ellipse`, document px).

interface Ellipse {
	cx: number;
	cy: number;
	rx: number;
	ry: number;
}

async function ellipseOf(page: Page): Promise<Ellipse> {
	const value = await page.locator('canvas.pcb-board').getAttribute('data-hero-ellipse');
	const [cx, cy, rx, ry] = (value ?? '').split(' ').map(Number);
	return { cx, cy, rx, ry };
}

/**
 * Reads the canvas: how many pixels inside the ellipse (2 px in from its rim) are painted, and how
 * many are painted in each 160 px corner of the window. The page sits at the top, so document px
 * are window px.
 */
async function paint(page: Page, e: Ellipse) {
	return page.evaluate((e) => {
		const canvas = document.querySelector<HTMLCanvasElement>('canvas.pcb-board')!;
		const ctx = canvas.getContext('2d')!;
		const scale = canvas.width / canvas.getBoundingClientRect().width;
		const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
		const alpha = (x: number, y: number) =>
			data[(Math.round(y * scale) * canvas.width + Math.round(x * scale)) * 4 + 3];
		const width = canvas.width / scale;
		const height = canvas.height / scale;

		let inside = 0;
		const inner = { rx: e.rx - 2, ry: e.ry - 2 };
		for (let y = Math.max(0, e.cy - e.ry); y < Math.min(height, e.cy + e.ry); y += 2) {
			for (let x = Math.max(0, e.cx - e.rx); x < Math.min(width, e.cx + e.rx); x += 2) {
				const d = ((x - e.cx) / inner.rx) ** 2 + ((y - e.cy) / inner.ry) ** 2;
				if (d < 1 && alpha(x, y) > 0) inside++;
			}
		}
		const corner = (x0: number, y0: number) => {
			let n = 0;
			for (let y = y0; y < y0 + 160; y += 2) {
				for (let x = x0; x < x0 + 160; x += 2) if (alpha(x, y) > 0) n++;
			}
			return n;
		};
		return {
			inside,
			corners: [
				corner(0, 0),
				corner(width - 161, 0),
				corner(0, height - 161),
				corner(width - 161, height - 161)
			]
		};
	}, e);
}

/**
 * The hero content: the socket and every block of the text under it, whatever the text holds.
 * Returns the selector of each rendered box with a corner outside the ellipse, and how many boxes
 * were checked.
 */
async function outside(page: Page, e: Ellipse): Promise<{ checked: number; out: string[] }> {
	return page.evaluate((e) => {
		const boxes = [...document.querySelectorAll<HTMLElement>('#hero .socket, #hero .copy > *')];
		const out: string[] = [];
		let checked = 0;
		for (const el of boxes) {
			const r = el.getBoundingClientRect();
			if (r.width === 0 && r.height === 0) continue;
			checked++;
			const corners = [
				[r.left + scrollX, r.top + scrollY],
				[r.right + scrollX, r.top + scrollY],
				[r.left + scrollX, r.bottom + scrollY],
				[r.right + scrollX, r.bottom + scrollY]
			];
			const held = corners.every(
				([x, y]) => ((x - e.cx) / e.rx) ** 2 + ((y - e.cy) / e.ry) ** 2 < 1
			);
			if (!held) out.push(`${el.tagName.toLowerCase()}.${el.className}`);
		}
		return { checked, out };
	}, e);
}

test.describe('hero field', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
	});

	test('surrounds the hero content with traces and keeps an ellipse round it clear', async ({
		page
	}) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('./');
		const canvas = page.locator('canvas.pcb-board');
		await expect(canvas).toHaveAttribute('data-pcb-state', 'static');
		expect(Number(await canvas.getAttribute('data-hero-traces'))).toBeGreaterThan(40);

		const e = await ellipseOf(page);
		const { checked, out } = await outside(page, e);
		// The socket, the name, the rule and the tagline at least.
		expect(checked).toBeGreaterThanOrEqual(4);
		// 80% of the window wide.
		expect(e.rx * 2).toBeCloseTo(0.8 * 1440, 0);
		expect(out).toEqual([]);
		const { inside, corners } = await paint(page, e);
		expect(inside).toBe(0);
		for (const count of corners) expect(count).toBeGreaterThan(50);
	});

	test('builds up from the corners after the load and ends the same way', async ({ page }) => {
		await page.goto('./');
		const canvas = page.locator('canvas.pcb-board');
		await expect(canvas).toHaveAttribute('data-hero-ellipse', /\d/);
		const e = await ellipseOf(page);
		const early = await paint(page, e);
		await expect(canvas).toHaveAttribute('data-pcb-state', 'idle', { timeout: 10_000 });
		const done = await paint(page, e);
		expect(done.inside).toBe(0);
		const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
		expect(sum(done.corners)).toBeGreaterThan(sum(early.corners));
	});
});
