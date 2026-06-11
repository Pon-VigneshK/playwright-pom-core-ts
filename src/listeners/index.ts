/**
 * @fileoverview Barrel export for the **listeners** module.
 *
 * Re-exports lifecycle hooks and method interception utilities so consumers
 * can import everything from a single entry-point:
 *
 * ```typescript
 * import {
 *   onTestStart, onTestEnd, getSuiteStats,
 *   isTestActive, getGrepPattern,
 * } from '@listeners';
 * ```
 *
 * @module listeners
 * @author Vicky
 * @since 1.0.0
 */

/** Test lifecycle hooks and suite statistics */
export {
    onTestStart,
    onTestEnd,
    resetSuiteCounters,
    getSuiteStats,
    formatDuration,
} from './testLifecycleManager';

/** Runner-list interception, filtering, and grep-pattern generation */
export {
    getActiveTests,
    isTestActive,
    getTestConfig,
    getGrepPattern,
    getRunnerGrep,
    intercept,
    getInvocation,
    invocationCounts,
    generateRunnerListJson,
    refreshRunnerListFromJson,
    resetRunnerListCache,
} from './methodInterceptor';
export type { RunnerListEntry, InterceptedTest } from './methodInterceptor';

/** Runner-managed test registration (the Playwright "MethodInterceptor") */
export { runnerSuite } from './runnerTest';
export type {
    RunnerTestDefinition,
    RunnerTestBody,
    RunnerTestArgs,
    RunnerSuiteOptions,
} from './runnerTest';