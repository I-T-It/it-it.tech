// Compiles the messages into src/lib/paraglide so check, lint and editors can see them without a
// dev server or a build. Vite recompiles with the same options on dev, build and test.
import { compile } from '@inlang/paraglide-js';
import { paraglideOptions } from './paraglide-options.mjs';
import { resolveBuildEnv } from './site-env.mjs';

const { BASE_PATH } = resolveBuildEnv(process.env);
await compile(paraglideOptions(BASE_PATH));
