// Auth Management
const authToggleBtn = document.getElementById('auth-toggle-btn');
const authModal = document.getElementById('auth-modal');
const closeAuthModalBtn = document.getElementById('close-auth-modal');
const googleLoginBtn = document.getElementById('google-login');
const githubLoginBtn = document.getElementById('github-login');
const profileToggleBtn = document.getElementById('profile-toggle-btn');
const profileMenu = document.getElementById('profile-menu');
const logoutBtn = document.getElementById('logout-btn');

// Mock user data
const mockUsers = {
  google: {
    name: 'Alex Rivera',
    email: 'alex.rivera@gmail.com',
    avatar: 'https://i.pravatar.cc/150?img=12'
  },
  github: {
    name: 'maxipaul0910',
    email: 'maxi.paul0910@github.com',
    avatar: 'https://i.pravatar.cc/150?img=33'
  }
};

// Get current user from localStorage
function getCurrentUser() {
  const userJSON = localStorage.getItem('currentUser');
  return userJSON ? JSON.parse(userJSON) : null;
}

// Set current user
function setCurrentUser(user) {
  localStorage.setItem('currentUser', JSON.stringify(user));
  updateUI();
}

// Update UI based on auth state
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

// Open/close auth modal
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

// Google login
googleLoginBtn.addEventListener('click', () => {
  setCurrentUser(mockUsers.google);
  authModal.classList.add('hidden');
});

// GitHub login
githubLoginBtn.addEventListener('click', () => {
  setCurrentUser(mockUsers.github);
  authModal.classList.add('hidden');
});

// Toggle profile menu
profileToggleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  profileMenu.classList.toggle('hidden');
});

// Close profile menu when clicking outside
document.addEventListener('click', () => {
  profileMenu.classList.add('hidden');
});

// Logout
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('currentUser');
  updateUI();
  profileMenu.classList.add('hidden');
});

// Initialize UI on page load
updateUI();
