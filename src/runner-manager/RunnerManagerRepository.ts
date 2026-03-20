/**
 * @fileoverview MySQL-backed implementation of {@link ITestCaseRegistry}.
 *
 * Uses the existing {@link databaseConnectionManager} infrastructure so
 * the Runner Manager shares the same connection pool as the rest of the
 * framework. SQL queries are loaded from `sqlQueries.json` for easy
 * maintenance.
 *
 * @module runner-manager/RunnerManagerRepository
 * @author Vicky
 * @since 1.0.0
 */
import fs from 'fs';
import path from 'path';
import { Logger } from '../utils/logger';
import { FrameworkConstants } from '../constants/frameworkConstants';
import { getConnection, isMySqlPool } from '../utils/databaseConnectionManager';
import type {
    ITestCaseRegistry,
    RunnerManagerEntry,
    NewRunnerManagerEntry,
} from './types';

const logger = new Logger('RunnerManagerRepository');

/** Subset of `sqlQueries.json` relevant to the Runner Manager. */
interface RunnerManagerQueries {
    findAll: string;
    findByTestCaseId: string;
    register: string;
    updateExecution: string;
    ensureColumns: string[];
}

function loadQueries(): RunnerManagerQueries {
    const defaults: RunnerManagerQueries = {
        findAll: 'SELECT `id`, `testName`, `scriptPath`, `author`, `enabled`, `registeredBy` FROM `openmrs_runner_manager`',
        findByTestCaseId: 'SELECT `id`, `testName`, `scriptPath`, `author`, `enabled`, `registeredBy` FROM `openmrs_runner_manager` WHERE `id` = ?',
        register: [
            'INSERT INTO `openmrs_runner_manager`',
            '(`id`, `testName`, `testTitle`, `testDescription`, `shouldComplete`, `expectedCount`, `tags`, `enabled`, `scriptPath`, `author`, `registeredBy`)',
            'VALUES (?, ?, ?, ?, 1, 0, ?, 1, ?, ?, ?)',
            'ON DUPLICATE KEY UPDATE `scriptPath` = VALUES(`scriptPath`), `author` = VALUES(`author`), `updatedAt` = NOW()',
        ].join(' '),
        updateExecution: 'UPDATE `openmrs_runner_manager` SET `enabled` = ?, `updatedAt` = NOW() WHERE `id` = ?',
        ensureColumns: [
            "SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'openmrs_runner_manager' AND COLUMN_NAME = 'scriptPath'",
            "ALTER TABLE `openmrs_runner_manager` ADD COLUMN `scriptPath` VARCHAR(500) DEFAULT '' AFTER `tags`",
            "ALTER TABLE `openmrs_runner_manager` ADD COLUMN `author` VARCHAR(100) DEFAULT 'unknown' AFTER `scriptPath`",
            "ALTER TABLE `openmrs_runner_manager` ADD COLUMN `registeredBy` VARCHAR(50) DEFAULT 'manual' AFTER `author`",
            "ALTER TABLE `openmrs_runner_manager` ADD COLUMN `updatedAt` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `registeredBy`",
        ],
    };

    try {
        const queriesPath = path.join(FrameworkConstants.DATA_DIR, 'sqlQueries.json');
        if (!fs.existsSync(queriesPath)) return defaults;
        const parsed = JSON.parse(fs.readFileSync(queriesPath, 'utf-8'));
        const rm = parsed?.runnerManagerQueries;
        if (!rm) return defaults;
        return {
            findAll: rm.findAll ?? defaults.findAll,
            findByTestCaseId: rm.findByTestCaseId ?? defaults.findByTestCaseId,
            register: rm.register ?? defaults.register,
            updateExecution: rm.updateExecution ?? defaults.updateExecution,
            ensureColumns: rm.ensureColumns ?? defaults.ensureColumns,
        };
    } catch {
        return defaults;
    }
}

/**
 * MySQL-backed Runner Manager registry.
 *
 * All methods are fail-safe: connection or query errors are logged but
 * never crash the test run. This keeps the Runner Manager non-blocking.
 */
