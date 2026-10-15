# it-it.tech

Source of two sites that share one codebase: the I.T. It company site (it-it.tech) and the personal page and CV of Robbin Schepers (deschepers.nl). Both are static SvelteKit builds with a circuit board background drawn on a canvas.

| Build    | Leads with                     | Live address                               |
| -------- | ------------------------------ | ------------------------------------------ |
| company  | I.T. It, freelance work        | https://i-t-it.github.io/it-it.tech/       |
| personal | Robbin, the day job and the CV | https://roboroads.github.io/deschepers.nl/ |

The custom domains it-it.tech and deschepers.nl replace the github.io addresses once their DNS records are in place.

## Run it

Node 24 and pnpm. `.nvmrc` pins the Node version.

```sh
pnpm install
pnpm exec playwright install chromium

pnpm dev            # company build on http://localhost:5173/
pnpm dev:personal   # personal build
```

Other commands:

```sh
pnpm check          # svelte-check
pnpm lint           # prettier and eslint
pnpm test           # vitest, unit and browser
pnpm test:e2e       # builds both variants and runs Playwright against them
pnpm test:dev       # starts pnpm dev for each variant and base path, checks the page hydrates
pnpm build:company  # dist/company and e2e-out/company/it-it.tech
pnpm build:personal # dist/personal and e2e-out/personal/deschepers.nl
```

To look at a production build, serve the copy under its base path:

```sh
pnpm exec sirv e2e-out/company --port 4173    # http://localhost:4173/it-it.tech/
pnpm exec sirv e2e-out/personal --port 4174   # http://localhost:4174/deschepers.nl/
```

`pnpm test:e2e` uses ports 4173 and 4174. Set `E2E_PORT_COMPANY` and `E2E_PORT_PERSONAL` when they are taken.

`pnpm test:dev` runs the dev server on port 5180, one variant at a time (set `DEV_TEST_PORT` when it is taken). `pnpm dev` has no base path unless you set `BASE_PATH`.

## How the two builds differ

`PUBLIC_SITE` (`company` or `personal`, default `company`) is read at build time. The variant changes the order of the sections, which call to action is filled, the lead line and the `<head>`. Only the company build shows an email address. Components import `site` from `#lib/site`; there is no hostname check at runtime.

`BASE_PATH` and `PUBLIC_SITE_URL` default to the github.io values. `scripts/build-variant.mjs` sets them per variant.

## Layout

```
src/lib/site.ts          build-time variant and addresses
src/lib/content/         typed copy (Dutch and English) and company facts
src/lib/pcb/             board registry, later the layout engine and renderer
src/lib/sections/        one component per section of the page
messages/                interface strings (Paraglide)
scripts/                 build-variant.mjs, e2e-serve.mjs, test-dev.mjs and shared helpers
e2e/                     Playwright specs for the built sites
e2e-dev/                 Playwright specs for the dev server
```

Dutch is the source language and lives at `/`, English at `/en/`.

## Deploy

`.github/workflows/site.yml` runs on every push and pull request: check, lint, unit tests and e2e. On a push to `main` it builds both variants. The company build goes to GitHub Pages of this repo. The personal build is pushed as a single commit to the `main` branch of Roboroads/deschepers.nl, which serves it with Pages, using the deploy key in the secret `DESCHEPERS_DEPLOY_KEY`.

The repository variables `COMPANY_DOMAIN` and `PERSONAL_DOMAIN` switch a build to its custom domain: the base path becomes empty and the addresses use the domain.

## Accessibility

The target is WCAG 2.2 level AA. The e2e suite runs axe with the `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` and `wcag22aa` tags and expects no violations.
