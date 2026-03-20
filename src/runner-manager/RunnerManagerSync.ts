/**
 * @fileoverview Orchestrator that synchronises on-disk test cases with the
 * Runner Manager database table.
 *
 * Compares the output of {@link ITestCaseScanner} with existing DB entries
 * from {@link ITestCaseRegistry} and batch-inserts any missing tests.
 * Depends only on abstractions — satisfies Dependency Inversion.
 *
 * @module runner-manager/RunnerManagerSync
 * @author Vicky
 * @since 1.0.0
 */
import { Logger } from '../utils/logger';
import type {
    IRunnerManagerSync,
    ITestCaseRegistry,
    ITestCaseScanner,
    NewRunnerManagerEntry,
    RegistrationSource,
    SyncResult,
} from './types';

const logger = new Logger('RunnerManagerSync');

export class RunnerManagerSync implements IRunnerManagerSync {

    constructor(
        private readonly registry: ITestCaseRegistry,
        private readonly scanner: ITestCaseScanner,
    ) {}

    /**
     * Scans all spec files, compares with the DB, and inserts missing entries.
     *
     * @param author  - Git / system author name (default `'unknown'`)
     * @param source  - How the sync was triggered
     * @returns Summary of what was scanned and inserted
     */
    async syncAll(
        author: string = 'unknown',
        source: RegistrationSource = 'manual',
    ): Promise<SyncResult> {
        try {
            await this.registry.ensureColumns();

            const scanned = await this.scanner.scanAll();
            const existing = await this.registry.findAll();
            const existingIds = new Set(existing.map((e) => e.id));

            const missing = scanned.filter((s) => !existingIds.has(s.testCaseId));

            if (missing.length === 0) {
                logger.info(
                    `Sync complete — ${scanned.length} scanned, all already registered`,
                );
                return {
                    scanned: scanned.length,
                    existing: existing.length,
                    inserted: 0,
                    entries: scanned,
                };
            }

            const newEntries: NewRunnerManagerEntry[] = missing.map((m) => ({
                testCaseId: m.testCaseId,
                testName: m.testName,
                testTitle: m.describeName,
                scriptPath: m.scriptPath,
                author,
                enabled: true,
                tags: '',
                registeredBy: source,
            }));

            await this.registry.registerBatch(newEntries);

            logger.info(
                `Sync complete — scanned=${scanned.length}, existing=${existing.length}, ` +
                `inserted=${missing.length} [${missing.map((m) => m.testCaseId).join(', ')}]`,
            );

            return {
                scanned: scanned.length,
                existing: existing.length,
                inserted: missing.length,
                entries: scanned,
            };
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.warn(`RunnerManagerSync failed: ${msg} — tests will run without sync`);
            return { scanned: 0, existing: 0, inserted: 0, entries: [] };
        }
    }
}
