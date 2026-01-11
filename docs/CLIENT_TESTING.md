# Client Applications Testing Guide

This directory contains E2E test suites for client applications using the cf-auth backend.

## Web Application (Qwik Demo App)

### Location

`cf-auth/demo-app/`

### Running Tests

```bash
# Navigate to demo app
cd cf-auth/demo-app

# Install dependencies (if not already)
pnpm install

# Run all E2E tests
pnpm test:e2e

# Run tests in UI mode (visual debugging)
pnpm test:e2e:ui

# Run tests in headed mode (see browser)
pnpm test:e2e:headed

# Debug specific test
pnpm test:e2e:debug

# View test report
pnpm test:e2e:report
```

### Test Suites

#### 1. **Authentication Flow** (`e2e/auth.spec.ts`)

Tests complete authentication lifecycle:

- User registration with validation
- Email verification flow
- Login/logout functionality
- Password reset workflow
- Session persistence across reloads
- Protected route access control
- Session expiration handling
- Duplicate email prevention
- Password strength validation

**Key Test Cases:**

- ✅ Display login page
- ✅ Navigate to registration
- ✅ Show validation errors
- ✅ Register new user
- ✅ Handle duplicate emails
- ✅ Validate password strength
- ✅ Login with valid credentials
- ✅ Show error for invalid credentials
- ✅ Logout successfully
- ✅ Handle password reset
- ✅ Persist session across reloads
- ✅ Redirect to login for protected routes
- ✅ Handle session expiration

#### 2. **Authorization & Permissions** (`e2e/permissions.spec.ts`)

Tests the permission system:

- Role assignment and revocation
- Permission checks and validation
- Access control enforcement
- Permission inheritance
- Audit trail tracking
- Custom role creation
- Permission filtering
- Search and pagination

**Key Test Cases:**

- ✅ Display permissions dashboard
- ✅ List available roles
- ✅ Create custom role
- ✅ Grant role to user
- ✅ Revoke role from user
- ✅ Display user permissions
- ✅ Filter permissions by category
- ✅ View permission audit trail
- ✅ Prevent unauthorized access
- ✅ Show permission inheritance
- ✅ Validate permission changes
- ✅ Search for users
- ✅ Paginate users list
- ✅ Export audit trail

#### 3. **Session Management** (`e2e/session.spec.ts`)

Tests session handling:

- Session persistence across navigation
- Token refresh automation
- Multi-tab synchronization
- Concurrent session support
- Secure cookie handling
- Remember me functionality
- Session hijacking prevention
- Sensitive data cleanup on logout

**Key Test Cases:**

- ✅ Maintain session across page reloads
- ✅ Maintain session across navigation
- ✅ Handle token refresh automatically
- ✅ Sync logout across tabs
- ✅ Prevent access after session expiration
- ✅ Allow multiple concurrent sessions
- ✅ Handle session storage correctly
- ✅ Clear sensitive data on logout
- ✅ Handle remember me functionality
- ✅ Handle session hijacking prevention

### Test Helpers (`e2e/helpers.ts`)

Utility functions for test setup:

- `createTestUser()` - Generate unique test users
- `registerUser()` - Register via UI
- `loginUser()` - Login via UI
- `logoutUser()` - Logout current user
- `navigateToDashboard()` - Navigate to dashboard pages
- `waitForApiCall()` - Wait for specific API calls
- `isAuthenticated()` - Check auth status
- `getCurrentUser()` - Get current user from cookies
- `clearAuth()` - Clear authentication cookies
- `mockApiResponse()` - Mock API responses for testing
- `grantRoleViaApi()` - Setup test data
- `createRoleViaApi()` - Setup test roles

### Prerequisites

1. **Backend running**: cf-auth worker must be running on `http://localhost:8787`

   ```bash
   cd cf-auth
   pnpm run dev
   ```

2. **Demo app running**: Playwright will start it automatically, or run manually:
   ```bash
   cd cf-auth/demo-app
   pnpm run dev
   ```

### CI/CD Integration

Tests can be run in CI environments:

```yaml
# GitHub Actions example
- name: Install Playwright Browsers
  run: pnpm exec playwright install --with-deps

- name: Run E2E Tests
  run: pnpm test:e2e
  env:
    CI: true

- name: Upload test results
  uses: actions/upload-artifact@v3
  if: always()
  with:
    name: playwright-report
    path: playwright-report/
```

### Test Configuration

Configuration in `playwright.config.ts`:

- **Browsers**: Chrome, Firefox, WebKit, Mobile Chrome, Mobile Safari
- **Base URL**: `http://localhost:5173`
- **Retries**: 2 on CI, 0 locally
- **Workers**: 1 on CI (serial), parallel locally
- **Screenshots**: On failure only
- **Traces**: On first retry
- **HTML Reporter**: Full report with screenshots and traces

### Writing New Tests

Example test structure:

