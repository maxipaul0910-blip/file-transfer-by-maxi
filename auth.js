const authToggleBtn = document.getElementById("auth-toggle-btn");
const authModal = document.getElementById("auth-modal");
const closeAuthModalBtn = document.getElementById("close-auth-modal");
const googleLoginBtn = document.getElementById("google-login");
const githubLoginBtn = document.getElementById("github-login");
const profileToggleBtn = document.getElementById("profile-toggle-btn");
const profileMenu = document.getElementById("profile-menu");
const logoutBtn = document.getElementById("logout-btn");
const authError = document.getElementById("auth-error");
const accountModal = document.getElementById("account-modal");
const accountFeedback = document.getElementById("account-feedback");

const AUTH0_CONFIG = {
  domain: "dev-1f0dklchqlhbqxcy.us.auth0.com",
  clientId: "aoPKSPkKMnUqVXAcbkQE6l3YcKGJuePi",
};
const redirectUri = window.location.origin + window.location.pathname;
let auth0Client = null;
let currentUser = null;

function showAuthError(message) {
  authError.textContent = message;
  authError.classList.remove("hidden");
}

function clearAuthError() {
  authError.textContent = "";
  authError.classList.add("hidden");
}

function getUploadsSummary() {
  try {
    const uploads = JSON.parse(localStorage.getItem("transferflow_uploads") || "[]");
    if (!Array.isArray(uploads)) {
      throw new TypeError("Saved uploads must be an array.");
    }
    return {
      count: uploads.length,
      size: uploads.reduce((total, upload) => {
        const size = Number(upload?.size);
        return total + (Number.isFinite(size) && size > 0 ? size : 0);
      }, 0),
    };
  } catch (error) {
    console.error("Could not read saved uploads:", error);
    return null;
  }
}

function formatFileSize(size) {
  if (size === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** unitIndex;
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function describeUploads(summary) {
  if (!summary) return "Upload details unavailable";
  const fileLabel = summary.count === 1 ? "file" : "files";
  return `${summary.count} ${fileLabel} · ${formatFileSize(summary.size)}`;
}

function updateUploadSummary() {
  const summary = describeUploads(getUploadsSummary());
  document.getElementById("profile-upload-count").textContent = summary;
  document.getElementById("account-upload-summary").textContent = summary;
}

function getProviderName(user) {
  const provider = user.sub?.split("|", 1)[0];
  if (provider === "google-oauth2") return "Google";
  if (provider === "github") return "GitHub";
  return provider ? "Auth0" : "Signed in";
}

function updateUI() {
  if (currentUser) {
    authToggleBtn.classList.add("hidden");
    profileToggleBtn.classList.remove("hidden");
    document.getElementById("user-avatar").src = currentUser.picture || "";
    document.getElementById("profile-name").textContent =
      currentUser.name || currentUser.nickname || "User";
    document.getElementById("profile-email").textContent = currentUser.email || "";
    document.getElementById("profile-avatar").src = currentUser.picture || "";
    document.getElementById("account-name").textContent =
      currentUser.name || currentUser.nickname || "User";
    document.getElementById("account-email").textContent = currentUser.email || "No email provided";
    document.getElementById("account-email-status").textContent = currentUser.email
      ? currentUser.email_verified
        ? "Verified"
        : "Not verified"
      : "Not provided";
    document.getElementById("account-provider").textContent =
      `Signed in with ${getProviderName(currentUser)}`;
    document.getElementById("account-avatar").src = currentUser.picture || "";
    document.getElementById("account-avatar").alt =
      currentUser.name ? `${currentUser.name}'s profile` : "Profile";
    updateUploadSummary();
  } else {
    authToggleBtn.classList.remove("hidden");
    profileToggleBtn.classList.add("hidden");
    profileMenu.classList.add("hidden");
    accountModal.classList.add("hidden");
  }
}

function getConfigurationError() {
  if (
    !AUTH0_CONFIG.domain.trim() ||
    !AUTH0_CONFIG.clientId.trim()
  ) {
    return "Sign-in is not configured. Check the Auth0 settings in auth.js.";
  }
  return null;
}

function cleanCallbackUrl() {
  window.history.replaceState({}, document.title, redirectUri);
}

async function initAuth0() {
  const configurationError = getConfigurationError();
  if (configurationError) {
    showAuthError(configurationError);
    return;
  }
  if (!window.auth0?.createAuth0Client) {
    showAuthError("The sign-in service could not load. Check your connection and reload.");
    return;
  }

  try {
    auth0Client = await window.auth0.createAuth0Client({
      domain: AUTH0_CONFIG.domain,
      clientId: AUTH0_CONFIG.clientId,
      authorizationParams: {
        redirect_uri: redirectUri,
        scope: "openid profile email",
      },
    });

    const callbackUrl = new URL(window.location.href);
    if (callbackUrl.searchParams.has("error")) {
      const message =
        callbackUrl.searchParams.get("error_description") ||
        callbackUrl.searchParams.get("error") ||
        "Sign-in was cancelled.";
      cleanCallbackUrl();
      authModal.classList.remove("hidden");
      showAuthError(message);
    } else if (callbackUrl.searchParams.has("code") && callbackUrl.searchParams.has("state")) {
      try {
        await auth0Client.handleRedirectCallback();
        cleanCallbackUrl();
      } catch (error) {
        cleanCallbackUrl();
        console.error("Sign-in callback failed:", error);
        authModal.classList.remove("hidden");
        showAuthError("Sign-in could not be completed. Please try again.");
      }
    }

    currentUser = await auth0Client.getUser();
    updateUI();
  } catch (error) {
    console.error("Could not initialize sign-in:", error);
    showAuthError("Sign-in could not be initialized. Check your Auth0 settings and reload.");
  }
}

async function loginWithConnection(connection) {
  const configurationError = getConfigurationError();
  if (configurationError) {
    showAuthError(configurationError);
    return;
  }
  if (!auth0Client) {
    showAuthError("Sign-in is still loading or unavailable. Please reload and try again.");
    return;
  }

  clearAuthError();
  await auth0Client.loginWithRedirect({
    authorizationParams: {
      connection,
      redirect_uri: redirectUri,
    },
  });
}

async function handleLogin(connection, button) {
  button.disabled = true;
  try {
    await loginWithConnection(connection);
  } catch (error) {
    console.error("Could not start sign-in:", error);
    showAuthError("Could not start sign-in. Check your connection and Auth0 provider settings.");
  } finally {
    button.disabled = false;
  }
}

async function logoutFromAuth() {
  if (!auth0Client) {
    authModal.classList.remove("hidden");
    showAuthError("Sign-in is unavailable, so you could not be signed out. Reload and try again.");
    return;
  }

  try {
    await auth0Client.logout({
      logoutParams: { returnTo: redirectUri },
    });
  } catch (error) {
    console.error("Could not sign out:", error);
    authModal.classList.remove("hidden");
    showAuthError("Could not sign out. Please try again.");
  }
}

authToggleBtn.addEventListener("click", () => {
  authModal.classList.remove("hidden");
});

closeAuthModalBtn.addEventListener("click", () => {
  authModal.classList.add("hidden");
});

authModal.addEventListener("click", (event) => {
  if (event.target === authModal) {
    authModal.classList.add("hidden");
  }
});

googleLoginBtn.addEventListener("click", () => handleLogin("google-oauth2", googleLoginBtn));
githubLoginBtn.addEventListener("click", () => handleLogin("github", githubLoginBtn));

profileToggleBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  profileMenu.classList.toggle("hidden");
});

