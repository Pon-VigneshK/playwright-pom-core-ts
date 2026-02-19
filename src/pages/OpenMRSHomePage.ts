import { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object for the OpenMRS O3 Home page (post-login).
 *
 * @class OpenMRSHomePage
 * @extends {BasePage}
 */
export class OpenMRSHomePage extends BasePage {
    /** @inheritdoc */
    readonly pageUrl: string = '/openmrs/spa/home';
    /** @inheritdoc */
    readonly pageTitle: string | RegExp = /Home/;

    // ─── Locators ────────────────────────────────────────────

    /** OpenMRS logo link. */
    readonly openMRSLogo: Locator;
    /** Logged-in user display name. */
    readonly superUserText: Locator;
    /** "Add patient" button in the header. */
    readonly addPatientButton: Locator;
    /** "Service queues" label on the home dashboard. */
    readonly serviceQueuesText: Locator;

    /**
     * Creates a new OpenMRSHomePage instance.
     * @param {Page} page - Playwright Page instance
     */
    constructor(page: Page) {
        super(page);
        this.openMRSLogo = page.getByRole('link', { name: 'OpenMRS Logo' });
        this.superUserText = page.getByText('Super User');
        this.addPatientButton = page.getByRole('button', { name: /add patient/i });
        this.serviceQueuesText = page.getByText(/Service queues/i);
    }

    // ─── Actions ─────────────────────────────────────────────

    /**
     * Clicks the "Add patient" button to open the registration form.
     */
    async clickAddPatient(): Promise<void> {
        this.logger.info('Clicking Add patient button');
        await this.click(this.addPatientButton);
    }

    // ─── Assertions ──────────────────────────────────────────

    /**
     * Asserts the home page is loaded after a successful login.
     */
    async assertHomePageLoaded(): Promise<void> {
        this.logger.info('Asserting OpenMRS home page is loaded');
        await this.assertUrlContains('home');
        await this.assertVisible(this.openMRSLogo);
        await this.assertVisible(this.superUserText);
    }

    /**
     * Asserts the "Add patient" button is visible on the home page.
     */
    async assertAddPatientButtonVisible(): Promise<void> {
        this.logger.info('Asserting Add patient button is visible');
        await this.assertVisible(this.addPatientButton);
    }
}

