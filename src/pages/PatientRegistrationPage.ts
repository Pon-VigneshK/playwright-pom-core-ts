import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object for the OpenMRS O3 Patient Registration form.
 *
 * @class PatientRegistrationPage
 * @extends {BasePage}
 */
export class PatientRegistrationPage extends BasePage {
    /** @inheritdoc */
    readonly pageUrl: string = '/openmrs/spa/patient-registration';
    /** @inheritdoc */
    readonly pageTitle: string | RegExp = /Patient Registration/;

    // ─── Locators ────────────────────────────────────────────

    /** "Create New Patient" heading. */
    readonly createNewPatientHeading: Locator;
    /** "Basic Info" section heading. */
    readonly basicInfoHeading: Locator;
    /** First name text input. */
    readonly firstNameInput: Locator;
    /** Family (last) name text input. */
    readonly familyNameInput: Locator;
    /** Female radio button. */
    readonly femaleRadio: Locator;
    /** Male radio button. */
    readonly maleRadio: Locator;
    /** ID Card identifier input. */
    readonly idCardInput: Locator;
    /** Legacy ID identifier input. */
    readonly legacyIdInput: Locator;
    /** Old Identification Number identifier input. */
    readonly oldIdInput: Locator;
    /** "Register patient" submit button. */
    readonly registerPatientButton: Locator;
    /** "New Patient Created" success toast. */
    readonly patientCreatedToast: Locator;

    /**
     * Creates a new PatientRegistrationPage instance.
     * @param {Page} page - Playwright Page instance
     */
    constructor(page: Page) {
        super(page);
        this.createNewPatientHeading = page.getByRole('heading', { name: /create new patient/i });
        this.basicInfoHeading = page.getByRole('heading', { name: /1\.\s*Basic Info/i });
        this.firstNameInput = page.getByRole('textbox', { name: /first name/i });
        this.familyNameInput = page.getByRole('textbox', { name: /family name/i });
        this.femaleRadio = page.getByRole('radio', { name: 'Female', exact: true });
        this.maleRadio = page.getByRole('radio', { name: 'Male', exact: true });
        this.idCardInput = page.getByRole('textbox', { name: 'ID Card' });
        this.legacyIdInput = page.getByRole('textbox', { name: 'Legacy ID' });
        this.oldIdInput = page.getByRole('textbox', { name: 'Old Identification Number' });
        this.registerPatientButton = page.getByRole('button', { name: /register patient/i });
        this.patientCreatedToast = page.getByText('New Patient Created');
    }

    // ─── Actions ─────────────────────────────────────────────

