const repoList = document.getElementById("repo-list");
const uploadedList = document.getElementById("uploaded-list");
const uploadForm = document.getElementById("upload-form");
const fileInput = document.getElementById("file-input");
const uploadMessage = document.getElementById("upload-message");
const uploadQueue = document.getElementById("upload-queue");
const tabs = [...document.querySelectorAll(".tab")];
const FILEBIN_ORIGIN = "https://filebin.net";
const APP_ROOT = new URL(document.body.classList.contains("dashboard-page") ? "../" : "./", window.location.href);
const DEFAULT_SETTINGS = {
  defaultView: "repo",
  sort: "date-desc",
  showSize: true,
  concurrency: 3,
  gradientStart: "#17b77d",
  gradientEnd: "#42d0a2",
  senderNickname: "",
};

const state = {
  repoFiles: [],
  uploads: [],
  user: window.floAuthUser || null,
  owner: "anonymous",
  settings: { ...DEFAULT_SETTINGS },
};

function formatSize(size) {
  if (!Number.isFinite(Number(size)) || Number(size) <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(Number(size)) / Math.log(1024)), units.length - 1);
  const value = Number(size) / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function currentUploadsKey() {
  return state.user?.sub
    ? `transferflow_uploads:${encodeURIComponent(state.user.sub)}`
    : "transferflow_uploads";
}

function settingsKey() {
  return `transferflow_settings:${state.user?.sub ? encodeURIComponent(state.user.sub) : "anonymous"}`;
}

function readArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.warn(`Could not read ${key}:`, error);
    return [];
  }
}

function saveUploads() {
  localStorage.setItem(currentUploadsKey(), JSON.stringify(state.uploads));
}

function saveSettings() {
  localStorage.setItem(settingsKey(), JSON.stringify(state.settings));
  applyGradientSettings();
}

function normalizeHexColor(value, fallback) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function normalizeSenderNickname(value) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
}

function colorChannels(hex) {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
}

function blendColor(color, base, colorWeight) {
  const colorRgb = colorChannels(color);
  const baseRgb = colorChannels(base);
  return `rgb(${colorRgb.map((channel, index) => Math.round(channel * colorWeight + baseRgb[index] * (1 - colorWeight))).join(" ")})`;
}

function applyGradientSettings() {
  const start = state.settings.gradientStart;
  const end = state.settings.gradientEnd;
  const root = document.documentElement;
  root.style.setProperty("--gradient-glow-start", `rgba(${colorChannels(start).join(", ")}, 0.2)`);
  root.style.setProperty("--gradient-glow-end", `rgba(${colorChannels(end).join(", ")}, 0.14)`);
  root.style.setProperty("--gradient-base-start", blendColor(start, "#041c17", 0.42));
  root.style.setProperty("--gradient-base-end", blendColor(end, "#031611", 0.28));
  root.style.setProperty("--color-start", state.settings.gradientStart);
  root.style.setProperty("--color-end", state.settings.gradientEnd);
  const preview = document.getElementById("setting-gradient-preview");
  if (preview) preview.style.background = `linear-gradient(120deg, ${start}, ${end})`;
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey()) || "{}");
    state.settings = { ...DEFAULT_SETTINGS, ...(saved && typeof saved === "object" ? saved : {}) };
  } catch (error) {
    state.settings = { ...DEFAULT_SETTINGS };
  }
  if (!["repo", "uploaded"].includes(state.settings.defaultView)) state.settings.defaultView = DEFAULT_SETTINGS.defaultView;
  if (!["date-desc", "date-asc", "name-asc", "name-desc", "size-desc", "size-asc"].includes(state.settings.sort)) state.settings.sort = DEFAULT_SETTINGS.sort;
  state.settings.showSize = state.settings.showSize !== false;
  state.settings.gradientStart = normalizeHexColor(state.settings.gradientStart, DEFAULT_SETTINGS.gradientStart);
  state.settings.gradientEnd = normalizeHexColor(state.settings.gradientEnd, DEFAULT_SETTINGS.gradientEnd);
  state.settings.senderNickname = normalizeSenderNickname(state.settings.senderNickname);
  if (![1, 2, 3].includes(Number(state.settings.concurrency))) state.settings.concurrency = DEFAULT_SETTINGS.concurrency;
  else state.settings.concurrency = Number(state.settings.concurrency);
  const defaultView = document.getElementById("setting-default-view");
  const settingSort = document.getElementById("setting-sort");
  const concurrency = document.getElementById("setting-concurrency");
  const showSize = document.getElementById("setting-show-size");
  const gradientStart = document.getElementById("setting-gradient-start");
  const gradientEnd = document.getElementById("setting-gradient-end");
  const profileNameInput = document.getElementById("profile-name-input");
  const uploadSort = document.getElementById("upload-sort");
  if (defaultView) defaultView.value = state.settings.defaultView;
  if (settingSort) settingSort.value = state.settings.sort;
  if (concurrency) concurrency.value = String(state.settings.concurrency);
  if (showSize) showSize.checked = state.settings.showSize;
  if (gradientStart) gradientStart.value = state.settings.gradientStart;
  if (gradientEnd) gradientEnd.value = state.settings.gradientEnd;
  if (profileNameInput) profileNameInput.value = state.settings.senderNickname;
  if (uploadSort) uploadSort.value = state.settings.sort;
  applyGradientSettings();
}

