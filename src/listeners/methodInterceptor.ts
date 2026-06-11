/**
 * @fileoverview Runner Manager — Method Interceptor.
 *
 * Playwright port of the TestNG `IMethodInterceptor` pattern: which tests run,
 * in what priority, with what description, and how many times is controlled by
 * **external data** (DB / Excel / CSV / JSON) — not by code.
 *
 * ### How it works
 * 1. The configured data source (`TEST_DATA_SOURCE`) is first **normalised into
 *    one canonical JSON file** — `src/data/runnerlist/RUNMANAGER.json`. JSON is
 *    the canonical intermediate format for every source; DB, Excel, and CSV are
 *    "compiled" to it before anything reads them.
 * 2. {@link intercept} is called with the list of discovered test names (the
 *    Playwright equivalent of TestNG's `intercept(methods, context)`): tests
 *    that are missing from the runner list or marked `execute: "no"` are
 *    dropped, the survivors are sorted by `priority`, and `testdescription` /
 *    `count` are injected.
 * 3. {@link getInvocation} exposes the shared invocation-count map so the
 *    data provider ({@link module:utils/DataProviderUtils}) can cap how many
 *    data rows each test consumes.
 * 4. {@link getRunnerGrep} is invoked from `playwright.config.ts` so that
 *    `execute: "no"` tests are dropped from the run for *all* spec files
 *    (classic `test()` specs included), mirroring TestNG rewriting the method
 *    list before any test runs.
 *
 * ### Canonical RUNMANAGER.json structure
 * ```json
 * {
 *   "_metadata": { "sourceType": "csv", "generatedAt": "...", "recordCount": 7 },
 *   "runmanager": {
 *     "testcaselist": [
 *       {
 *         "testcasename": "VerifyFHIR_PatientResource",
 *         "execute": "yes",
 *         "testdescription": "Sends a GET request to ...",
 *         "priority": 1,
 *         "count": 2
 *       }
 *     ]
 *   }
 * }
 * ```
 *
 * @module listeners/methodInterceptor
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { intercept, getInvocation } from '../listeners/methodInterceptor';
 *
 * const active = intercept(['loginTest', 'searchTest']);
 * // → [{ testcasename: 'searchTest', priority: 1, count: 3, ... },
 * //    { testcasename: 'loginTest',  priority: 2, count: 1, ... }]
 * const iterations = getInvocation('searchTest'); // 3
 * ```
 */
import fs from 'fs';
import path from 'path';
import {Logger} from '../utils/logger';
import {FrameworkConstants} from '../constants/frameworkConstants';
import {getDataSourceConfig, type DataSourceConfig} from '../config/dataSource.config';
import type {DataSourceType} from '../types';

const logger = new Logger('MethodInterceptor');

/**
 * A single entry from the canonical runner list (`RUNMANAGER.json`).
 *
 * @interface RunnerListEntry
 * @property {string} testcasename - Must match the test name (case-insensitive)
 * @property {string} execute - `'yes'` / `'no'` — include or drop the test
 * @property {string} [testdescription] - Injected as the test description annotation
 * @property {number} [priority] - Injected as the execution priority (ascending order)
 * @property {number} [count] - How many data iterations of this test to run
 */
export interface RunnerListEntry {
    testcasename: string;
    testdescription?: string;
    execute: string; // "yes" | "no"
    priority?: number;
    count?: number; // invocationCount from Selenium framework
    [key: string]: unknown; // allow extra metadata (id, testTitle, tags, …)
}

/**
 * A test method that survived interception, with runner-list metadata injected.
 *
 * @interface InterceptedTest
 */
export interface InterceptedTest {
    /** Canonical test case name from the runner list. */
    testcasename: string;
    /** Description to inject into the test (TestNG `description` equivalent). */
    testdescription?: string;
    /** Execution priority (lower runs first). */
    priority: number;
    /** Number of data iterations to run. */
    count: number;
    /** The full runner-list entry (including extra columns). */
    entry: RunnerListEntry;
}

/** @private Cached list of active tests. */
let activeTests: RunnerListEntry[] | null = null;
/** @private Cached full runner list. */
let fullRunnerList: RunnerListEntry[] | null = null;

