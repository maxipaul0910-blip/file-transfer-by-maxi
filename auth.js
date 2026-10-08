const authToggleBtn = document.getElementById("auth-toggle-btn");
const authModal = document.getElementById("auth-modal");
const closeAuthModalBtn = document.getElementById("close-auth-modal");
const googleLoginBtn = document.getElementById("google-login");
const githubLoginBtn = document.getElementById("github-login");
const profileToggleBtn = document.getElementById("profile-toggle-btn");
const profileMenu = document.getElementById("profile-menu");
const logoutBtn = document.getElementById("logout-btn");
const authError = document.getElementById("auth-error");

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

function updateUI() {
  if (currentUser) {
    authToggleBtn.classList.add("hidden");
    profileToggleBtn.classList.remove("hidden");
    document.getElementById("user-avatar").src = currentUser.picture || "";
    document.getElementById("profile-name").textContent =
      currentUser.name || currentUser.nickname || "User";
    document.getElementById("profile-email").textContent = currentUser.email || "";
    document.getElementById("profile-avatar").src = currentUser.picture || "";
  } else {
    authToggleBtn.classList.remove("hidden");
    profileToggleBtn.classList.add("hidden");
    profileMenu.classList.add("hidden");
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

updateUI();
initAuth0();