async function makeBrandedShareUrl(file, downloadUrl) {
  const shareUrl = new URL("share.html", APP_ROOT);
  shareUrl.searchParams.set("url", downloadUrl);
  shareUrl.searchParams.set("name", file.name);
  shareUrl.searchParams.set("size", String(file.size));
  shareUrl.searchParams.set("type", file.type || "application/octet-stream");
  // The sender name is self-reported and unverified (no backend to authenticate it),
  // so it is only ever displayed as "Shared by (self-reported)" on the share page.
  const senderName = normalizeSenderNickname(state.settings.senderNickname) || "Anonymous sender";
  shareUrl.searchParams.set("from", senderName);
  return shareUrl.href;
}

function safeHref(value) {
  try {
    const url = new URL(value || "#", window.location.href);
    return url.origin === window.location.origin || url.protocol === "https:" ? url.href : "#";
  } catch (error) {
    return "#";
  }
}

function appendActionButton(container, label, onClick, className = "secondary-btn compact-btn") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  container.appendChild(button);
  return button;
}

async function copyText(text, feedback) {
  try {
    await navigator.clipboard.writeText(text);
    feedback.textContent = "Link copied.";
    return true;
  } catch (error) {
    feedback.textContent = "Could not copy the link. Select and copy it manually.";
    return false;
  }
}

function appendGlassCopyButton(container, href, feedback) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "glass-plaque-btn copy-link-btn";
  button.setAttribute("aria-label", "Copy share link");
  button.innerHTML = '<span class="glass-plaque-frame" aria-hidden="true"></span><span class="glass-plaque-text">Copy link</span><span class="glass-plaque-text glass-plaque-success">Address copied</span><i class="glass-plaque-point top left" aria-hidden="true"></i><i class="glass-plaque-point top right" aria-hidden="true"></i><i class="glass-plaque-point bottom left" aria-hidden="true"></i><i class="glass-plaque-point bottom right" aria-hidden="true"></i>';
  button.addEventListener("click", async () => {
    if (await copyText(href, feedback)) {
      button.classList.add("copied");
      window.setTimeout(() => button.classList.remove("copied"), 1800);
    }
  });
  container.appendChild(button);
}

