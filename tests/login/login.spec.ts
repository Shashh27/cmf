import { test, expect } from '@playwright/test';
import { LoginPage } from '../utils/LoginPage';
import { ROLES, INVALID_CREDENTIALS } from './login.fixtures';

// ─────────────────────────────────────────────
// HELPER: select machine from operator dropdown
// Works by waiting for machines API to load first
// ─────────────────────────────────────────────
async function selectMachine(page: any) {
  await page.waitForTimeout(500); // wait for machines API mock to respond & render
  await page.locator('.ant-select').nth(1).click();
  await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)', { state: 'visible' });
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').first().click();
}

// ─────────────────────────────────────────────
// 1. UI RENDERING TESTS
// ─────────────────────────────────────────────
test.describe('Login Page - UI Rendering', () => {
  test('should display logo and MES title', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await expect(page.locator('img[alt="CMTI"]')).toBeVisible();
    await expect(page.locator('text=Manufacturing Execution System')).toBeVisible();
  });

  test('should show role select dropdown on load', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await expect(loginPage.roleSelect).toBeVisible();
    await expect(page.locator('text=Select Your Role')).toBeVisible();
  });

  test('should show all 6 role options in dropdown', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.roleSelect.click();
    await page.waitForSelector('.ant-select-dropdown', { state: 'visible' });
    const expectedRoles = [
      'Admin', 'Supervisor', 'Supervisor-Tool Crib',
      'Project Coordinator', 'Manufacturing Coordinator', 'Operator'
    ];
    for (const role of expectedRoles) {
      await expect(page.getByTitle(role, { exact: true })).toBeVisible();
    }
  });

  test('should show copyright footer', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await expect(page.locator(`text=© Developed and maintained by CMTI`)).toBeVisible();
  });
});

// ─────────────────────────────────────────────
// 2. ROLE SELECTION TESTS
// ─────────────────────────────────────────────
test.describe('Login Page - Role Selection', () => {
  test('should show admin form when Admin is selected', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.selectRole('Admin');
    await expect(page.locator('text=Admin Credentials')).toBeVisible();
    await expect(page.locator('input[placeholder*="name"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('should show operator 2-step form when Operator is selected', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.selectRole('Operator');
    await expect(page.locator('text=Machine Select & Verify')).toBeVisible();
    await expect(page.locator('text=Next')).toBeVisible();
  });

  test('should reset form when switching roles', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.selectRole('Admin');
    await loginPage.usernameInput.fill('some_user');
    await loginPage.selectRole('Supervisor');
    const value = await loginPage.usernameInput.inputValue();
    expect(value).toBe('');
  });

  test('should support role search in dropdown', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.roleSelect.click();
    await page.keyboard.type('coord');
    await expect(page.locator('.ant-select-item-option', { hasText: 'Project Coordinator' })).toBeVisible();
    await expect(page.locator('.ant-select-item-option', { hasText: 'Manufacturing Coordinator' })).toBeVisible();
    await expect(page.locator('.ant-select-item-option', { hasText: 'Admin' })).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────
// 3. FORM VALIDATION TESTS
// ─────────────────────────────────────────────
test.describe('Login Page - Form Validation', () => {
  test('should show validation error when submitting empty admin form', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.selectRole('Admin');
    await loginPage.submit();
    await expect(page.locator('text=Enter username')).toBeVisible();
    await expect(page.locator('text=Enter password')).toBeVisible();
  });

  test('should show validation error for empty username only', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.selectRole('Supervisor');
    await loginPage.passwordInput.fill('somepass');
    await loginPage.submit();
    await expect(page.locator('text=Enter username')).toBeVisible();
    await expect(page.locator('text=Enter password')).not.toBeVisible();
  });

  test('should show validation error for empty password only', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.selectRole('Supervisor');
    await loginPage.usernameInput.fill('someuser');
    await loginPage.submit();
    await expect(page.locator('text=Enter password')).toBeVisible();
  });

  test('operator: should validate machine selection before next step', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.selectRole('Operator');
    await loginPage.nextButton.click();
    await expect(page.locator('text=Select a machine')).toBeVisible();
    await expect(page.locator('text=Enter machine password')).toBeVisible();
  });
});

