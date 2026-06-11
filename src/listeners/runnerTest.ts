/**
 * @fileoverview Runner-managed test registration — the Playwright equivalent
 * of TestNG rewriting the `@Test` method list via `IMethodInterceptor` and
 * wiring the data provider via `IAnnotationTransformer`.
 *
 * Test authors declare *what* a test does; the runner list (DB / Excel / CSV /
 * JSON, normalised to `RUNMANAGER.json`) decides *whether* it runs, in what
 * **priority**, with what **description**, and **how many times**:
 *
 * - tests missing from the runner list or marked `execute: "no"` are simply
 *   **not registered** (dropped from the run);
 * - survivors are registered in ascending `priority` order;
 * - `testdescription` is injected as the test's description annotation;
 * - each test is registered `count` times, each iteration receiving one data
 *   row through the `runnerData` fixture — authors never wire a data provider
 *   themselves, they just declare the fixture (the `Map<String,Object>`
 *   parameter contract).
 *
 * @module listeners/runnerTest
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { runnerSuite } from '../../../src/listeners/runnerTest';
 *
 * runnerSuite('OpenMRS FHIR R4 — Resources', [
 *     {
 *         name: 'VerifyFHIR_PatientResource',
 *         body: async ({ authenticatedApi, runnerData }, testInfo) => {
 *             // runs only if the runner list says execute=yes, `count` times,
 *             // with `runnerData` = one runner/data row per iteration
 *         },
 *     },
 * ]);
 * ```
 */
import type {PlaywrightTestArgs, PlaywrightTestOptions, TestInfo} from '@playwright/test';
import {test, type CustomFixtures} from '../fixtures/base.fixture';
import {intercept, type InterceptedTest} from './methodInterceptor';
import {getDataProvider} from '../utils/DataProviderUtils';
import {withAnnotation} from '../annotations';
import {readExecutionStatus} from '../utils/suiteExecutionGuard';
import {Logger} from '../utils/logger';
import type {CategoryType} from '../enums/categoryType';

const logger = new Logger('RunnerSuite');

/** Fixtures available to a runner-managed test body (base + custom, incl. `runnerData`). */
export type RunnerTestArgs = PlaywrightTestArgs & PlaywrightTestOptions & CustomFixtures;

/**
 * Body of a runner-managed test — a standard Playwright test function. The
 * data row for the current iteration is available via the `runnerData`
 * fixture (a single flat map, regardless of source).
 */
export type RunnerTestBody = (
    args: RunnerTestArgs,
    testInfo: TestInfo,
) => Promise<void> | void;

/**
 * Declaration of a single runner-managed test.
 *
 * @interface RunnerTestDefinition
 * @property {string} name - Must match the runner list `testcasename` (case-insensitive)
 * @property {object} [annotation] - Optional authors/categories for reporting
 * @property {RunnerTestBody} body - The test implementation
 */
export interface RunnerTestDefinition {
    name: string;
    annotation?: {
        authors?: string[];
        categories?: CategoryType[];
    };
    body: RunnerTestBody;
}

/**
 * Options for {@link runnerSuite}.
 *
 * @interface RunnerSuiteOptions
 * @property {boolean} [serial] - Run the suite serially so the runner-list
 *   `priority` order is strictly honoured at execution time (otherwise
 *   priority governs registration order, which parallel workers may interleave)
 */
export interface RunnerSuiteOptions {
    serial?: boolean;
}

/**
 * Registers a describe block whose tests are controlled by the runner list.
 *
 * Calls {@link intercept} with the declared test names (mirroring TestNG's
 * `intercept(methods, context)`), then registers only the surviving entries —
 * sorted by priority, repeated `count` times, each iteration fed one data row
 * from {@link getDataProvider} via the `runnerData` fixture.
 *
 * @param {string} suiteTitle - Title for the describe block
 * @param {RunnerTestDefinition[]} definitions - Declared tests (candidates)
 * @param {RunnerSuiteOptions} [options] - Suite options
 */
export function runnerSuite(
    suiteTitle: string,
    definitions: RunnerTestDefinition[],
    options?: RunnerSuiteOptions,
): void {
    const intercepted = intercept(definitions.map((d) => d.name));

    if (intercepted.length === 0) {
        logger.warn(
            `Runner list dropped every test in suite "${suiteTitle}" — nothing registered ` +
            `(declared: [${definitions.map((d) => d.name).join(', ')}])`,
        );
        return;
    }

    test.describe(suiteTitle, () => {
        if (options?.serial) {
            test.describe.configure({ mode: 'serial' });
        }

        for (const entry of intercepted) {
            const definition = definitions.find(
                (d) => d.name.toLowerCase() === entry.testcasename.toLowerCase(),
            );
            if (!definition) continue;

            const rows = getDataProvider(entry.testcasename);
            rows.forEach((row, index) => {
                registerIteration(definition, entry, row, index, rows.length);
            });
        }
    });
}

/**
 * Registers one data iteration of a runner-managed test inside an anonymous
 * describe scope, so each iteration gets its own `runnerData` fixture value.
 * @private
 */
function registerIteration(
    definition: RunnerTestDefinition,
    entry: InterceptedTest,
    row: Record<string, unknown>,
    index: number,
    total: number,
): void {
    const iterationSuffix = total > 1 ? ` [${index + 1}/${total}]` : '';

    test.describe(() => {
        test.use({ runnerData: row });

        test.beforeEach(async ({ }, testInfo) => {
            test.skip(
                !readExecutionStatus(),
                `Suite execution disabled for service "${process.env.SERVICE_NAME ?? ''}" in master_db`,
            );

            // Inject runner-list metadata (TestNG description/priority equivalent)
            withAnnotation(testInfo, {
                authors: definition.annotation?.authors ?? [],
                categories: definition.annotation?.categories ?? [],
                description: entry.testdescription,
            });
            testInfo.annotations.push(
                { type: 'priority', description: String(entry.priority) },
                { type: 'iteration', description: `${index + 1}/${total}` },
            );
        });

        test(
            `${entry.testcasename}${iterationSuffix}`,
            { tag: `@${entry.testcasename}` },
            definition.body,
        );
    });
}