document.addEventListener("click", () => {
  profileMenu.classList.add("hidden");
});

logoutBtn.addEventListener("click", logoutFromAuth);

function openAccountDetails() {
  if (!currentUser) return;
  updateUploadSummary();
  accountFeedback.textContent = "";
  profileMenu.classList.add("hidden");
  accountModal.classList.remove("hidden");
  document.getElementById("close-account-modal").focus();
}

function openMyUploads() {
  profileMenu.classList.add("hidden");
  accountModal.classList.add("hidden");
  document.querySelector('.tab[data-tab="uploaded"]').click();
  document.getElementById("files").scrollIntoView({ behavior: "smooth" });
}

document.getElementById("profile-details-btn").addEventListener("click", openAccountDetails);
document.getElementById("close-account-modal").addEventListener("click", () => {
  accountModal.classList.add("hidden");
  profileToggleBtn.focus();
});
accountModal.addEventListener("click", (event) => {
  if (event.target === accountModal) {
    accountModal.classList.add("hidden");
    profileToggleBtn.focus();
  }
});
document.getElementById("profile-uploads-btn").addEventListener("click", openMyUploads);
document.getElementById("account-uploads-btn").addEventListener("click", openMyUploads);
document.getElementById("copy-account-email-btn").addEventListener("click", async () => {
  if (!currentUser?.email) {
    accountFeedback.textContent = "There is no email address on this account to copy.";
    return;
  }
  try {
    await navigator.clipboard.writeText(currentUser.email);
    accountFeedback.textContent = "Email copied to clipboard.";
  } catch (error) {
    console.error("Could not copy account email:", error);
    accountFeedback.textContent = "Could not copy email. Check clipboard permission and try again.";
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !accountModal.classList.contains("hidden")) {
    accountModal.classList.add("hidden");
    profileToggleBtn.focus();
  }
});

updateUI();
initAuth0();
