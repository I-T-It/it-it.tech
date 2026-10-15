#!/usr/bin/env node
// Runs prettier with the repo's ignore files plus the local git exclude file:
//   node scripts/prettier.mjs --check .
//   node scripts/prettier.mjs --write .
//
// Local helper files (.ai/, CLAUDE.md, .claude/, the CV export) are listed in the git exclude file,
// so applying it keeps prettier away from them without naming them in a committed file.
//
// Two things stop `--ignore-path .git/info/exclude` from working:
// - In a worktree `.git` is a file, so that path is unreadable. Ask git where the file is.
// - Prettier matches patterns against the path relative to the ignore file. The exclude file lives
//   in the main checkout's `.git/info/`, so a worktree under `.claude/worktrees/` gets the relative
//   path `../../.claude/worktrees/...`, matches `.claude/` and every file counts as ignored. Copy
//   the patterns into a temporary ignore file in the repo root, so paths stay relative to the root.
//
// No git or no exclude file (a fresh CI clone) just means one less ignore file.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @returns {string | null} patterns of the git exclude file, if there is one */
function gitExcludePatterns() {
	const result = spawnSync('git', ['rev-parse', '--git-path', 'info/exclude'], {
		cwd: root,
		encoding: 'utf8'
	});
	if (result.status !== 0) return null;
	const file = path.resolve(root, result.stdout.trim());
	return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

const ignoreFiles = [path.join(root, '.gitignore'), path.join(root, '.prettierignore')];

const patterns = gitExcludePatterns();
if (patterns !== null) {
	const exclude = path.join(root, `.prettier-exclude-${process.pid}`);
	writeFileSync(exclude, patterns);
	process.on('exit', () => rmSync(exclude, { force: true }));
	for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(1));
	ignoreFiles.push(exclude);
}

const prettier = createRequire(import.meta.url).resolve('prettier/bin/prettier.cjs');
const args = [
	prettier,
	...ignoreFiles.flatMap((file) => ['--ignore-path', file]),
	...process.argv.slice(2)
];

spawn(process.execPath, args, { cwd: root, stdio: 'inherit' })
	.on('error', (error) => {
		throw error;
	})
	.on('close', (status) => process.exit(status ?? 1));