    /**
     * Selects a Carbon Design System radio button and dispatches DOM events
     * so React's internal state is updated.
     *
     * CDS radio buttons use a custom {@code <span>} overlay that intercepts
     * pointer events, so {@code force: true} is required. A bare force-click
     * checks the DOM element but does **not** fire the synthetic events React
     * listens to, so we manually dispatch {@code change}, {@code input}, and
     * {@code click} events.
     *
     * @param {Locator} radio - The radio-button locator to select
     */
    private async selectCdsRadio(radio: Locator): Promise<void> {
        await this.click(radio, { force: true });
        await radio.evaluate((el: HTMLInputElement) => {
            el.checked = true;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('click', { bubbles: true }));
        });
    }

    /**
     * Fills the patient's information and submits the registration.
     *
     * @param {object} patientInfo - Patient data
     * @param {string} patientInfo.firstName - Patient's first name
     * @param {string} patientInfo.familyName - Patient's family/last name
     * @param {'Female' | 'Male'} patientInfo.sex - Patient's sex
     * @param {{ day: string; month: string; year: string }} patientInfo.dob - Date of birth
     * @param {object} [patientInfo.identifiers] - Optional identifier values
     * @param {string} [patientInfo.identifiers.idCard] - ID Card value
     * @param {string} [patientInfo.identifiers.legacyId] - Legacy ID value
     * @param {string} [patientInfo.identifiers.oldId] - Old Identification Number value
     */
    async fillAndRegisterPatient(patientInfo: {
        firstName: string;
        familyName: string;
        sex: 'Female' | 'Male';
        dob: { day: string; month: string; year: string };
        identifiers?: { idCard?: string; legacyId?: string; oldId?: string };
    }): Promise<void> {
        this.logger.info(`Registering patient: ${patientInfo.firstName} ${patientInfo.familyName}`);

        await this.type(this.firstNameInput, patientInfo.firstName);
        await this.type(this.familyNameInput, patientInfo.familyName);

        if (patientInfo.sex === 'Female') {
            await this.selectCdsRadio(this.femaleRadio);
        } else {
            await this.selectCdsRadio(this.maleRadio);
        }

        await this.fillDateOfBirth(patientInfo.dob.day, patientInfo.dob.month, patientInfo.dob.year);

        if (patientInfo.identifiers) {
            await this.fillIdentifiers(patientInfo.identifiers);
        }

        await this.click(this.registerPatientButton);
    }

    /**
     * Fills the date of birth spinbutton fields (dd / mm / yyyy).
     *
     * @param {string} day - Day value (e.g. '15')
     * @param {string} month - Month value (e.g. '06')
     * @param {string} year - Year value (e.g. '1990')
     */
    async fillDateOfBirth(day: string, month: string, year: string): Promise<void> {
        this.logger.info(`Filling date of birth: ${day}/${month}/${year}`);
        const spinbuttons = this.page.getByRole('spinbutton');
        await spinbuttons.nth(0).fill(day);
        await spinbuttons.nth(1).fill(month);
        await spinbuttons.nth(2).fill(year);
    }

    /**
     * Fills optional identifier fields when visible on the form.
     *
     * @param {object} ids - Identifier values
     * @param {string} [ids.idCard] - ID Card value
     * @param {string} [ids.legacyId] - Legacy ID value
     * @param {string} [ids.oldId] - Old Identification Number value
     */
    async fillIdentifiers(ids: { idCard?: string; legacyId?: string; oldId?: string }): Promise<void> {
        this.logger.info('Filling identifier fields');
        if (ids.idCard) await this.type(this.idCardInput, ids.idCard);
        if (ids.legacyId) await this.type(this.legacyIdInput, ids.legacyId);
        if (ids.oldId) await this.type(this.oldIdInput, ids.oldId);
    }

    // ─── Assertions ──────────────────────────────────────────

    /**
     * Asserts the registration form is loaded with the heading and Basic Info section.
     */
    async assertRegistrationFormLoaded(): Promise<void> {
        this.logger.info('Asserting registration form is loaded');
        await this.assertVisible(this.createNewPatientHeading);
        await this.assertVisible(this.basicInfoHeading);
    }

    /**
     * Asserts patient basic info fields have the expected values.
     *
     * @param {string} firstName - Expected first name
     * @param {string} familyName - Expected family name
     * @param {'Female' | 'Male'} sex - Expected sex selection
     */
    async assertBasicInfoFilled(firstName: string, familyName: string, sex: 'Female' | 'Male' = 'Female'): Promise<void> {
        this.logger.info('Asserting basic info fields are filled');
        await this.assertValue(this.firstNameInput, firstName);
        await this.assertValue(this.familyNameInput, familyName);
        const radio = sex === 'Female' ? this.femaleRadio : this.maleRadio;
        await expect(radio).toBeChecked();
    }

    /**
     * Asserts the patient was created successfully by checking for
     * the "New Patient Created" toast and the patient chart URL.
     *
     * @param {string} firstName - The patient's first name to verify
     * @param {string} familyName - The patient's family name to verify
     */
    async assertPatientCreated(firstName: string, familyName: string): Promise<void> {
        this.logger.info(`Asserting patient ${firstName} ${familyName} was created`);
        await expect(this.patientCreatedToast).toBeVisible({ timeout: 15000 });
        await this.assertUrlContains('/patient/.+/chart');
    }
}