export class RunnerManagerRepository implements ITestCaseRegistry {

    private readonly queries: RunnerManagerQueries;

    constructor() {
        this.queries = loadQueries();
    }

    /**
     * Ensures the extended columns (`scriptPath`, `author`, `registeredBy`,
     * `updatedAt`) exist on the `openmrs_runner_manager` table.
     * Safe to call repeatedly — skips if columns already exist.
     */
    async ensureColumns(): Promise<void> {
        try {
            const conn = await getConnection();
            if (!isMySqlPool(conn)) {
                logger.info('ensureColumns skipped — SQLite does not need migration');
                return;
            }

            const checkSql = this.queries.ensureColumns[0];
            const [rows] = await conn.execute(checkSql);
            const result = (rows as Record<string, unknown>[])[0];
            if (Number(result?.cnt ?? 0) > 0) {
                logger.debug('Runner Manager columns already exist');
                return;
            }

            for (let i = 1; i < this.queries.ensureColumns.length; i++) {
                try {
                    await conn.execute(this.queries.ensureColumns[i]);
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    if (!msg.includes('Duplicate column name')) {
                        logger.warn(`Column migration warning: ${msg}`);
                    }
                }
            }
            logger.info('Runner Manager columns added to openmrs_runner_manager');
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.warn(`ensureColumns failed: ${msg}`);
        }
    }

    async findAll(): Promise<RunnerManagerEntry[]> {
        try {
            const conn = await getConnection();
            if (!isMySqlPool(conn)) return [];
            const [rows] = await conn.execute(this.queries.findAll);
            return (rows as Record<string, unknown>[]).map(this.toEntry);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.warn(`findAll failed: ${msg}`);
            return [];
        }
    }

    async findByTestCaseId(testCaseId: string): Promise<RunnerManagerEntry | null> {
        try {
            const conn = await getConnection();
            if (!isMySqlPool(conn)) return null;
            const [rows] = await conn.execute(this.queries.findByTestCaseId, [testCaseId]);
            const arr = rows as Record<string, unknown>[];
            return arr.length > 0 ? this.toEntry(arr[0]) : null;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.warn(`findByTestCaseId(${testCaseId}) failed: ${msg}`);
            return null;
        }
    }

    async register(entry: NewRunnerManagerEntry): Promise<void> {
        try {
            const conn = await getConnection();
            if (!isMySqlPool(conn)) return;
            await conn.execute(this.queries.register, [
                entry.testCaseId,
                entry.testName,
                entry.testTitle,
                '',
                entry.tags,
                entry.scriptPath,
                entry.author,
                entry.registeredBy,
            ]);
            logger.info(`Registered test case: ${entry.testCaseId} (by ${entry.registeredBy})`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.warn(`register(${entry.testCaseId}) failed: ${msg}`);
        }
    }

    async registerBatch(entries: NewRunnerManagerEntry[]): Promise<void> {
        for (const entry of entries) {
            await this.register(entry);
        }
    }

    async updateExecution(testCaseId: string, enabled: boolean): Promise<void> {
        try {
            const conn = await getConnection();
            if (!isMySqlPool(conn)) return;
            await conn.execute(this.queries.updateExecution, [
                enabled ? 1 : 0,
                testCaseId,
            ]);
            logger.info(`Updated execution for ${testCaseId}: ${enabled}`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.warn(`updateExecution(${testCaseId}) failed: ${msg}`);
        }
    }

    private toEntry(row: Record<string, unknown>): RunnerManagerEntry {
        return {
            id: String(row.id ?? ''),
            testName: String(row.testName ?? ''),
            scriptPath: String(row.scriptPath ?? ''),
            author: String(row.author ?? 'unknown'),
            enabled: Boolean(row.enabled),
            registeredBy: (String(row.registeredBy ?? 'manual')) as RunnerManagerEntry['registeredBy'],
        };
    }
}