function createCard(item, type) {
  const card = document.createElement("article");
  card.className = "file-card";

  const header = document.createElement("div");
  header.className = "file-card-header";
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = type === "repo" ? "Repo" : "Upload";
  header.appendChild(badge);

  const name = document.createElement("h3");
  name.className = "file-name";
  name.textContent = item.name || item.originalName || "Unnamed file";

  const metadata = document.createElement("p");
  metadata.className = "file-meta";
  const date = item.createdAt ? new Date(item.createdAt).toLocaleString() : "Date unavailable";
  metadata.textContent = `${state.settings.showSize ? `${formatSize(item.size)} · ` : ""}${item.type || "application/octet-stream"}${type === "upload" ? ` · ${date}` : ""}`;

  const actions = document.createElement("div");
  actions.className = "file-actions";
  const href = safeHref(type === "upload"
    ? item.shareUrl || item.url || `./share.html?file=${encodeURIComponent(item.id)}`
    : item.url || item.downloadUrl || item.path || "#");
  const openLink = document.createElement("a");
  openLink.className = "file-link";
  openLink.href = href;
  openLink.target = "_blank";
  openLink.rel = "noopener noreferrer";
  openLink.textContent = "Open";
  actions.appendChild(openLink);

  const feedback = document.createElement("p");
  feedback.className = "card-feedback";
  feedback.setAttribute("role", "status");

  if (type === "upload") {
    appendGlassCopyButton(actions, href, feedback);
    if (item.isHtml) {
      appendActionButton(actions, "Open as site", () => {
        window.open(item.webShareUrl || href, "_blank", "noopener");
      }, "secondary-btn compact-btn open-site-btn");
    }
    appendActionButton(actions, "Share", async () => {
      if (navigator.share) {
        try { await navigator.share({ title: item.name || "Shared file", text: "File shared with FloFileTransfer", url: href }); }
        catch (error) { if (error.name !== "AbortError") copyText(href, feedback); }
      } else copyText(href, feedback);
    }, "secondary-btn compact-btn share-file-btn");
    appendActionButton(actions, item.favorite ? "★ Favorited" : "☆ Favorite", () => {
      item.favorite = !item.favorite;
      persistAndRender();
    }, "secondary-btn compact-btn favorite-button");
  }

  card.append(header, name, metadata, actions);
  if (type === "upload") {
    const details = document.createElement("div");
    details.className = "file-personal-details";
    const tagInput = document.createElement("input");
    tagInput.type = "text";
    tagInput.maxLength = 160;
    tagInput.value = Array.isArray(item.tags) ? item.tags.join(", ") : "";
    tagInput.placeholder = "Tags, separated by commas";
    tagInput.setAttribute("aria-label", `Tags for ${item.name}`);
    tagInput.addEventListener("change", () => {
      item.tags = [...new Set(tagInput.value.split(",").map((tag) => tag.trim()).filter(Boolean))];
      persistAndRender();
    });
    const note = document.createElement("textarea");
    note.maxLength = 2000;
    note.rows = 2;
    note.value = item.note || "";
    note.placeholder = "Private note (stored only in this browser)";
    note.setAttribute("aria-label", `Private note for ${item.name}`);
    note.addEventListener("change", () => {
      item.note = note.value;
      persistAndRender();
    });
    details.append(tagInput, note);
    card.appendChild(details);

    const linkText = document.createElement("p");
    linkText.className = "share-url-text";
    linkText.textContent = href;
    card.appendChild(linkText);
    card.appendChild(feedback);
    appendActionButton(actions, "Remove from history", () => {
      if (!window.confirm(`Remove “${item.name || item.originalName || "this file"}” from the local upload history? The Filebin-hosted file and public download link will remain until Filebin expires or removes it. The local entry cannot be restored unless you have an export.`)) return;
      state.uploads = state.uploads.filter((upload) => upload.id !== item.id);
      persistAndRender();
    }, "text-button danger-button");
  }
  return card;
}

function renderRepoFiles(files) {
  repoList.replaceChildren();
  if (!files.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No repo files available yet.";
    repoList.appendChild(empty);
    return;
  }
  files.forEach((file) => repoList.appendChild(createCard(file, "repo")));
}

function filteredUploads() {
  const query = document.getElementById("upload-search")?.value.trim().toLocaleLowerCase() || "";
  const selectedTag = document.getElementById("upload-tag-filter")?.value || "";
  const favoritesOnly = document.getElementById("favorites-only")?.checked || false;
  const sort = document.getElementById("upload-sort")?.value || state.settings.sort;
  const results = state.uploads.filter((item) => {
    const name = String(item.name || item.originalName || "").toLocaleLowerCase();
    const tags = Array.isArray(item.tags) ? item.tags : [];
    return name.includes(query) && (!favoritesOnly || item.favorite) && (!selectedTag || tags.includes(selectedTag));
  });
  const [field, direction] = sort.split("-");
  results.sort((a, b) => {
    let comparison = 0;
    if (field === "date") comparison = new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    if (field === "name") comparison = String(a.name || a.originalName || "").localeCompare(String(b.name || b.originalName || ""));
    if (field === "size") comparison = (Number(a.size) || 0) - (Number(b.size) || 0);
    return direction === "desc" ? -comparison : comparison;
  });
  return results;
}

function refreshTagFilter() {
  const select = document.getElementById("upload-tag-filter");
  if (!select) return;
  const selected = select.value;
  const tags = [...new Set(state.uploads.flatMap((item) => Array.isArray(item.tags) ? item.tags : []))].sort((a, b) => a.localeCompare(b));
  select.replaceChildren(new Option("All tags", ""));
  tags.forEach((tag) => select.add(new Option(tag, tag)));
  select.value = tags.includes(selected) ? selected : "";
}

function renderUploads() {
  refreshTagFilter();
  uploadedList.replaceChildren();
  const files = filteredUploads();
  if (!files.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = state.uploads.length
      ? "No uploads match these filters."
      : "No uploaded files yet. Use the form above to add one.";
    uploadedList.appendChild(empty);
  } else {
    files.forEach((file) => uploadedList.appendChild(createCard(file, "upload")));
  }
  renderDashboard();
}

