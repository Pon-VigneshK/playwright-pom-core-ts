import { test } from '../../../src/fixtures/base.fixture';
import { expect } from '@playwright/test';
import { withAnnotation } from '../../../src/annotations';
import { CategoryType } from '../../../src/enums/categoryType';
import { ConfigProperties, getConfigValue } from '../../../src/enums/configProperties';
import { executeWithAuthRetry } from '../../../src/auth/requestBuilder';
import { verifyJsonKeyValues } from '../../../src/utils/apiResponseUtils';
import { OpenMRSLoginPage } from '@pages/OpenMRSLoginPage';
import { OpenMRSHomePage } from '@pages/OpenMRSHomePage';
import { PatientRegistrationPage } from '@pages/PatientRegistrationPage';
import { getFirstName, getLastName } from '@utils/randomUtils';

const firstName = getFirstName();
const lastName = getLastName();
const sex = 'Male'

test.describe('OpenMRS O3 — Patient Registration UI + FHIR API Validation', () => {
    test.use({ testCaseId: 'WF-001' });
    test('Register a new patient via UI and verify patient record exists in FHIR R4 API', async ({ page, testCaseData, authenticatedApi }, testInfo) => {
       withAnnotation(testInfo, {
            authors: ['Vicky'],
            categories: [CategoryType.REGRESSION, CategoryType.UI],
            description: testCaseData.testDescription ?? `End-to-end workflow: logs in, registers patient ${firstName} ${lastName} with identifiers (ID Card, Legacy ID, Old ID) via the UI, then validates the patient record exists in the FHIR R4 API response with matching given name, family name, and resource type`,
        });
       const loginPage = new OpenMRSLoginPage(page);
        const homePage = new OpenMRSHomePage(page);
        const registrationPage = new PatientRegistrationPage(page);
        await loginPage.navigate();
        await loginPage.login(
            getConfigValue(ConfigProperties.APP_USERNAME),
            getConfigValue(ConfigProperties.APP_PASSWORD),
        );
        await homePage.assertHomePageLoaded();
        await homePage.clickAddPatient();
        await registrationPage.assertRegistrationFormLoaded();
        const uniqueSuffix = Date.now().toString().slice(-6);
        await registrationPage.fillAndRegisterPatient({
            firstName: firstName,
            familyName: lastName,
            sex: sex,
            dob: { day: '15', month: '06', year: '1990' },
            identifiers: {
                idCard: `IC-${uniqueSuffix}`,
                legacyId: `LG-${uniqueSuffix}`,
                oldId: `OLD-${uniqueSuffix}`,
            },
        });
        await registrationPage.assertPatientCreated(firstName, lastName);
        const response = await executeWithAuthRetry( authenticatedApi, 'GET',`./Patient?name=${firstName}`, {},testInfo,);
        expect(await verifyJsonKeyValues(response, { given: firstName, family: lastName, resourceType: 'Patient' }), `Expected patient to have given name "${firstName}" and family name "${lastName}"`).toBeTruthy();
    });
});