/**
 * Shared invocation-count map (`testcasename` → `count`), populated when the
 * runner list is loaded / intercepted. The data provider reads it via
 * {@link getInvocation} to cap how many data rows each test consumes — the
 * Playwright equivalent of TestNG's static `invocationCounts` map shared with
 * `DataProviderUtils.getInvocation(name)`.
 */
export const invocationCounts = new Map<string, number>();

// ─── Canonical JSON generation (DB / Excel / CSV → RUNMANAGER.json) ────────

/** @private Reads CSV synchronously via papaparse. */
function readCsvRows(csvPath: string): Record<string, unknown>[] {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Papa = require('papaparse');
    const content = fs.readFileSync(csvPath, 'utf-8');
    const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
    return parsed.data as Record<string, unknown>[];
}

/** @private Reads an Excel sheet synchronously via xlsx (row 0 = headers). */
function readExcelRows(excelPath: string, sheetName: string): Record<string, unknown>[] {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx');
    const workbook = XLSX.readFile(excelPath);
    const sheet = workbook.Sheets[sheetName] ?? workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
}

/**
 * @private Reads the runner list from SQLite synchronously via better-sqlite3,
 * using the externalised query from `sqlQueries.json` (`runnerListQueries`).
 * MySQL (RUN_MODE=remote) cannot be read synchronously at config-load time —
 * callers fall back to the previously generated canonical JSON; the fresh copy
 * is regenerated in global setup after the preprocessing pipeline runs.
 */
function readSqliteRows(dbPath: string): Record<string, unknown>[] {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3');
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
        const query = loadRunnerListQuery();
        return db.prepare(query.replace(/;\s*$/, '')).all() as Record<string, unknown>[];
    } finally {
        db.close();
    }
}

/** @private Resolves the runner-list SELECT from `sqlQueries.json`. */
function loadRunnerListQuery(): string {
    const fallback = 'SELECT * FROM openmrs_runner_manager';
    try {
        const queriesPath = path.join(FrameworkConstants.DATA_DIR, 'sqlQueries.json');
        const queries = JSON.parse(fs.readFileSync(queriesPath, 'utf-8'));
        const runnerQueries = queries.runnerListQueries as Record<string, string> | undefined;
        const first = runnerQueries ? Object.values(runnerQueries)[0] : undefined;
        return first || fallback;
    } catch {
        return fallback;
    }
}

/** @private Extracts raw rows from a parsed test-data JSON file (any known shape). */
function extractJsonRows(parsed: unknown, sheetName: string): Record<string, unknown>[] {
    if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
    if (!parsed || typeof parsed !== 'object') return [];

    const obj = parsed as Record<string, unknown>;

    // Shape 1: preprocessed test data — { _metadata, [sheetName]: [...] }
    if (Array.isArray(obj[sheetName])) return obj[sheetName] as Record<string, unknown>[];

    // Shape 2: canonical runner list — { runmanager: { testcaselist: [...] } }
    const runmanager = obj['runmanager'] as Record<string, unknown> | undefined;
    if (runmanager && Array.isArray(runmanager['testcaselist'])) {
        return runmanager['testcaselist'] as Record<string, unknown>[];
    }

    // Shape 3: legacy nested — { category: { group: [...] } }
    const rows: Record<string, unknown>[] = [];
    for (const [key, category] of Object.entries(obj)) {
        if (key === '_metadata' || !category || typeof category !== 'object') continue;
        for (const group of Object.values(category as Record<string, unknown>)) {
            if (Array.isArray(group)) rows.push(...(group as Record<string, unknown>[]));
        }
    }
    return rows;
}

/** @private Coerces a value to a positive integer, or returns undefined. */
function toPositiveInt(value: unknown): number | undefined {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? Math.floor(num) : undefined;
}

/** @private Returns the first non-empty string value among the given keys. */
function firstString(row: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
        const value = row[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            return String(value).trim();
        }
    }
    return undefined;
}

/**
 * @private Normalises a raw source row (any column naming) into a canonical
 * runner-list entry. Maps the framework's data shape onto the runner contract:
 * `testName` → `testcasename`, `enabled` → `execute`, `testDescription` →
 * `testdescription`; `priority` defaults to row order and `count` to 1 when
 * the source has no such columns.
 */