function persistAndRender() {
  try {
    saveUploads();
  } catch (error) {
    uploadMessage.textContent = "Your change is visible, but the browser could not save it.";
  }
  renderUploads();
  updateProfileSummary();
}

function updateProfileSummary() {
  const total = state.uploads.reduce((sum, item) => sum + (Number(item.size) > 0 ? Number(item.size) : 0), 0);
  const summary = `${state.uploads.length} ${state.uploads.length === 1 ? "file" : "files"} · ${formatSize(total)}`;
  const count = document.getElementById("profile-upload-count");
  const account = document.getElementById("account-upload-summary");
  if (count) count.textContent = summary;
  if (account) account.textContent = summary;
}

function renderSidebarRoles() {
  const rolesEl = document.getElementById("sidebar-user-roles");
  if (!rolesEl) return;
  const roles = Array.isArray(window.floUserRoles) ? window.floUserRoles : [];
  rolesEl.replaceChildren();
  roles.slice(0, 4).forEach((role) => {
    const name = (role && role.name) || "";
    if (!name) return;
    const badge = document.createElement("span");
    const normalized = name.toLocaleLowerCase();
    badge.className = "sidebar-role-badge";
    if (normalized === "owner") badge.classList.add("role-owner");
    else if (normalized === "admin") badge.classList.add("role-admin");
    else if (normalized.includes("beta")) badge.classList.add("role-beta");
    badge.textContent = name.slice(0, 24);
    rolesEl.appendChild(badge);
  });
  rolesEl.classList.toggle("hidden", rolesEl.childElementCount === 0);
}

function updateSidebarIdentity() {
  const nameEl = document.getElementById("sidebar-user-name");
  const nickEl = document.getElementById("sidebar-user-nick");
  if (!nameEl || !nickEl) return;
  const user = state.user;
  const accountName = (user && (user.name || user.nickname)) || window.floDisplayName || "";
  const nick = normalizeSenderNickname(state.settings && state.settings.senderNickname);
  const primary = accountName || nick || "User";
  nameEl.textContent = primary;
  const showNick = Boolean(nick) && nick.toLowerCase() !== primary.toLowerCase();
  nickEl.textContent = showNick ? nick : "";
  nickEl.classList.toggle("hidden", !showNick);
}

function renderDashboard() {
  const dashboard = document.getElementById("dashboard");
  const settingsSection = document.getElementById("settings");
  if (!dashboard) return;
  dashboard.classList.remove("hidden");
  settingsSection?.classList.remove("hidden");
  document.getElementById("upload-tools")?.classList.toggle("hidden", !state.user);
  const user = state.user;
  document.querySelectorAll(".profile-account-only").forEach((element) => element.classList.toggle("hidden", !user));
  const profileName = normalizeSenderNickname(state.settings.senderNickname);
  const displayName = profileName || user?.name || user?.nickname || "Guest profile";
  document.getElementById("dashboard-name").textContent = displayName;
  document.getElementById("dashboard-email").textContent = user?.email || (profileName ? "Guest profile · saved in this browser" : "Set a profile name in settings");
  const provider = user?.sub?.split("|", 1)[0];
  const providerElement = document.getElementById("dashboard-provider");
  const emailStatusElement = document.getElementById("dashboard-email-status");
  if (providerElement) providerElement.textContent = provider === "google-oauth2"
    ? "Google"
    : provider === "github"
      ? "GitHub"
      : provider
        ? "Auth0"
        : "Signed in";
  if (emailStatusElement) emailStatusElement.textContent = user?.email
    ? user.email_verified ? "Verified" : "Not verified"
    : "Not provided";
  const avatar = document.getElementById("dashboard-avatar");
  avatar.src = user?.picture || "";
  avatar.alt = `${displayName}'s profile`;
  avatar.classList.toggle("hidden", !user?.picture);
  window.floDisplayName = displayName;
  const profileMenuName = document.getElementById("profile-name");
  if (profileMenuName && user) profileMenuName.textContent = displayName;
  const total = state.uploads.reduce((sum, item) => sum + (Number(item.size) > 0 ? Number(item.size) : 0), 0);
  document.getElementById("dashboard-count").textContent = String(state.uploads.length);
  document.getElementById("dashboard-size").textContent = formatSize(total);
  const favorites = state.uploads.filter((item) => item.favorite);
  document.getElementById("dashboard-favorites").textContent = String(favorites.length);
  const recent = [...state.uploads].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);
  renderDashboardList("dashboard-recent", recent, "No uploads yet.");
  renderDashboardList("dashboard-favorite-list", favorites.slice(0, 5), "No favorites yet.");
  const requestedSection = window.location.hash.slice(1);
  const destination = ["settings", "files"].includes(requestedSection)
    ? document.getElementById(requestedSection)
    : dashboard;
  if (requestedSection === "dashboard" || document.body.classList.contains("dashboard-page")) {
    window.setTimeout(() => destination?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }
}

