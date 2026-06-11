/**
 * OpenMRS FHIR R4 API tests — registered through the Runner Manager.
 *
 * No test below decides for itself whether it runs: the runner list
 * (DB / Excel / CSV / JSON → canonical RUNMANAGER.json) controls execution
 * (`execute`), ordering (`priority`), reporting (`testdescription`), and the
 * number of data iterations (`count`). Each iteration receives its data row
 * as a single flat map through the `runnerData` fixture.
 */
import { expect } from '@playwright/test';
import { runnerSuite } from '../../../src/listeners/runnerTest';
import { CategoryType } from '../../../src/enums/categoryType';
import { executeWithAuthRetry } from '../../../src/auth/requestBuilder';
import { verifyJsonKeyValues } from '@utils/apiResponseUtils';

runnerSuite('OpenMRS FHIR R4 — Resource Validation', [
    {
        name: 'VerifyFHIR_PatientResource',
        annotation: { authors: ['Vicky'], categories: [CategoryType.REGRESSION, CategoryType.API] },
        body: async ({ authenticatedApi }, testInfo) => {
            const response = await executeWithAuthRetry(authenticatedApi, 'GET', `./Patient`, {}, testInfo);
            expect(await verifyJsonKeyValues(response, { resourceType: 'Patient' })).toBeTruthy();
        },
    },
    {
        name: 'VerifyFHIR_TaskResource',
        annotation: { authors: ['Vicky'], categories: [CategoryType.REGRESSION, CategoryType.API] },
        body: async ({ authenticatedApi }, testInfo) => {
            const response = await executeWithAuthRetry(authenticatedApi, 'GET', `./Task`, {}, testInfo);
            expect(await verifyJsonKeyValues(response, { resourceType: 'Task' })).toBeTruthy();
        },
    },
    {
        name: 'VerifyFHIR_AllergyIntoleranceResource',
        annotation: { authors: ['Vicky'], categories: [CategoryType.REGRESSION, CategoryType.API] },
        body: async ({ authenticatedApi }, testInfo) => {
            const response = await executeWithAuthRetry(authenticatedApi, 'GET', `./AllergyIntolerance`, {}, testInfo);
            expect(response.status()).toBe(200);
            expect(await verifyJsonKeyValues(response, { resourceType: 'Bundle' })).toBeTruthy();
        },
    },
    {
        name: 'VerifyFHIR_EncounterResource',
        annotation: { authors: ['Vicky'], categories: [CategoryType.REGRESSION, CategoryType.API] },
        body: async ({ authenticatedApi }, testInfo) => {
            const response = await executeWithAuthRetry(authenticatedApi, 'GET', `./Encounter`, {}, testInfo);
            expect(await verifyJsonKeyValues(response, { resourceType: 'Encounter' })).toBeTruthy();
        },
    },
]);
