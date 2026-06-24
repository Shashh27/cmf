import { Page, Locator, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly roleSelect: Locator;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;

  // Operator-specific
  readonly machineSelect: Locator;
  readonly machinePasswordInput: Locator;
  readonly nextButton: Locator;
  readonly backButton: Locator;
  readonly verifiedBadge: Locator;

  constructor(page: Page) {
    this.page = page;
    this.roleSelect = page.locator('.ant-select').first();
    this.usernameInput = page.locator('input[placeholder*="name"]');
    this.passwordInput = page.locator('input[type="password"]').last();
    this.submitButton = page.locator('button[type="submit"]');
    this.errorMessage = page.locator('.ant-message-error');
    this.successMessage = page.locator('.ant-message-success');

    // Operator
    this.machineSelect = page.locator('.ant-select').nth(1);
    this.machinePasswordInput = page.locator('input[type="password"]').first();
    this.nextButton = page.locator('button[type="submit"]');
    this.backButton = page.locator('button', { hasText: 'Back' });
    this.verifiedBadge = page.locator('text=Verified');
  }

  async goto() {
    await this.page.goto('/');
  }

  async selectRole(role: string) {
    await this.roleSelect.click();
    await this.page.locator(`.ant-select-item-option[title="${role}"]`).click();
  }

  async fillCredentials(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
  }

  async submit() {
    await this.submitButton.click();
  }

  async loginAs(username: string, password: string, role: string) {
    await this.selectRole(role);
    await this.fillCredentials(username, password);
    await this.submit();
  }

  async loginAsOperator(
    machineId: string,
    machinePass: string,
    operatorId: string,
    password: string
  ) {
    await this.selectRole('Operator');
    await this.machineSelect.click();
    await this.page.locator(`.ant-select-item-option[data-value="${machineId}"]`).click();
    await this.machinePasswordInput.fill(machinePass);
    await this.nextButton.click();
    await this.page.waitForSelector('text=Verified');
    await this.usernameInput.fill(operatorId);
    await this.passwordInput.fill(password);
    await this.submit();
  }
}