function renderDashboardList(id, files, emptyText) {
  const container = document.getElementById(id);
  container.replaceChildren();
  if (!files.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state compact-empty";
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }
  files.forEach((file) => {
    const row = document.createElement("div");
    row.className = "dashboard-file-row";
    const name = document.createElement("span");
    name.textContent = file.name || file.originalName || "Unnamed file";
    const link = document.createElement("a");
    link.href = safeHref(file.shareUrl || file.url || "#");
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open";
    row.append(name, link);
    container.appendChild(row);
  });
}

async function loadRepoFiles() {
  try {
    const response = await fetch(new URL("repo-files/index.json", APP_ROOT));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.repoFiles = Array.isArray(data) ? data : [];
  } catch (error) {
    state.repoFiles = [];
  }
  renderRepoFiles(state.repoFiles);
}

function setActiveTab(target) {
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === target));
  repoList.classList.toggle("active", target === "repo");
  uploadedList.classList.toggle("active", target === "uploaded");
}

function renderQueue(entries) {
  uploadQueue.replaceChildren();
  entries.forEach(({ file, status, link }) => {
    const row = document.createElement("div");
    row.className = `upload-queue-row status-${status}`;
    const label = document.createElement("span");
    label.textContent = `${file.name} · ${formatSize(file.size)}`;
    const stateLabel = document.createElement("span");
    stateLabel.textContent = status === "queued" ? "Waiting" : status === "uploading" ? "Uploading…" : status === "success" ? "Uploaded" : entry.errorMessage || "Upload failed";
    row.append(label, stateLabel);
    if (link) {
      const anchor = document.createElement("a");
      anchor.href = link;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.textContent = "Open link";
      row.appendChild(anchor);
    }
    uploadQueue.appendChild(row);
  });
}

function fileExtension(name) {
  const dot = String(name || "").lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase().slice(0, 4) : "";
}

function renderFilePreview() {
  const preview = document.getElementById("file-preview");
  const list = document.getElementById("file-preview-list");
  const summary = document.getElementById("file-preview-summary");
  if (!preview || !list || !summary) return;
  const files = [...fileInput.files];
  list.replaceChildren();
  if (!files.length) {
    preview.classList.add("hidden");
    return;
  }
  preview.classList.remove("hidden");
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  summary.textContent = `${files.length} ${files.length === 1 ? "file" : "files"} ready · ${formatSize(totalSize)}`;
  files.forEach((file, index) => {
    const item = document.createElement("li");
    item.className = "file-preview-item";
    const thumb = document.createElement("span");
    thumb.className = "file-preview-thumb";
    const ext = fileExtension(file.name);
    thumb.textContent = ext ? ext.toUpperCase() : "•";
    thumb.title = file.type || "Unknown type";
    const info = document.createElement("div");
    info.className = "file-preview-info";
    const name = document.createElement("span");
    name.className = "file-preview-name";
    name.textContent = file.name;
    const meta = document.createElement("span");
    meta.className = "file-preview-meta";
    meta.textContent = `${formatSize(file.size)}${file.type ? ` · ${file.type}` : ""}`;
    info.append(name, meta);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "file-preview-remove";
    remove.setAttribute("aria-label", `Remove ${file.name} from selection`);
    remove.title = "Remove";
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      const dataTransfer = new DataTransfer();
      [...fileInput.files].forEach((current, currentIndex) => {
        if (currentIndex !== index) dataTransfer.items.add(current);
      });
      fileInput.files = dataTransfer.files;
      renderFilePreview();
    });
    item.append(thumb, info, remove);
    list.appendChild(item);
  });
}

