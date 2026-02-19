import { test } from '../../../src/fixtures/base.fixture';
import { withAnnotation } from '../../../src/annotations';
import { CategoryType } from '../../../src/enums/categoryType';
import { ConfigProperties, getConfigValue } from '../../../src/enums/configProperties';
import { OpenMRSLoginPage } from '@pages/OpenMRSLoginPage';
import { OpenMRSHomePage } from '@pages/OpenMRSHomePage';
import { generateRandomAlphaNumericSpecialString } from 'src/utils/randomUtils';

test.describe('OpenMRS O3 — Login Authentication', () => {
    test.use({ testCaseId: 'UI-001' });
    test('Verify successful login with valid admin credentials', async ({ page, testCaseData }, testInfo) => {
        withAnnotation(testInfo, {
            authors: ['Vicky'],
            categories: [CategoryType.REGRESSION, CategoryType.UI],
            description: testCaseData.testDescription ?? 'Validates the two-step login flow (username → continue → password → log in) with valid admin credentials and asserts the home page loads successfully',
        });
        const loginPage = new OpenMRSLoginPage(page);
        const homePage = new OpenMRSHomePage(page);
        await loginPage.navigate();
        await loginPage.assertLoginPageLoaded();
        await loginPage.enterUsernameAndContinue(getConfigValue(ConfigProperties.APP_USERNAME));
        await loginPage.assertPasswordStepVisible(getConfigValue(ConfigProperties.APP_USERNAME));
        await loginPage.enterPasswordAndLogin(getConfigValue(ConfigProperties.APP_PASSWORD));
        await homePage.assertHomePageLoaded();
    });
});

test.describe('OpenMRS O3 — Login Negative Scenarios', () => {
    test.use({ testCaseId: 'UI-002' });
    test('Verify login fails with invalid credentials and displays error message', async ({ page, testCaseData }, testInfo) => {
        withAnnotation(testInfo, {
            authors: ['Vicky'],
            categories: [CategoryType.REGRESSION, CategoryType.UI],
            description: testCaseData.testDescription ?? 'Attempts login with randomly generated invalid username and password, then asserts the appropriate error message is displayed on the login page',
        });
        const loginPage = new OpenMRSLoginPage(page);
        await loginPage.navigate();
        await loginPage.assertLoginPageLoaded();
        await loginPage.login(generateRandomAlphaNumericSpecialString(10), generateRandomAlphaNumericSpecialString(10));
        await loginPage.assertLoginFailed();
    });
});


