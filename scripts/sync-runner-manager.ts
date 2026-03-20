#!/usr/bin/env ts-node
/**
 * @fileoverview CLI entry point for synchronising test cases with the
 * Runner Manager database.
 *
 * Designed to run as a git pre-commit hook (via Husky) or manually:
 *   npx ts-node scripts/sync-runner-manager.ts
 *   npx ts-node scripts/sync-runner-manager.ts --source=git-hook
 *
 * The script:
 * 1. Resolves the git author from `git config user.name`.
 * 2. Scans all `.spec.ts` files for test-case metadata.
 * 3. Inserts any test cases missing from the cloud DB.
 *
 * @module scripts/sync-runner-manager
 * @author Vicky
 * @since 1.0.0
 */
import { execSync } from 'child_process';
import path from 'path';

// Ensure env files are loaded before anything touches process.env
// eslint-disable-next-line @typescript-eslint/no-require-imports
require(path.resolve(__dirname, '..', 'src', 'config', 'envLoader')).loadEnvFiles({
    cwd: path.resolve(__dirname, '..'),
});

import { RunnerManagerRepository, RunnerManagerSync, TestCaseScanner } from '../src/runner-manager';
import { closeConnection } from '../src/utils/databaseConnectionManager';
import type { RegistrationSource } from '../src/runner-manager';

function getGitAuthor(): string {
    try {
        return execSync('git config user.name', { encoding: 'utf-8' }).trim() || 'unknown';
    } catch {
        return 'unknown';
    }
}

function parseSource(): RegistrationSource {
    const arg = process.argv.find((a) => a.startsWith('--source='));
    if (arg) {
        const val = arg.split('=')[1] as RegistrationSource;
        if (['mcp', 'git-hook', 'execution-sync', 'manual'].includes(val)) return val;
    }
    return 'manual';
}

async function main(): Promise<void> {
    const author = getGitAuthor();
    const source = parseSource();

    console.log(`[sync-runner-manager] author="${author}", source="${source}"`);

    const repo = new RunnerManagerRepository();
    const scanner = new TestCaseScanner();
    const sync = new RunnerManagerSync(repo, scanner);

    const result = await sync.syncAll(author, source);

    console.log(
        `[sync-runner-manager] scanned=${result.scanned}, existing=${result.existing}, inserted=${result.inserted}`,
    );

    await closeConnection();
}

main().catch((err) => {
    console.error('[sync-runner-manager] Fatal error:', err);
    process.exit(1);
});