function toCanonicalEntry(row: Record<string, unknown>, index: number): RunnerListEntry | null {
    const name = firstString(row, ['testcasename', 'testName', 'testname']);
    if (!name) return null;

    let execute: string;
    const rawExecute = firstString(row, ['execute']);
    if (rawExecute !== undefined) {
        execute = rawExecute.toLowerCase() === 'yes' ? 'yes' : 'no';
    } else if (row['enabled'] !== undefined) {
        const enabled = String(row['enabled']).toLowerCase();
        execute = enabled === '1' || enabled === 'true' || enabled === 'yes' ? 'yes' : 'no';
    } else {
        execute = 'yes';
    }

    return {
        ...row,
        testcasename: name,
        execute,
        testdescription: firstString(row, ['testdescription', 'testDescription', 'testTitle', 'testtitle']),
        priority: toPositiveInt(row['priority']) ?? index + 1,
        count: toPositiveInt(row['count'] ?? row['invocationCount']) ?? 1,
    };
}

/** @private Reads raw rows from the configured source, synchronously. */
function readSourceRows(config: DataSourceConfig): Record<string, unknown>[] {
    switch (config.type) {
        case 'csv':
            return readCsvRows(config.csvPath);
        case 'excel':
            return readExcelRows(config.excelPath, config.sheetName);
        case 'db': {
            const runMode = (process.env.RUN_MODE || 'local').trim().toLowerCase();
            if (runMode !== 'local' || config.dbType !== 'sqlite') {
                // Remote DB (MySQL) cannot be read synchronously — signal fallback.
                throw new Error('remote-db-requires-async-generation');
            }
            return readSqliteRows(config.dbPath);
        }
        case 'json':
        default:
            return extractJsonRows(
                JSON.parse(fs.readFileSync(config.jsonPath, 'utf-8')),
                config.sheetName,
            );
    }
}

/**
 * Normalises the configured data source into the canonical runner-list JSON
 * file (`RUNMANAGER.json`) and returns its entries.
 *
 * This is the "key trick" of the runner manager: DB, Excel, and CSV are never
 * consumed directly — they are first compiled into one canonical JSON file,
 * and every consumer (interceptor + data provider) reads that JSON.
 *
 * Only the main runner process regenerates the file; worker processes (which
 * re-evaluate the config and spec files) read the file written by the main
 * process so all of them see an identical, stable runner list.
 *
 * @param {object} [options] - Generation options
 * @param {DataSourceType} [options.sourceOverride] - Force a specific source
 *   (used by global setup to re-normalise from the freshly preprocessed JSON)
 * @param {boolean} [options.force] - Regenerate even inside a worker process
 * @returns {RunnerListEntry[]} The canonical runner-list entries
 */
export function generateRunnerListJson(options?: {
    sourceOverride?: DataSourceType;
    force?: boolean;
}): RunnerListEntry[] {
    const canonicalPath = FrameworkConstants.RUNMANAGER_JSON;
    const isWorker = process.env.TEST_WORKER_INDEX !== undefined;

    // Workers consume the canonical file written by the main process.
    if (isWorker && !options?.force && fs.existsSync(canonicalPath)) {
        return readCanonicalFile(canonicalPath);
    }

    const baseConfig = getDataSourceConfig();
    const config: DataSourceConfig = options?.sourceOverride
        ? { ...baseConfig, type: options.sourceOverride }
        : baseConfig;

    let rows: Record<string, unknown>[];
    try {
        rows = readSourceRows(config);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg !== 'remote-db-requires-async-generation') {
            logger.warn(`Could not read runner list from ${config.type} source: ${msg}`);
        }
        // Fall back to the previously generated canonical file (refreshed in
        // global setup after the preprocessing pipeline runs).
        if (fs.existsSync(canonicalPath)) {
            logger.info('Falling back to previously generated RUNMANAGER.json');
            return readCanonicalFile(canonicalPath);
        }
        logger.warn('No canonical runner list available — all tests will be active');
        return [];
    }

    const entries = rows
        .map((row, index) => toCanonicalEntry(row, index))
        .filter((entry): entry is RunnerListEntry => entry !== null);

    const output = {
        _metadata: {
            sourceType: config.type,
            generatedAt: new Date().toISOString(),
            recordCount: entries.length,
            generatedBy: 'MethodInterceptor',
        },
        runmanager: {
            testcaselist: entries,
        },
    };

    const dir = path.dirname(canonicalPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(canonicalPath, JSON.stringify(output, null, 2), 'utf-8');
    logger.info(
        `Generated canonical runner list (${entries.length} entries) from ${config.type} → ${canonicalPath}`,
    );
    return entries;
}

