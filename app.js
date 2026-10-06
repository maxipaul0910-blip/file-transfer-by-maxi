const state = {
  repoFiles: [],
  uploads: JSON.parse(localStorage.getItem("transferflow_uploads") || "[]"),
};

const repoList = document.getElementById("repo-list");
const uploadedList = document.getElementById("uploaded-list");
const uploadForm = document.getElementById("upload-form");
const fileInput = document.getElementById("file-input");
const uploadMessage = document.getElementById("upload-message");
const tabs = document.querySelectorAll(".tab");

function formatSize(size) {
  if (!size) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function createCard(item, type) {
  const card = document.createElement("article");
  card.className = "file-card";

  const badge = type === "repo" ? "Repo" : "Upload";
  const href = item.url || item.downloadUrl || item.path || "#";
  const shareHref = item.shareUrl || "";

  card.innerHTML = `
    <div class="file-card-header">
      <span class="badge">${badge}</span>
    </div>
    <h3 class="file-name">${item.name || item.originalName}</h3>
    <p class="file-meta">
      ${formatSize(item.size)}<br />
      ${item.type || "application/octet-stream"}
    </p>

    <div class="file-actions">
      <a class="file-link" href="${href}" target="_blank" rel="noreferrer">Open</a>
      ${shareHref ? `<a class="file-link secondary" href="${shareHref}" target="_blank" rel="noreferrer">Share</a>` : ""}
    </div>
  `;

  return card;
}

function renderRepoFiles(files) {
  repoList.innerHTML = "";

  if (!files.length) {
    repoList.innerHTML = '<div class="empty-state">No repo files available yet.</div>';
    return;
  }

  files.forEach((file) => repoList.appendChild(createCard(file, "repo")));
}

function renderUploads(files) {
  uploadedList.innerHTML = "";

  if (!files.length) {
    uploadedList.innerHTML = '<div class="empty-state">No uploaded files yet. Use the form above to add one.</div>';
    return;
  }

  files.forEach((file) => uploadedList.appendChild(createCard(file, "upload")));
}

async function loadRepoFiles() {
  try {
    const response = await fetch("./repo-files/index.json");
    const data = await response.json();
    state.repoFiles = Array.isArray(data) ? data : [];
    renderRepoFiles(state.repoFiles);
  } catch (error) {
    state.repoFiles = [];
    renderRepoFiles([]);
  }
}

function saveUploads() {
  localStorage.setItem("transferflow_uploads", JSON.stringify(state.uploads));
}

function makeShareLink(file) {
  const fileId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  file.id = fileId;
  file.shareUrl = `./share.html?file=${encodeURIComponent(fileId)}`;
  file.downloadUrl = file.url || `./share.html?file=${encodeURIComponent(fileId)}`;
  return file;
}

uploadForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const file = fileInput.files[0];
  if (!file) {
    uploadMessage.textContent = "Please choose a file first.";
    return;
  }

  const fileRecord = {
    id: crypto.randomUUID ? crypto.randomUUID() : `file-${Date.now()}`,
    originalName: file.name,
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    url: URL.createObjectURL(file),
    path: "#",
  };

  const shareItem = makeShareLink(fileRecord);
  state.uploads.unshift(shareItem);
  saveUploads();
  renderUploads(state.uploads);

  uploadMessage.textContent = `Uploaded successfully — share link: ${shareItem.shareUrl}`;
  fileInput.value = "";
});

function loadUploads() {
  renderUploads(state.uploads);
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((button) => button.classList.toggle("active", button === tab));
    const target = tab.dataset.tab;

    document.getElementById("repo-list").classList.toggle("active", target === "repo");
    document.getElementById("uploaded-list").classList.toggle("active", target === "uploaded");
  });
});

loadRepoFiles();
loadUploads();