async function uploadOne(file) {
  const binId = crypto.randomUUID().replaceAll("-", "");
  const encodedFileName = encodeURIComponent(file.name);
  const uploadUrl = `${FILEBIN_ORIGIN}/${binId}/${encodedFileName}`;
  const response = await fetch(uploadUrl, { method: "POST", body: new Blob([file]) });
  const responseText = await response.text();
  let result = null;
  try { result = JSON.parse(responseText); } catch {
    if (response.ok) throw new Error("Filebin returned an unreadable upload response.");
  }
  if (!response.ok || result?.bin?.id !== binId) {
    if (response.status === 403) throw new Error("Filebin rejected this file's type or content (HTTP 403).");
    if (response.status === 507) throw new Error("Filebin's storage capacity is full. Please try again later (HTTP 507).");
    if (response.status === 411) throw new Error("Filebin could not read the upload size. Try again with a current browser (HTTP 411).");
    if (response.status === 405) throw new Error("Filebin refused this upload because the bin is locked, expired, or unavailable (HTTP 405).");
    const reason = responseText.trim().slice(0, 180);
    throw new Error(`Filebin upload failed (HTTP ${response.status})${reason ? `: ${reason}` : "."}`);
  }
  const downloadUrl = new URL(`/${binId}/${encodedFileName}`, FILEBIN_ORIGIN).href;
  const shareUrl = await makeBrandedShareUrl(file, downloadUrl);
  return {
    id: binId,
    originalName: file.name,
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    shareUrl,
    url: downloadUrl,
    expires: result.bin.expired_at || null,
    createdAt: new Date().toISOString(),
    favorite: false,
    tags: [],
    note: "",
  };
}

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const files = [...fileInput.files];
  if (!files.length) {
    uploadMessage.textContent = "Please choose one or more files first.";
    return;
  }
  const submitButton = uploadForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  uploadMessage.textContent = `Uploading ${files.length} ${files.length === 1 ? "file" : "files"} to Filebin…`;
  const queue = files.map((file) => ({ file, status: "queued", link: "" }));
  renderQueue(queue);
  const results = new Array(queue.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < queue.length) {
      const index = nextIndex++;
      const entry = queue[index];
      entry.status = "uploading";
      renderQueue(queue);
      try {
        const record = await uploadOne(entry.file);
        entry.status = "success";
        entry.link = record.shareUrl;
        state.uploads.unshift(record);
        results[index] = { ok: true, record };
      } catch (error) {
        entry.status = "error";
        entry.errorMessage = error.message || "Upload failed";
        results[index] = { ok: false, error };
      } finally {
        renderQueue(queue);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(state.settings.concurrency, queue.length) }, worker));
  const successful = results.filter((result) => result.ok).length;
  const failed = results.length - successful;
  try {
    if (successful) saveUploads();
    if (successful && failed) uploadMessage.textContent = `${successful} uploaded; ${failed} failed. Successful links are saved in My uploads.`;
    else if (successful) uploadMessage.textContent = `${successful} ${successful === 1 ? "file was" : "files were"} uploaded to Filebin.`;
    else uploadMessage.textContent = "No files were uploaded. Review the error shown beside each file.";
  } catch (error) {
    uploadMessage.textContent = "Upload completed, but this browser could not save the upload history. Copy successful links from the list above.";
  }
  fileInput.value = "";
  renderFilePreview();
  renderUploads();
  updateProfileSummary();
  submitButton.disabled = false;
});

tabs.forEach((tab) => tab.addEventListener("click", () => setActiveTab(tab.dataset.tab)));
document.getElementById("upload-search")?.addEventListener("input", renderUploads);
document.getElementById("upload-sort")?.addEventListener("change", renderUploads);
document.getElementById("upload-tag-filter")?.addEventListener("change", renderUploads);
document.getElementById("favorites-only")?.addEventListener("change", renderUploads);
document.getElementById("dashboard-history-btn")?.addEventListener("click", () => {
  setActiveTab("uploaded");
  document.getElementById("files").scrollIntoView({ behavior: "smooth" });
});

