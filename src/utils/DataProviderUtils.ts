/**
 * @fileoverview Data provider routing for runner-managed, data-driven tests.
 *
 * Playwright port of the Selenium framework's `DataProviderUtils.getDataProvider(Method)`.
 * All sources share the same contract because everything is read from the
 * canonical `RUNMANAGER.json` produced by the method interceptor:
 *
 * 1. Filter rows where `testcasename == testName` (rows are tagged with the
 *    test they belong to, case-insensitive).
 * 2. Filter rows where `execute == "yes"`.
 * 3. Trim the row count to the runner-list `count`:
 *    `numEntries = min(filteredRows, MethodInterceptor.getInvocation(testName))`.
 *    When the runner list asks for more iterations than there are data rows
 *    (common here, where the runner record doubles as the data row), rows are
 *    cycled so the test still runs `count` times.
 * 4. Return an array where each element is a single `Record<string, unknown>`
 *    map — every test body has the same one-map signature regardless of how
 *    many columns the data has.
 *
 * @module utils/DataProviderUtils
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { getDataProvider } from '../utils/DataProviderUtils';
 *
 * const rows = getDataProvider('VerifyFHIR_PatientResource');
 * // → [{ id: 'API-001', testcasename: 'VerifyFHIR_PatientResource', ... }, ...]
 * // rows.length === runner-list count for this test
 * ```
 */
import {getActiveTests, getInvocation} from '../listeners/methodInterceptor';
import {Logger} from './logger';

const logger = new Logger('DataProviderUtils');

/**
 * Returns the data rows for a test, capped by the runner-list invocation count.
 *
 * One test runs N times with N data rows, where N comes from the runner
 * manager — the data iteration count is externally configurable without
 * touching code.
 *
 * @param {string} testName - Test case name (matched against `testcasename`, case-insensitive)
 * @returns {Record<string, unknown>[]} One map per iteration (never empty — a
 *   single empty map is returned when no data rows match, so unlisted tests
 *   in pass-through mode still run once)
 */
export function getDataProvider(testName: string): Record<string, unknown>[] {
    const count = getInvocation(testName);
    const rows = getActiveTests().filter(
        (entry) => entry.testcasename.toLowerCase() === testName.toLowerCase(),
    );

    if (rows.length === 0) {
        logger.debug(`No data rows tagged for "${testName}" — running once with empty data`);
        return [{}];
    }

    const iterations: Record<string, unknown>[] = [];
    for (let i = 0; i < count; i++) {
        iterations.push(rows[i % rows.length]);
    }

    logger.info(
        `Data provider for "${testName}": ${rows.length} row(s), count=${count} → ${iterations.length} iteration(s)`,
    );
    return iterations;
}

export { getInvocation };
