/**
 * @fileoverview Interfaces and types for the Runner Manager subsystem.
 *
 * Defines contracts for test-case scanning, DB registry operations,
 * and the sync orchestrator. All components depend on these abstractions
 * rather than concrete implementations (Dependency Inversion).
 *
 * @module runner-manager/types
 * @author Vicky
 * @since 1.0.0
 */

/** Provenance of how a test case was registered in the Runner Manager. */
export type RegistrationSource = 'mcp' | 'git-hook' | 'execution-sync' | 'manual';

/**
 * A test case discovered by scanning `.spec.ts` files on the filesystem.
 * Contains only what can be extracted from source code — no DB fields.
 */
export interface ScannedTestCase {
    testCaseId: string;
    testName: string;
    /** Relative path from project root (e.g. `tests/openmrs/api/openmr-fhir.spec.ts`). */
    scriptPath: string;
    describeName: string;
}

/**
 * A row in the `openmrs_runner_manager` DB table (extended columns only).
 * The original data columns (`shouldComplete`, `expectedCount`, etc.) are
 * managed elsewhere; this focuses on the Runner Manager metadata.
 */
export interface RunnerManagerEntry {
    id: string;
    testName: string;
    scriptPath: string;
    author: string;
    enabled: boolean;
    registeredBy: RegistrationSource;
}

/** Payload for inserting a new entry (no auto-generated `id`). */
export type NewRunnerManagerEntry = Omit<RunnerManagerEntry, 'id'> & {
    testCaseId: string;
    testTitle: string;
    tags: string;
};

/** Result returned by the sync orchestrator after comparing scanner output with the DB. */
export interface SyncResult {
    scanned: number;
    existing: number;
    inserted: number;
    entries: ScannedTestCase[];
}

// ─── Contracts (Interface Segregation) ──────────────────────────────

/** Reads `.spec.ts` files and extracts test-case metadata. */
export interface ITestCaseScanner {
    /** Scans all spec files under the configured test directory. */
    scanAll(): Promise<ScannedTestCase[]>;
    /** Scans a single spec file. */
    scanFile(filePath: string): Promise<ScannedTestCase[]>;
}

/** CRUD operations on the `openmrs_runner_manager` table. */
export interface ITestCaseRegistry {
    findAll(): Promise<RunnerManagerEntry[]>;
    findByTestCaseId(testCaseId: string): Promise<RunnerManagerEntry | null>;
    register(entry: NewRunnerManagerEntry): Promise<void>;
    registerBatch(entries: NewRunnerManagerEntry[]): Promise<void>;
    updateExecution(testCaseId: string, enabled: boolean): Promise<void>;
    ensureColumns(): Promise<void>;
}

/** Orchestrates scan + compare + insert for missing test cases. */
export interface IRunnerManagerSync {
    syncAll(author?: string, source?: RegistrationSource): Promise<SyncResult>;
}
