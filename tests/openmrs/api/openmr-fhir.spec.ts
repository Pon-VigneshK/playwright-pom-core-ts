import { test } from '../../../src/fixtures/base.fixture';
import { expect } from '@playwright/test';
import { withAnnotation } from '../../../src/annotations';
import { CategoryType } from '../../../src/enums/categoryType';
import { executeWithAuthRetry } from '../../../src/auth/requestBuilder';
import { verifyJsonKeyValues } from '../../../src/utils/apiResponseUtils';

    test.describe('OpenMRS FHIR R4 — Patient Resource', () => {
        test.use({ testCaseId: 'API-001' });
        test('Verify FHIR Patient resource returns valid response with correct resourceType', async ({ testCaseData, authenticatedApi }, testInfo) => {
            withAnnotation(testInfo, {
                authors: ['Vicky'],
                categories: [CategoryType.REGRESSION, CategoryType.API],
                description: testCaseData.testDescription ?? 'Sends a GET request to the FHIR R4 Patient endpoint and validates the response contains resourceType "Patient"',
            });
            const response = await executeWithAuthRetry( authenticatedApi, 'GET',`./Patient`, {},testInfo,);
                    expect(await verifyJsonKeyValues(response, { resourceType: 'Patient' })).toBeTruthy();
        });
    });

    test.describe('OpenMRS FHIR R4 — Task Resource', () => {
        test.use({ testCaseId: 'API-002' });
        test('Verify FHIR Task resource returns valid response with correct resourceType', async ({ testCaseData, authenticatedApi }, testInfo) => {
            withAnnotation(testInfo, {
                authors: ['Vicky'],
                categories: [CategoryType.REGRESSION, CategoryType.API],
                description: testCaseData.testDescription ?? 'Sends a GET request to the FHIR R4 Task endpoint and validates the response contains resourceType "Task"',
            });
            const response = await executeWithAuthRetry( authenticatedApi, 'GET',`./Task`, {},testInfo,);
                    expect(await verifyJsonKeyValues(response, { resourceType: 'Task' })).toBeTruthy();
        });
    });

    test.describe('OpenMRS FHIR R4 — AllergyIntolerance Resource', () => {
        test.use({ testCaseId: 'API-003' });
        test('Verify FHIR AllergyIntolerance resource returns valid response with correct resourceType', async ({ testCaseData, authenticatedApi }, testInfo) => {
            withAnnotation(testInfo, {
                authors: ['Vicky'],
                categories: [CategoryType.REGRESSION, CategoryType.API],
                description: testCaseData.testDescription ?? 'Sends a GET request to the FHIR R4 AllergyIntolerance endpoint and validates the response contains resourceType "AllergyIntolerance"',
            });
            const response = await executeWithAuthRetry( authenticatedApi, 'GET',`./AllergyIntolerance`, {},testInfo,);
                    expect(await verifyJsonKeyValues(response, { resourceType: 'AllergyIntolerance' })).toBeTruthy();
        });
    });

    test.describe('OpenMRS FHIR R4 — Encounter Resource', () => {
        test.use({ testCaseId: 'API-004' });
        test('Verify FHIR Encounter resource returns valid response with correct resourceType', async ({ testCaseData, authenticatedApi }, testInfo) => {
            withAnnotation(testInfo, {
                authors: ['Vicky'],
                categories: [CategoryType.REGRESSION, CategoryType.API],
                description: testCaseData.testDescription ?? 'Sends a GET request to the FHIR R4 Encounter endpoint and validates the response contains resourceType "Encounter"',
            });
           const response = await executeWithAuthRetry( authenticatedApi, 'GET',`./Encounter`, {},testInfo,);
                    expect(await verifyJsonKeyValues(response, { resourceType: 'Encounter' })).toBeTruthy();
        });
    });