```typescript
import { test, expect } from "@playwright/test";
import { loginUser, createTestUser } from "./helpers";

test.describe("Feature Name", () => {
  const testUser = createTestUser("feature");

  test.beforeEach(async ({ page }) => {
    await loginUser(page, testUser);
  });

  test("should do something", async ({ page }) => {
    // Arrange
    await page.goto("/some-page");

    // Act
    await page.getByRole("button", { name: /click me/i }).click();

    // Assert
    await expect(page).toHaveURL("/expected-url");
    await expect(page.getByText(/success/i)).toBeVisible();
  });
});
```

### Debugging Tests

1. **UI Mode** (recommended for debugging):

   ```bash
   pnpm test:e2e:ui
   ```

   - Visual test runner
   - Step through tests
   - Time travel debugging
   - Watch mode

2. **Debug Mode**:

   ```bash
   pnpm test:e2e:debug
   ```

   - Runs in headed mode
   - Opens Playwright Inspector
   - Pause and step through tests

3. **Headed Mode**:

   ```bash
   pnpm test:e2e:headed
   ```

   - See browser while tests run
   - Watch UI interactions
   - Slower execution for observation

4. **View Reports**:
   ```bash
   pnpm test:e2e:report
   ```
   - HTML report with screenshots
   - Failed test traces
   - Video recordings

### Common Issues

**Issue**: Tests fail with "Target closed"
**Solution**: Ensure backend is running on port 8787

**Issue**: Login tests fail
**Solution**: Check that test users can be created (unique emails)

**Issue**: Slow test execution
**Solution**: Run in parallel: `pnpm test:e2e --workers=4`

**Issue**: Flaky tests
**Solution**: Use `waitFor` helpers and avoid fixed timeouts

## Desktop Application (Tauri)

### Location

`desktop-app/`

### Features

The Tauri desktop app provides:

- Native desktop experience (macOS, Windows, Linux)
- Full authentication integration
- Permission management UI
- Secure token storage
- Offline capability (coming soon)

### Running the App

```bash
# Navigate to desktop app
cd desktop-app

# Install dependencies
pnpm install

# Run in development mode
pnpm tauri dev

# Build for production
pnpm tauri build
```

### Architecture

The desktop app uses:

- **Frontend**: Vanilla TypeScript + Vite
- **Backend**: Tauri (Rust)
- **Auth Client**: Custom TypeScript client (`src/auth.ts`)
- **Storage**: localStorage for tokens (secure with Tauri's API)

### Authentication Client

The `AuthClient` class provides:

- User registration
- Login/logout
- Token management (auto-refresh)
- Permission checking
- Password management
- Email verification

Example usage:

```typescript
import { authClient } from "./auth";

// Login
const { user, tokens } = await authClient.login({
  email: "user@example.com",
  password: "password123",
});

// Check permission
const canEdit = await authClient.hasPermission("resource:edit");

// Get current user
const { user } = await authClient.getMe();

// Logout
await authClient.logout();
```

### Testing Desktop App

**Manual Testing:**

1. Start cf-auth backend: `cd cf-auth && pnpm run dev`
2. Start desktop app: `cd desktop-app && pnpm tauri dev`
3. Test authentication flows
4. Test permission checks

**E2E Testing** (coming soon):

- Tauri integration tests using WebDriver
- Cross-platform testing (macOS, Windows, Linux)
- Automated UI testing with Playwright

### Building for Distribution

```bash
# Build for current platform
pnpm tauri build

# Build for specific platform (requires setup)
pnpm tauri build --target x86_64-apple-darwin  # macOS Intel
pnpm tauri build --target aarch64-apple-darwin # macOS Apple Silicon
pnpm tauri build --target x86_64-pc-windows-msvc # Windows
pnpm tauri build --target x86_64-unknown-linux-gnu # Linux
```

Installers will be in `desktop-app/src-tauri/target/release/bundle/`

## Security Considerations

### Token Storage

**Web App:**

- Access tokens in HTTP-only cookies
- Refresh tokens in secure cookies
- SameSite=Strict for CSRF protection

**Desktop App:**

- Tokens stored in localStorage (encrypted by Tauri)
- Platform-specific secure storage (coming soon)
- Auto-expiration and refresh

### Best Practices

1. **Never commit test credentials** to version control
2. **Use unique test users** for each test run
3. **Clean up test data** after test completion
4. **Mock sensitive operations** in tests when appropriate
5. **Rotate test API keys** regularly
6. **Use CI secrets** for credentials in pipelines

## Contributing

When adding new features:

1. **Write tests first** (TDD approach)
2. **Update this README** with new test descriptions
3. **Add helpers** for common operations
4. **Document edge cases** in test comments
5. **Ensure tests pass** on all platforms

### Test Checklist

Before submitting PR:

- [ ] All existing tests pass
- [ ] New tests added for new features
- [ ] Tests pass on Chrome, Firefox, WebKit
- [ ] Tests pass on mobile viewports
- [ ] README updated with new test descriptions
- [ ] No hardcoded credentials or URLs

## Resources

- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Tauri Documentation](https://tauri.app/v2/)
- [cf-auth API Documentation](../cf-auth/README.md)
- [Testing Best Practices](https://playwright.dev/docs/best-practices)

## Support

For issues or questions:

- Open issue with `testing` label
- Include test failure screenshots
- Provide browser/OS information
- Include relevant logs
