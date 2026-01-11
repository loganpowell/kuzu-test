import { authClient, type User } from "./auth";
import "./styles.css";

let currentUser: User | null = null;

// UI State Management
function showView(viewId: string): void {
  document.querySelectorAll(".view").forEach((view) => {
    (view as HTMLElement).style.display = "none";
  });
  const view = document.getElementById(viewId);
  if (view) {
    view.style.display = "block";
  }
}

function showError(message: string): void {
  const errorEl = document.getElementById("error-message");
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = "block";
    setTimeout(() => {
      errorEl.style.display = "none";
    }, 5000);
  }
}

function showSuccess(message: string): void {
  const successEl = document.getElementById("success-message");
  if (successEl) {
    successEl.textContent = message;
    successEl.style.display = "block";
    setTimeout(() => {
      successEl.style.display = "none";
    }, 3000);
  }
}

// Authentication Handlers
async function handleLogin(e: Event): Promise<void> {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const email = (form.querySelector("#login-email") as HTMLInputElement).value;
  const password = (form.querySelector("#login-password") as HTMLInputElement)
    .value;

  try {
    const result = await authClient.login({ email, password });
    currentUser = result.user;
    updateDashboard();
    showView("dashboard-view");
    showSuccess("Login successful!");
  } catch (error) {
    showError((error as Error).message);
  }
}

async function handleRegister(e: Event): Promise<void> {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const email = (form.querySelector("#register-email") as HTMLInputElement)
    .value;
  const password = (
    form.querySelector("#register-password") as HTMLInputElement
  ).value;
  const displayName = (form.querySelector("#register-name") as HTMLInputElement)
    .value;

  try {
    await authClient.register({ email, password, displayName });
    showSuccess(
      "Registration successful! Please check your email to verify your account."
    );
    showView("login-view");
  } catch (error) {
    showError((error as Error).message);
  }
}

async function handleLogout(): Promise<void> {
  try {
    await authClient.logout();
    currentUser = null;
    showView("login-view");
    showSuccess("Logged out successfully");
  } catch (error) {
    showError((error as Error).message);
  }
}

// Dashboard Functions
function updateDashboard(): void {
  if (!currentUser) return;

  const userNameEl = document.getElementById("user-name");
  const userEmailEl = document.getElementById("user-email");
  const userStatusEl = document.getElementById("user-status");

  if (userNameEl) userNameEl.textContent = currentUser.displayName;
  if (userEmailEl) userEmailEl.textContent = currentUser.email;
  if (userStatusEl) {
    userStatusEl.textContent = currentUser.emailVerified
      ? "Verified"
      : "Not Verified";
    userStatusEl.className = currentUser.emailVerified
      ? "status-verified"
      : "status-unverified";
  }
}

async function loadPermissions(): Promise<void> {
  if (!currentUser) return;

  const permissionsEl = document.getElementById("permissions-list");
  if (!permissionsEl) return;

  try {
    const { permissions } = await authClient.getUserPermissions(currentUser.id);

    permissionsEl.innerHTML =
      permissions.length > 0
        ? permissions
            .map(
              (p) => `
          <div class="permission-item ${p.granted ? "granted" : "denied"}">
            <span class="permission-name">${p.name}</span>
            <span class="permission-status">${p.granted ? "✓" : "✗"}</span>
          </div>
        `
            )
            .join("")
        : "<p>No permissions assigned</p>";
  } catch (error) {
    permissionsEl.innerHTML = '<p class="error">Failed to load permissions</p>';
  }
}

// Initialize App
async function initApp(): Promise<void> {
  // Check if user is already logged in
  if (authClient.isAuthenticated()) {
    try {
      const { user } = await authClient.getMe();
      currentUser = user;
      updateDashboard();
      showView("dashboard-view");
    } catch {
      // Token invalid or expired
      showView("login-view");
    }
  } else {
    showView("login-view");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  // Login form
  document
    .getElementById("login-form")
    ?.addEventListener("submit", handleLogin);

  // Register form
  document
    .getElementById("register-form")
    ?.addEventListener("submit", handleRegister);

  // Navigation
  document
    .getElementById("show-register")
    ?.addEventListener("click", () => showView("register-view"));
  document
    .getElementById("show-login")
    ?.addEventListener("click", () => showView("login-view"));
  document
    .getElementById("logout-btn")
    ?.addEventListener("click", handleLogout);
  document.getElementById("view-permissions")?.addEventListener("click", () => {
    showView("permissions-view");
    loadPermissions();
  });
  document
    .getElementById("back-to-dashboard")
    ?.addEventListener("click", () => showView("dashboard-view"));

  // Initialize
  initApp();
});
