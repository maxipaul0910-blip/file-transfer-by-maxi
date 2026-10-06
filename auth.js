const AUTH0_CONFIG = {
  domain: 'YOUR_AUTH0_DOMAIN',
  clientId: 'YOUR_AUTH0_CLIENT_ID',
  redirectUri: window.location.origin + window.location.pathname
};

const auth0Client = window.auth0 ? null : null;

async function initAuth0() {
  if (!window.auth0) {
    console.error('Auth0 script failed to load.');
    return;
  }

  const client = await window.auth0.createAuth0Client({
    domain: AUTH0_CONFIG.domain,
    clientId: AUTH0_CONFIG.clientId,
    authorizationParams: {
      redirect_uri: AUTH0_CONFIG.redirectUri,
      scope: 'openid profile email'
    }
  });

  window.auth0Client = client;

  try {
    if (window.location.search.includes('code=') || window.location.hash.includes('error=')) {
      await client.handleRedirectCallback();
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const user = await client.getUser();
    if (user) {
      setCurrentUser({
        name: user.name || user.nickname || 'GitHub User',
        email: user.email || 'user@example.com',
        avatar: user.picture || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.name || 'User')
      });
    }
  } catch (error) {
    console.error('Auth0 callback error:', error);
  }
}

async function loginWithConnection(connection) {
  if (!window.auth0Client) {
    console.error('Auth0 client not initialized yet.');
    return;
  }

  await window.auth0Client.loginWithRedirect({
    authorizationParams: {
      connection,
      redirect_uri: AUTH0_CONFIG.redirectUri
    }
  });
}

async function logoutFromAuth() {
  if (!window.auth0Client) {
    localStorage.removeItem('currentUser');
    updateUI();
    return;
  }

  await window.auth0Client.logout({
    logoutParams: {
      returnTo: AUTH0_CONFIG.redirectUri
    }
  });

  localStorage.removeItem('currentUser');
  updateUI();
}

const authToggleBtn = document.getElementById('auth-toggle-btn');
const authModal = document.getElementById('auth-modal');
const closeAuthModalBtn = document.getElementById('close-auth-modal');
const googleLoginBtn = document.getElementById('google-login');
const githubLoginBtn = document.getElementById('github-login');
const profileToggleBtn = document.getElementById('profile-toggle-btn');
const profileMenu = document.getElementById('profile-menu');
const logoutBtn = document.getElementById('logout-btn');

function getCurrentUser() {
  const userJSON = localStorage.getItem('currentUser');
  return userJSON ? JSON.parse(userJSON) : null;
}

function setCurrentUser(user) {
  localStorage.setItem('currentUser', JSON.stringify(user));
  updateUI();
}

function updateUI() {
  const user = getCurrentUser();

  if (user) {
    authToggleBtn.classList.add('hidden');
    profileToggleBtn.classList.remove('hidden');
    document.getElementById('user-avatar').src = user.avatar;
    document.getElementById('profile-name').textContent = user.name;
    document.getElementById('profile-email').textContent = user.email;
    document.getElementById('profile-avatar').src = user.avatar;
  } else {
    authToggleBtn.classList.remove('hidden');
    profileToggleBtn.classList.add('hidden');
    profileMenu.classList.add('hidden');
  }
}

authToggleBtn.addEventListener('click', () => {
  authModal.classList.remove('hidden');
});

closeAuthModalBtn.addEventListener('click', () => {
  authModal.classList.add('hidden');
});

authModal.addEventListener('click', (e) => {
  if (e.target === authModal) {
    authModal.classList.add('hidden');
  }
});

googleLoginBtn.addEventListener('click', async () => {
  authModal.classList.add('hidden');
  await loginWithConnection('google-oauth2');
});

githubLoginBtn.addEventListener('click', async () => {
  authModal.classList.add('hidden');
  await loginWithConnection('github');
});

profileToggleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  profileMenu.classList.toggle('hidden');
});

document.addEventListener('click', () => {
  profileMenu.classList.add('hidden');
});

logoutBtn.addEventListener('click', async () => {
  await logoutFromAuth();
  profileMenu.classList.add('hidden');
});

initAuth0();
updateUI();