/** @private Reads and normalises entries from an existing canonical file. */
function readCanonicalFile(canonicalPath: string): RunnerListEntry[] {
    try {
        const parsed = JSON.parse(fs.readFileSync(canonicalPath, 'utf-8'));
        const rows = extractJsonRows(parsed, 'testcaselist');
        return rows
            .map((row, index) => toCanonicalEntry(row, index))
            .filter((entry): entry is RunnerListEntry => entry !== null);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to parse canonical runner list: ${msg}`);
        return [];
    }
}

/**
 * Regenerates the canonical runner list from the freshly preprocessed JSON
 * test data. Called from global setup *after* {@link DataPreprocessor} has
 * dumped the original source (including remote MySQL) into the unified JSON —
 * test collection happens after global setup, so `runnerSuite()` and the data
 * provider always intercept against fresh data.
 *
 * @returns {RunnerListEntry[]} The refreshed canonical entries
 */
export function refreshRunnerListFromJson(): RunnerListEntry[] {
    resetRunnerListCache();
    const entries = generateRunnerListJson({ sourceOverride: 'json', force: true });
    fullRunnerList = entries;
    return entries;
}

// ─── Runner-list loading & interception ────────────────────────────────────

/**
 * Loads the canonical runner list (generating it from the configured source
 * if needed), caching the result.
 * @returns {RunnerListEntry[]} All entries from the runner list (may be empty)
 * @private
 */
function loadRunnerList(): RunnerListEntry[] {
    if (fullRunnerList !== null) return fullRunnerList;

    fullRunnerList = generateRunnerListJson();
    logger.info(`Loaded ${fullRunnerList.length} test entries from runner list`);
    return fullRunnerList;
}

/**
 * Returns all test entries with `execute: "yes"` from the runner list and
 * populates the shared invocation-count map.
 *
 * Results are cached after the first call. If no runner list exists, returns an empty array.
 *
 * @returns {RunnerListEntry[]} Active test entries
 */
export function getActiveTests(): RunnerListEntry[] {
    if (activeTests !== null) return activeTests;

    const all = loadRunnerList();
    activeTests = all.filter((entry) => entry.execute?.toLowerCase() === 'yes');

    for (const entry of activeTests) {
        invocationCounts.set(entry.testcasename.toLowerCase(), entry.count ?? 1);
    }

    logger.info(
        `Active tests: ${activeTests.length}/${all.length} — [${activeTests.map((t) => t.testcasename).join(', ')}]`,
    );
    return activeTests;
}

/**
 * The Playwright equivalent of TestNG's `IMethodInterceptor.intercept(methods, context)`.
 *
 * Takes the list of discovered test names and rewrites it according to the
 * runner list:
 * - tests missing from the list or marked `execute: "no"` are **dropped**;
 * - survivors are **sorted by `priority`** (ascending);
 * - `testdescription` and `count` are injected from the runner record;
 * - the shared invocation-count map is populated for the data provider.
 *
 * If the runner list is empty (no file / no entries), all discovered tests
 * pass through unchanged with default priority/count — no filtering.
 *
 * @param {string[]} testNames - Discovered test names (matched case-insensitively)
 * @returns {InterceptedTest[]} The rewritten, priority-ordered test list
 */
export function intercept(testNames: string[]): InterceptedTest[] {
    const active = getActiveTests();

    // No runner list → pass-through (mirrors "no runner list, run everything").
    if (loadRunnerList().length === 0) {
        return testNames.map((name, index) => ({
            testcasename: name,
            priority: index + 1,
            count: 1,
            entry: { testcasename: name, execute: 'yes', priority: index + 1, count: 1 },
        }));
    }

    const result: InterceptedTest[] = [];
    for (const name of testNames) {
        const entry = active.find(
            (t) => t.testcasename.toLowerCase() === name.toLowerCase(),
        );
        if (!entry) continue; // non-matching / execute=no → dropped from the run

        const count = entry.count ?? 1;
        invocationCounts.set(entry.testcasename.toLowerCase(), count);
        result.push({
            testcasename: entry.testcasename,
            testdescription: entry.testdescription,
            priority: entry.priority ?? Number.MAX_SAFE_INTEGER,
            count,
            entry,
        });
    }

    result.sort((a, b) => a.priority - b.priority);
    logger.info(
        `Intercepted ${testNames.length} methods → ${result.length} active: ` +
        `[${result.map((t) => `${t.testcasename}(p=${t.priority},n=${t.count})`).join(', ')}]`,
    );
    return result;
}

/**
 * Returns the configured invocation (iteration) count for a test — how many
 * data rows the test may consume. Shared with the data provider, mirroring
 * `MethodInterceptor.getInvocation(name)` in the Selenium framework.
 *
 * @param {string} testName - Test case name (case-insensitive)
 * @returns {number} Configured count, or `1` when the test is not listed
 */
export function getInvocation(testName: string): number {
    getActiveTests(); // ensure the map is populated
    return invocationCounts.get(testName.toLowerCase()) ?? 1;
}

/**
 * Checks whether a test is active (should execute) based on the runner list.
 *
 * Returns `true` if the runner list is empty (no filtering), or if the test
 * is found with `execute: "yes"`.
 *
 * @param {string} testName - Test case name (case-insensitive)
 * @returns {boolean} `true` if the test should run
 */
export function isTestActive(testName: string): boolean {
    const active = getActiveTests();
    if (loadRunnerList().length === 0) return true; // no runner list → run everything
    return active.some((t) => t.testcasename.toLowerCase() === testName.toLowerCase());
}

/**
 * Returns the runner list configuration entry for a specific test.
 *
 * @param {string} testName - Test case name (case-insensitive)
 * @returns {RunnerListEntry | undefined} The matching entry, or `undefined`
 */
export function getTestConfig(testName: string): RunnerListEntry | undefined {
    return getActiveTests().find((t) => t.testcasename.toLowerCase() === testName.toLowerCase());
}

/**
 * Generates a pipe-separated grep pattern of all active test names.
 *
 * Can be used with Playwright's `--grep` CLI option to filter test execution.
 *
 * @returns {string} Grep pattern (e.g., `'loginTest|searchTest|checkoutTest'`), or empty string
 */
export function getGrepPattern(): string {
    const active = getActiveTests();
    if (active.length === 0) return '';
    return active.map((t) => t.testcasename).join('|');
}

/** @private Escapes regex metacharacters in a literal string. */
function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds the `grep` RegExp applied in `playwright.config.ts` so that the
 * runner list controls which tests run for **every** spec file — the
 * config-level half of the method interceptor.
 *
 * The pattern matches either the canonical `testcasename` (used as the title
 * by {@link module:listeners/runnerTest~runnerSuite}-registered tests) or the
 * human-readable `testTitle` (used by classic `test()` specs), so both styles
 * are governed by the same runner list.
 *
 * Returns `undefined` (no filtering) when:
 * - `RUNNER_FILTER=false` is set, or
 * - the runner list is empty / could not be generated.
 *
 * @returns {RegExp | undefined} Grep pattern for active tests
 */
export function getRunnerGrep(): RegExp | undefined {
    if ((process.env.RUNNER_FILTER ?? 'true').trim().toLowerCase() === 'false') {
        logger.info('Runner-list filtering disabled via RUNNER_FILTER=false');
        return undefined;
    }

    const active = getActiveTests();
    if (active.length === 0) return undefined;

    const patterns = new Set<string>();
    for (const entry of active) {
        patterns.add(escapeRegex(entry.testcasename));
        const title = firstString(entry, ['testTitle', 'testtitle']);
        if (title) patterns.add(escapeRegex(title));
    }
    return new RegExp([...patterns].join('|'));
}

/**
 * Clears the cached runner list and invocation counts, forcing a reload on
 * the next call.
 */
export function resetRunnerListCache(): void {
    activeTests = null;
    fullRunnerList = null;
    invocationCounts.clear();
}
