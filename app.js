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
const FILEBIN_ORIGIN = "https://filebin.net";

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

  const href = type === "upload"
    ? item.shareUrl || `./share.html?file=${encodeURIComponent(item.id)}`
    : item.url || item.downloadUrl || item.path || "#";
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
  metadata.textContent = `${formatSize(item.size)} · ${item.type || "application/octet-stream"}`;

  const actions = document.createElement("div");
  actions.className = "file-actions";
  const openLink = document.createElement("a");
  openLink.className = "file-link";
  openLink.href = href;
  openLink.target = "_blank";
  openLink.rel = "noopener noreferrer";
  openLink.textContent = "Open";
  actions.appendChild(openLink);

  if (type === "upload" && item.shareUrl) {
    const shareLink = document.createElement("a");
    shareLink.className = "file-link secondary";
    shareLink.href = item.shareUrl;
    shareLink.target = "_blank";
    shareLink.rel = "noopener noreferrer";
    shareLink.textContent = "Share";
    actions.appendChild(shareLink);
  }

  card.append(header, name, metadata, actions);

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

function showUploadResult(file, metadataSaved) {
  uploadMessage.replaceChildren();
  const message = document.createElement("span");
  message.textContent = metadataSaved
    ? "Uploaded to Filebin. Anyone with this link can access the file: "
    : "Uploaded to Filebin. Save this link; it could not be added to My uploads: ";

  const link = document.createElement("a");
  link.href = file.shareUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = file.shareUrl;
  uploadMessage.append(message, link);
}

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = fileInput.files[0];
  if (!file) {
    uploadMessage.textContent = "Please choose a file first.";
    return;
  }

  const submitButton = uploadForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  uploadMessage.textContent = "Uploading your file to Filebin…";
  try {
    const binId = crypto.randomUUID().replaceAll("-", "");
    const encodedFileName = encodeURIComponent(file.name);
    const uploadUrl = `${FILEBIN_ORIGIN}/${binId}/${encodedFileName}`;

    const response = await fetch(uploadUrl, {
      method: "POST",
      body: new Blob([file]),
    });
    const responseText = await response.text();
    let result = null;
    try {
      result = JSON.parse(responseText);
    } catch {
      if (response.ok) {
        throw new Error("Filebin returned an unreadable upload response.");
      }
    }
    if (!response.ok || result?.bin?.id !== binId) {
      const reason = responseText.trim().slice(0, 180);
      throw new Error(`Filebin upload failed (HTTP ${response.status})${reason ? `: ${reason}` : "."}`);
    }

    const shareUrl = new URL(`/${binId}/${encodedFileName}`, FILEBIN_ORIGIN);

    const fileRecord = {
      id: binId,
      originalName: file.name,
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      shareUrl: shareUrl.href,
      url: shareUrl.href,
      expires: result.bin.expired_at || null,
    };

    state.uploads.unshift(fileRecord);
    let metadataSaved = true;
    try {
      saveUploads();
    } catch (error) {
      metadataSaved = false;
      console.error("Could not save upload details in this browser:", error);
    }
    renderUploads(state.uploads);
    showUploadResult(fileRecord, metadataSaved);
    fileInput.value = "";
  } catch (error) {
    console.error("Could not upload file to Filebin:", error);
    uploadMessage.textContent = `Upload failed: ${error.message || "Check your connection and try again."}`;
  } finally {
    submitButton.disabled = false;
  }
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
