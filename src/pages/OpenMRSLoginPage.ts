import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object for the OpenMRS O3 Login page.
 *
 * Handles the two-step login flow: username → continue → password → log in.
 *
 * @class OpenMRSLoginPage
 * @extends {BasePage}
 */
export class OpenMRSLoginPage extends BasePage {
    /** @inheritdoc */
    readonly pageUrl: string = '/openmrs/spa/login';
    /** @inheritdoc */
    readonly pageTitle: string | RegExp = /Login/;

    // ─── Locators ────────────────────────────────────────────

    /** Username text input. */
    readonly usernameInput: Locator;
    /** Continue button (step 1). */
    readonly continueButton: Locator;
    /** "Learn more" link on the login page. */
    readonly learnMoreLink: Locator;
    /** Password text input (step 2). */
    readonly passwordInput: Locator;
    /** "Show password" toggle button. */
    readonly showPasswordButton: Locator;
    /** "Log in" submit button (step 2). */
    readonly loginButton: Locator;

    /**
     * Creates a new OpenMRSLoginPage instance.
     * @param {Page} page - Playwright Page instance
     */
    constructor(page: Page) {
        super(page);
        this.usernameInput = page.getByRole('textbox', { name: 'Username' });
        this.continueButton = page.getByRole('button', { name: 'Continue' });
        this.learnMoreLink = page.getByRole('link', { name: 'Learn more' });
        this.passwordInput = page.getByRole('textbox', { name: 'Password' });
        this.showPasswordButton = page.getByRole('button', { name: 'Show password' });
        this.loginButton = page.getByRole('button', { name: 'Log in' });
    }

    // ─── Actions ─────────────────────────────────────────────

    /**
     * Performs the full two-step login flow.
     *
     * @param {string} username - The username to enter
     * @param {string} password - The password to enter
     */
    async login(username: string, password: string): Promise<void> {
        this.logger.info(`Logging in as: ${username}`);
        await this.type(this.usernameInput, username);
        await this.click(this.continueButton);
        await this.waitForElement(this.passwordInput);
        await this.type(this.passwordInput, password);
        await this.click(this.loginButton);
    }

    /**
     * Enters the username and clicks Continue (step 1 only).
     *
     * @param {string} username - The username to enter
     */
    async enterUsernameAndContinue(username: string): Promise<void> {
        this.logger.info(`Entering username: ${username}`);
        await this.type(this.usernameInput, username);
        await this.click(this.continueButton);
    }

    /**
     * Enters the password and clicks Log in (step 2 only).
     *
     * @param {string} password - The password to enter
     */
    async enterPasswordAndLogin(password: string): Promise<void> {
        this.logger.info('Entering password and clicking Log in');
        await this.type(this.passwordInput, password);
        await this.click(this.loginButton);
    }

    // ─── Assertions ──────────────────────────────────────────

    /**
     * Asserts the login page is loaded with username field, Continue button, and Learn more link.
     */
    async assertLoginPageLoaded(): Promise<void> {
        this.logger.info('Asserting OpenMRS login page is loaded');
        await this.assertVisible(this.usernameInput);
        await this.assertVisible(this.continueButton);
        await this.assertVisible(this.learnMoreLink);
    }

    /**
     * Asserts the password step is displayed and username is retained.
     *
     * @param {string} expectedUsername - The username expected to be retained
     */
    async assertPasswordStepVisible(expectedUsername: string): Promise<void> {
        this.logger.info('Asserting password step is visible');
        await this.assertVisible(this.passwordInput);
        await this.assertValue(this.usernameInput, expectedUsername);
        await this.assertVisible(this.showPasswordButton);
    }

    /**
     * Asserts that login failed and user remains on the login page.
     */
    async assertLoginFailed(): Promise<void> {
        this.logger.info('Asserting login failure — user remains on login page');
        await this.assertUrlContains('login');
    }
}