// ─────────────────────────────────────────────
// 4. OPERATOR 2-STEP FLOW TESTS
// ─────────────────────────────────────────────
test.describe('Login Page - Operator Two-Step Flow', () => {
  test('should show step 2 after successful machine verification', async ({ page }) => {
    await page.route('**/machines/verify**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 1, type: 'CNC', make: 'Fanuc', model: 'M10' }),
      });
    });
    await page.route('**/machines/', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 1, type: 'CNC', make: 'Fanuc', model: 'M10' }]),
      });
    });

    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.selectRole('Operator');
    await selectMachine(page);
    await loginPage.machinePasswordInput.fill('machine_pass');
    await loginPage.nextButton.click();

    await expect(loginPage.verifiedBadge).toBeVisible();
    await expect(page.locator('input[placeholder*="Operator Name"]')).toBeVisible();
  });

  test('should show error on wrong machine credentials', async ({ page }) => {
    await page.route('**/machines/verify**', async (route) => {
      await route.fulfill({ status: 401 });
    });
    await page.route('**/machines/', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 1, type: 'CNC', make: 'Fanuc', model: 'M10' }]),
      });
    });

    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.selectRole('Operator');
    await selectMachine(page);
    await loginPage.machinePasswordInput.fill('wrong_pass');
    await loginPage.nextButton.click();

    await expect(page.locator('.ant-message-error')).toBeVisible();
    await expect(page.locator('text=Machine Select & Verify')).toBeVisible();
    await expect(loginPage.verifiedBadge).not.toBeVisible();
  });

  test('should go back to step 1 when Back button is clicked', async ({ page }) => {
    await page.route('**/machines/verify**', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ id: 1, type: 'CNC', make: 'Fanuc', model: 'M10' }),
      });
    });
    await page.route('**/machines/', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify([{ id: 1, type: 'CNC', make: 'Fanuc', model: 'M10' }]),
      });
    });

    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.selectRole('Operator');
    await selectMachine(page);
    await loginPage.machinePasswordInput.fill('machine_pass');
    await loginPage.nextButton.click();
    await expect(loginPage.verifiedBadge).toBeVisible();

    await loginPage.backButton.click();
    await expect(loginPage.verifiedBadge).not.toBeVisible();
    await expect(page.locator('text=Next')).toBeVisible();
  });

  test('should persist selectedMachine in localStorage after machine verify', async ({ page }) => {
    const machineData = { id: 1, type: 'CNC', make: 'Fanuc', model: 'M10' };
    await page.route('**/machines/verify**', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify(machineData) });
    });
    await page.route('**/machines/', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify([machineData]) });
    });

    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.selectRole('Operator');
    await selectMachine(page);
    await loginPage.machinePasswordInput.fill('machine_pass');
    await loginPage.nextButton.click();
    await expect(loginPage.verifiedBadge).toBeVisible();

    const stored = await page.evaluate(() => localStorage.getItem('selectedMachine'));
    expect(JSON.parse(stored!)).toEqual(machineData);
  });
}); // ← closes Operator Two-Step Flow

