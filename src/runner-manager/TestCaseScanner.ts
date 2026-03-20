/**
 * @fileoverview Filesystem scanner that discovers test cases from `.spec.ts` files.
 *
 * Extracts `testCaseId`, test name, and describe-block name using lightweight
 * regex patterns — no AST parser required. The scanner matches the framework's
 * convention of `test.use({ testCaseId: 'XX-NNN' })` paired with `test('...')`.
 *
 * @module runner-manager/TestCaseScanner
 * @author Vicky
 * @since 1.0.0
 */
import fs from 'fs';
import path from 'path';
import { Logger } from '../utils/logger';
import { FrameworkConstants } from '../constants/frameworkConstants';
import type { ITestCaseScanner, ScannedTestCase } from './types';

const logger = new Logger('TestCaseScanner');

const TEST_CASE_ID_RE = /test\.use\(\{\s*testCaseId:\s*['"]([^'"]+)['"]/g;
const TEST_NAME_RE = /test\(\s*['"]([^'"]+)['"]/g;
const DESCRIBE_RE = /test\.describe\(\s*['"]([^'"]+)['"]/g;

/**
 * Recursively collects all `.spec.ts` files under a directory.
 */
function collectSpecFiles(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...collectSpecFiles(full));
        } else if (entry.isFile() && entry.name.endsWith('.spec.ts')) {
            results.push(full);
        }
    }
    return results;
}

/**
 * Scans `.spec.ts` files to extract test-case metadata.
 *
 * For each file, it pairs every `test.use({ testCaseId })` with the nearest
 * `test('...')` call that follows it within the same describe block.
 */
export class TestCaseScanner implements ITestCaseScanner {

    private readonly testDir: string;

    constructor(testDir?: string) {
        this.testDir = testDir ?? FrameworkConstants.TEST_DIR;
    }

    async scanAll(): Promise<ScannedTestCase[]> {
        const files = collectSpecFiles(this.testDir);
        logger.info(`Scanning ${files.length} spec files in ${this.testDir}`);

        const results: ScannedTestCase[] = [];
        for (const file of files) {
            const found = await this.scanFile(file);
            results.push(...found);
        }

        logger.info(`Discovered ${results.length} test cases across ${files.length} files`);
        return results;
    }

    async scanFile(filePath: string): Promise<ScannedTestCase[]> {
        const content = fs.readFileSync(filePath, 'utf-8');
        const relativePath = path.relative(FrameworkConstants.PROJECT_ROOT, filePath).replace(/\\/g, '/');

        const testCaseIds = this.extractAll(TEST_CASE_ID_RE, content);
        const testNames = this.extractAll(TEST_NAME_RE, content);
        const describes = this.extractAll(DESCRIBE_RE, content);

        const cases: ScannedTestCase[] = [];

        for (let i = 0; i < testCaseIds.length; i++) {
            cases.push({
                testCaseId: testCaseIds[i],
                testName: testNames[i] ?? testCaseIds[i],
                scriptPath: relativePath,
                describeName: describes[i] ?? describes[0] ?? relativePath,
            });
        }

        if (cases.length > 0) {
            logger.debug(`${relativePath}: found ${cases.length} test case(s)`);
        }

        return cases;
    }

    private extractAll(regex: RegExp, content: string): string[] {
        const results: string[] = [];
        let match: RegExpExecArray | null;
        const re = new RegExp(regex.source, regex.flags);
        while ((match = re.exec(content)) !== null) {
            results.push(match[1]);
        }
        return results;
    }
}
