/**
 * @fileoverview Guards suite execution based on a cloud database master table flag.
 *
 * During global setup, {@link isSuiteExecutionEnabled} queries
 * `master_db` in the configured MySQL database. If the `Execution`
 * column for the current `SERVICE_NAME` is not `'Yes'`, every test in
 * the suite is skipped via the `SUITE_EXECUTION_ENABLED` env var.
 *
 * The check is fail-open: if the database is unreachable, the service is
 * not found, or `SERVICE_NAME` is not configured, the suite executes normally.
 *
 * @module utils/suiteExecutionGuard
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { isSuiteExecutionEnabled } from '../utils/suiteExecutionGuard';
 *
 * const enabled = await isSuiteExecutionEnabled();
 * process.env.SUITE_EXECUTION_ENABLED = enabled ? 'true' : 'false';
 * ```
 */
import fs from 'fs';
import path from 'path';
import { Logger } from './logger';
import { FrameworkConstants } from '../constants/frameworkConstants';
import { ConfigProperties, getConfigValue } from '../enums/configProperties';

const logger = new Logger('SuiteExecutionGuard');

/**
 * File written by global-setup and read by worker beforeEach hooks.
 * A file-based flag is used because `process.env` changes in the
 * globalSetup coordinator process are not reliably propagated to
 * Playwright worker processes.
 */
const STATUS_FILE = path.join(FrameworkConstants.PROJECT_ROOT, '.suite-execution-status');

/**
 * Persists the suite execution flag to disk so worker processes can read it.
 * Called from `global-setup.ts` after querying the master table.
 */
export function writeExecutionStatus(enabled: boolean): void {
    const dir = path.dirname(STATUS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATUS_FILE, enabled ? 'true' : 'false', 'utf-8');
    logger.info(`Wrote suite execution status to ${STATUS_FILE}: ${enabled}`);
}

/**
 * Reads the suite execution flag written by global-setup.
 * Returns `true` (execute) if the file is missing or unreadable.
 */
export function readExecutionStatus(): boolean {
    try {
        if (!fs.existsSync(STATUS_FILE)) return true;
        const content = fs.readFileSync(STATUS_FILE, 'utf-8').trim();
        return content !== 'false';
    } catch {
        return true;
    }
}

/**
 * Removes the status file. Called from `global-teardown.ts`.
 */
export function cleanupExecutionStatus(): void {
    try {
        if (fs.existsSync(STATUS_FILE)) {
            fs.unlinkSync(STATUS_FILE);
            logger.debug('Cleaned up suite execution status file');
        }
    } catch {
        /* ignore */
    }
}

/** Minimal contract for the subset of mysql2's Pool API we use. */
interface MysqlPool {
    execute(sql: string, values?: unknown[]): Promise<[unknown[], unknown]>;
    end(): Promise<void>;
}

/**
 * Loads MySQL connection credentials from `DatabaseConfig.json`.
 *
 * @returns Parsed connection parameters
 * @throws {Error} If the config file is missing
 */
function loadDbCredentials(): {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
} {
    const configPath = path.join(FrameworkConstants.DATA_DIR, 'DatabaseConfig.json');
    if (!fs.existsSync(configPath)) {
        throw new Error(`Database config not found: ${configPath}`);
    }
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return {
        host: raw.DB_HOST || 'localhost',
        port: Number(raw.DB_PORT) || 3306,
        user: raw.DB_USER || '',
        password: raw.DB_PASSWORD || '',
        database: raw.DB_NAME || '',
    };
}

/**
 * Reads the master-table query from `sqlQueries.json`.
 * Falls back to a hard-coded default when the file or key is missing.
 *
 * To adjust column / table names, edit the `masterTableQueries.checkExecution`
 * entry in `src/data/sqlQueries.json`.
 */
function loadMasterQuery(): string {
    const DEFAULT_QUERY =
        'SELECT `Execution` FROM `master_db` WHERE `Servcie Name` = ?';
    try {
        const queriesPath = path.join(FrameworkConstants.DATA_DIR, 'sqlQueries.json');
        if (!fs.existsSync(queriesPath)) return DEFAULT_QUERY;
        const parsed = JSON.parse(fs.readFileSync(queriesPath, 'utf-8'));
        return parsed?.masterTableQueries?.checkExecution ?? DEFAULT_QUERY;
    } catch {
        return DEFAULT_QUERY;
    }
}

/**
 * Queries the cloud database master table to determine whether the test
 * suite should execute for the current service.
 *
 * Resolution logic:
 * 1. Reads `SERVICE_NAME` from the environment.
 * 2. Connects to MySQL using `DatabaseConfig.json` credentials.
 * 3. Queries `master_db` for the matching service row.
 * 4. Returns `true` when `Execution` is `'Yes'` / `'true'` / `'1'`.
 *
 * Fails open — returns `true` (execute) when the database is
 * unreachable, the service row is missing, or `SERVICE_NAME` is blank.
 *
 * @returns `true` to execute the suite, `false` to skip all tests
 */
export async function isSuiteExecutionEnabled(): Promise<boolean> {
    const serviceName = getConfigValue(ConfigProperties.SERVICE_NAME, '');

    if (!serviceName) {
        logger.warn('SERVICE_NAME not configured — defaulting to execute suite');
        return true;
    }

    let pool: MysqlPool | null = null;

    try {
        const mysql = await import('mysql2/promise');
        const creds = loadDbCredentials();

        pool = mysql.createPool({
            host: creds.host,
            port: creds.port,
            user: creds.user,
            password: creds.password,
            database: creds.database,
            waitForConnections: true,
            connectionLimit: 1,
            connectTimeout: 10_000,
        }) as unknown as MysqlPool;

        const query = loadMasterQuery();
        logger.info(`Checking suite execution — service="${serviceName}", query="${query}"`);

        const [rows] = await pool.execute(query, [serviceName]);
        const resultRows = rows as Record<string, unknown>[];

        if (resultRows.length === 0) {
            logger.warn(
                `Service "${serviceName}" not found in master_db — defaulting to execute suite`,
            );
            return true;
        }

        const rawFlag = String(resultRows[0]['Execution'] ?? '').trim();
        const enabled = ['yes', 'true', '1'].includes(rawFlag.toLowerCase());

        logger.info(
            `Suite execution for "${serviceName}": ${enabled ? 'ENABLED' : 'DISABLED'} ` +
            `(Execution="${rawFlag}")`,
        );
        return enabled;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Master table execution check failed: ${msg} — defaulting to execute suite`);
        return true;
    } finally {
        if (pool) {
            try {
                await pool.end();
            } catch {
                /* ignore close errors */
            }
        }
    }
}