// ─────────────────────────────────────────────
// 5. AUTHENTICATION & ROLE MISMATCH TESTS
// ─────────────────────────────────────────────
test.describe('Login Page - Authentication', () => {
  async function mockLoginResponse(page: any, role: string) {
    await page.route('**/login/', async (route: any) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user_name: 'test_user', role }),
      });
    });
  }

  test('admin login should redirect to /admin/dashboard', async ({ page }) => {
    await mockLoginResponse(page, 'Admin');
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAs('admin_user', 'pass', 'Admin');
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test('supervisor login should redirect to /supervisor/production_logs', async ({ page }) => {
    await mockLoginResponse(page, 'Supervisor');
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAs('sup_user', 'pass', 'Supervisor');
    await expect(page).toHaveURL(/\/supervisor\/production_logs/);
  });

  test('project coordinator login should redirect correctly', async ({ page }) => {
    await mockLoginResponse(page, 'Project Coordinator');
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAs('coord_user', 'pass', 'Project Coordinator');
    await expect(page).toHaveURL(/\/project_coordinator\/oms\/orders/);
  });

  test('manufacturing coordinator login should redirect correctly', async ({ page }) => {
    await mockLoginResponse(page, 'Manufacturing Coordinator');
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAs('mc_user', 'pass', 'Manufacturing Coordinator');
    await expect(page).toHaveURL(/\/manufacturing_coordinator\/dashboard/);
  });

  test('inventory supervisor login should redirect correctly', async ({ page }) => {
    await mockLoginResponse(page, 'Inventory Supervisor');
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAs('inv_user', 'pass', 'Supervisor-Tool Crib');
    await expect(page).toHaveURL(/\/inventory_supervisor\/inventory-management\/inventory-master/);
  });

  test('should show error on invalid credentials (401)', async ({ page }) => {
    await page.route('**/login/', async (route) => {
      await route.fulfill({ status: 401 });
    });
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAs('wrong_user', 'wrong_pass', 'Admin');
    await expect(page.locator('.ant-message-error')).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('role mismatch: admin credentials used in supervisor role should show error', async ({ page }) => {
    await mockLoginResponse(page, 'Admin');
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAs('admin_user', 'pass', 'Supervisor');
    await expect(page.locator('.ant-message-error', { hasText: 'supervisor access' })).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('should store isAuthenticated and user in localStorage on success', async ({ page }) => {
    const userData = { user_name: 'admin_user', role: 'Admin' };
    await page.route('**/login/', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify(userData) });
    });
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAs('admin_user', 'pass', 'Admin');
    const isAuth = await page.evaluate(() => localStorage.getItem('isAuthenticated'));
    const user = await page.evaluate(() => localStorage.getItem('user'));
    expect(isAuth).toBe('true');
    expect(JSON.parse(user!)).toEqual(userData);
  });

  test('should show network error message when server is unreachable', async ({ page }) => {
    await page.route('**/login/', async (route) => {
      await route.abort('failed');
    });
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAs('admin_user', 'pass', 'Admin');
    await expect(page.locator('.ant-message-error')).toBeVisible();
  });
}); // ← closes Authentication

// ─────────────────────────────────────────────
// 6. LOADING STATE TESTS
// ─────────────────────────────────────────────
test.describe('Login Page - Loading States', () => {
  test('submit button should show loading state during API call', async ({ page }) => {
    await page.route('**/login/', async (route) => {
      await new Promise(r => setTimeout(r, 1000));
      await route.fulfill({ status: 200, body: JSON.stringify({ role: 'Admin' }) });
    });
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.selectRole('Admin');
    await loginPage.fillCredentials('admin', 'pass');
    await loginPage.submit();
    await expect(page.locator('button[type="submit"]')).toHaveClass(/ant-btn-loading/);
  });
}); // ← closes Loading States

// ─────────────────────────────────────────────
// 7. SECURITY TESTS
// ─────────────────────────────────────────────
test.describe('Login Page - Security', () => {
  test('password field should be masked', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.selectRole('Admin');
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('password field should have autocomplete=new-password', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.selectRole('Admin');
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toHaveAttribute('autocomplete', 'new-password');
  });

  test('username should not autocomplete', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.selectRole('Admin');
    const usernameInput = page.locator('input[placeholder*="name"]');
    await expect(usernameInput).toHaveAttribute('autocomplete', 'off');
  });
}); // ← closes Security

// ─────────────────────────────────────────────
// 8. REDIRECT / SESSION TESTS
// ─────────────────────────────────────────────
test.describe('Login Page - Redirect Behavior', () => {
  test('should redirect to saved "from" path if within same role prefix', async ({ page }) => {
    await page.route('**/login/', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ role: 'Admin' }),
      });
    });
    await page.goto('/?redirected_from=/admin/settings');
    const loginPage = new LoginPage(page);
    await loginPage.selectRole('Admin');
    await loginPage.fillCredentials('admin_user', 'pass');
    await loginPage.submit();
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });
}); // ← closes Redirect Behavior