function exportUploads(format) {
  const fields = ["name", "type", "size", "createdAt", "url", "shareUrl", "webShareUrl", "isHtml", "expires", "favorite", "tags", "note"];
  let content;
  let type;
  let extension;
  if (format === "json") {
    content = JSON.stringify(state.uploads, null, 2);
    type = "application/json;charset=utf-8";
    extension = "json";
  } else {
    const escapeCsv = (value) => {
      let text = String(Array.isArray(value) ? value.join("; ") : value ?? "");
      if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    content = [fields.map(escapeCsv).join(","), ...state.uploads.map((item) => fields.map((field) => escapeCsv(item[field])).join(","))].join("\r\n");
    type = "text/csv;charset=utf-8";
    extension = "csv";
  }
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `flofiletransfer-history-${new Date().toISOString().slice(0, 10)}.${extension}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

document.getElementById("export-json")?.addEventListener("click", () => exportUploads("json"));
document.getElementById("export-csv")?.addEventListener("click", () => exportUploads("csv"));

function handleSettingsChange() {
  state.settings.defaultView = document.getElementById("setting-default-view").value;
  state.settings.sort = document.getElementById("setting-sort").value;
  state.settings.concurrency = Number(document.getElementById("setting-concurrency").value);
  state.settings.showSize = document.getElementById("setting-show-size").checked;
  state.settings.gradientStart = normalizeHexColor(
    document.getElementById("setting-gradient-start")?.value,
    DEFAULT_SETTINGS.gradientStart,
  );
  state.settings.gradientEnd = normalizeHexColor(
    document.getElementById("setting-gradient-end")?.value,
    DEFAULT_SETTINGS.gradientEnd,
  );
  applyGradientSettings();
  const uploadSort = document.getElementById("upload-sort");
  if (uploadSort) uploadSort.value = state.settings.sort;
  try {
    saveSettings();
    document.getElementById("settings-feedback").textContent = "Settings saved for this account in this browser.";
  } catch (error) {
    document.getElementById("settings-feedback").textContent = "Could not save settings in this browser.";
  }
  renderUploads();
}

[
  "setting-default-view",
  "setting-sort",
  "setting-concurrency",
  "setting-show-size",
  "setting-gradient-start",
  "setting-gradient-end",
].forEach((id) => {
  document.getElementById(id)?.addEventListener("change", handleSettingsChange);
});
document.getElementById("reset-settings")?.addEventListener("click", () => {
  state.settings = { ...DEFAULT_SETTINGS };
  try { localStorage.removeItem(settingsKey()); } catch (error) { /* UI still resets to defaults. */ }
  loadSettings();
  applyGradientSettings();
  setActiveTab(document.body.classList.contains("dashboard-page") ? "uploaded" : state.settings.defaultView);
  document.getElementById("settings-feedback").textContent = "Settings reset to defaults.";
  renderUploads();
});

document.getElementById("profile-name-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.getElementById("profile-name-input");
  state.settings.senderNickname = normalizeSenderNickname(input?.value);
  if (input) input.value = state.settings.senderNickname;
  const feedback = document.getElementById("profile-name-feedback");
  try {
    saveSettings();
    if (feedback) feedback.textContent = state.settings.senderNickname
      ? "Profile name saved. New shared files will show this name."
      : "Profile name cleared. New shared files will show Anonymous sender.";
    renderDashboard();
    updateSidebarIdentity();
  } catch (error) {
    if (feedback) feedback.textContent = "Could not save your profile name in this browser.";
  }
});

const dropzone = document.querySelector(".dropzone");
fileInput.addEventListener("change", renderFilePreview);
document.getElementById("file-preview-clear")?.addEventListener("click", () => {
  fileInput.value = "";
  renderFilePreview();
});
dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("drag-over");
});
dropzone.addEventListener("dragleave", (event) => {
  if (!dropzone.contains(event.relatedTarget)) dropzone.classList.remove("drag-over");
});
dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("drag-over");
  if (event.dataTransfer?.files?.length) {
    fileInput.files = event.dataTransfer.files;
    renderFilePreview();
    uploadMessage.textContent = "";
  }
});

function switchUser(user) {
  const previousOwner = state.owner;
  state.user = user || null;
  state.owner = state.user?.sub || "anonymous";
  if (previousOwner === "anonymous" && state.user) {
    try {
      const guestSettings = JSON.parse(localStorage.getItem("transferflow_settings:anonymous") || "{}");
      const accountSettings = JSON.parse(localStorage.getItem(settingsKey()) || "{}");
      if (!normalizeSenderNickname(accountSettings.senderNickname) && normalizeSenderNickname(guestSettings.senderNickname)) {
        localStorage.setItem(settingsKey(), JSON.stringify({ ...accountSettings, senderNickname: normalizeSenderNickname(guestSettings.senderNickname) }));
      }
    } catch (error) { /* keep the signed-in nickname editable even if migration is unavailable */ }
  }
  if (previousOwner === state.owner && state.uploads.length) {
    renderDashboard();
    return;
  }
  state.uploads = readArray(currentUploadsKey());
  loadSettings();
  const uploadSearch = document.getElementById("upload-search");
  const favoritesOnly = document.getElementById("favorites-only");
  if (uploadSearch) uploadSearch.value = "";
  if (favoritesOnly) favoritesOnly.checked = false;
  renderUploads();
  updateProfileSummary();
  renderDashboard();
  updateSidebarIdentity();
  renderSidebarRoles();
  setActiveTab(document.body.classList.contains("dashboard-page") ? "uploaded" : state.settings.defaultView);
  if (state.user && previousOwner !== state.owner) {
    const dashboard = document.getElementById("dashboard");
    if (dashboard) window.setTimeout(() => dashboard.scrollIntoView({ behavior: "smooth" }), 0);
  }
}

["setting-gradient-start", "setting-gradient-end"].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", () => {
    state.settings.gradientStart = normalizeHexColor(
      document.getElementById("setting-gradient-start")?.value,
      DEFAULT_SETTINGS.gradientStart,
    );
    state.settings.gradientEnd = normalizeHexColor(
      document.getElementById("setting-gradient-end")?.value,
      DEFAULT_SETTINGS.gradientEnd,
    );
    applyGradientSettings();
  });
});

document.addEventListener("storage", (event) => {
  if (event.key === currentUploadsKey()) {
    state.uploads = readArray(currentUploadsKey());
    renderUploads();
    updateProfileSummary();
  }
});
window.addEventListener("flo-auth-change", (event) => {
  switchUser(event.detail?.user || null);
  updateSidebarIdentity();
  renderSidebarRoles();
  if (window.floRolesReady && typeof window.floRolesReady.then === "function") {
    window.floRolesReady.then(() => renderSidebarRoles()).catch(() => {});
  }
});

(() => {
  const sidebar = document.getElementById("app-sidebar");
  const toggle = document.getElementById("sidebar-compact-toggle");
  const opener = document.getElementById("sidebar-open-btn");
  const backdrop = document.getElementById("sidebar-backdrop");
  if (!sidebar || !toggle || !opener || !backdrop) return;
  const compactKey = "flo-sidebar-compact";
  const hiddenKey = "flo-sidebar-hidden";
  try { toggle.checked = localStorage.getItem(compactKey) === "true"; } catch (error) { /* use expanded default */ }
  document.body.classList.toggle("sidebar-compact", toggle.checked);
  let sidebarHidden = false;
  try { sidebarHidden = localStorage.getItem(hiddenKey) === "true"; } catch (error) { /* keep the sidebar visible */ }
  const isMobile = window.matchMedia("(max-width: 900px)").matches;
  document.body.classList.toggle("sidebar-hidden", sidebarHidden);
  document.body.classList.toggle("sidebar-toggle-on", isMobile ? false : !sidebarHidden);
  opener.setAttribute("aria-expanded", String(isMobile ? false : !sidebarHidden));
  opener.setAttribute("aria-label", isMobile ? "Open navigation" : sidebarHidden ? "Show navigation" : "Hide navigation");
  toggle.addEventListener("change", () => {
    document.body.classList.toggle("sidebar-compact", toggle.checked);
    try { localStorage.setItem(compactKey, String(toggle.checked)); } catch (error) { /* preference remains active for this page */ }
  });
  const setOpen = (open) => {
    const isMobile = window.matchMedia("(max-width: 900px)").matches;
    if (isMobile) {
      document.body.classList.toggle("sidebar-open", open);
      document.body.classList.toggle("sidebar-toggle-on", open);
      opener.setAttribute("aria-expanded", String(open));
      opener.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    } else {
      document.body.classList.toggle("sidebar-hidden", !open);
      document.body.classList.toggle("sidebar-toggle-on", open);
      opener.setAttribute("aria-expanded", String(open));
      opener.setAttribute("aria-label", open ? "Hide navigation" : "Show navigation");
      try { localStorage.setItem(hiddenKey, String(!open)); } catch (error) { /* keep the current page state */ }
    }
  };
  opener.addEventListener("click", () => {
    const isMobile = window.matchMedia("(max-width: 900px)").matches;
    setOpen(isMobile
      ? !document.body.classList.contains("sidebar-open")
      : document.body.classList.contains("sidebar-hidden"));
  });
  backdrop.addEventListener("click", () => setOpen(false));
  sidebar.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setOpen(false)));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") setOpen(false); });
})();

loadSettings();
state.uploads = readArray(currentUploadsKey());
loadRepoFiles();
renderUploads();
updateProfileSummary();
setActiveTab(document.body.classList.contains("dashboard-page") ? "uploaded" : state.settings.defaultView);
updateSidebarIdentity();
renderSidebarRoles();
if (window.floRolesReady && typeof window.floRolesReady.then === "function") {
  window.floRolesReady.then(() => renderSidebarRoles()).catch(() => {});
}
