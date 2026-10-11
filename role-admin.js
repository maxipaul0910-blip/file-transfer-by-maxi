(() => {
  const config = window.floAuthzConfig || {};
  const adminSection = document.getElementById("admin");
  const adminMenuLink = document.getElementById("admin-menu-link");
  const dashboardAdminLink = document.getElementById("dashboard-admin-link");
  const betaPreview = document.getElementById("beta-preview-card");
  const status = document.getElementById("admin-status");
  const roleForm = document.getElementById("admin-role-form");
  const roleName = document.getElementById("admin-role-name");
  const roleDescription = document.getElementById("admin-role-description");
  const permissionOptions = document.getElementById("admin-permission-options");
  const roleList = document.getElementById("admin-role-list");
  const userList = document.getElementById("admin-user-list");
  let overview = { roles: [], permissions: [], users: [] };
  let busy = false;

  function setAdminLinks(visible) {
    adminMenuLink?.classList.toggle("hidden", !visible);
    dashboardAdminLink?.classList.toggle("hidden", !visible);
  }

  function setAdminSection(visible) {
    if (!adminSection) return;
    adminSection.classList.toggle("hidden", !visible);
    if (visible && window.location.hash === "#admin") {
      window.setTimeout(() => adminSection.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    }
  }

  function setStatus(message, kind = "info") {
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind;
    status.classList.toggle("hidden", !message);
  }

  function candidateForBootstrapAdmin(user) {
    return user?.email_verified === true && user.email?.toLowerCase() === "maxi.paul0910@gmail.com";
  }

  function setFormsEnabled(enabled) {
    roleForm?.querySelectorAll("input, button").forEach((control) => { control.disabled = !enabled; });
    userList?.querySelectorAll("input, button").forEach((control) => { control.disabled = !enabled; });
  }

  async function request(path, options = {}) {
    if (!config.baseUrl) throw new Error("The role service is not connected yet. Set its Worker URL in auth.js after deployment.");
    if (typeof window.floGetAuthorizationToken !== "function") throw new Error("Sign-in is still loading. Try again in a moment.");
    const token = await window.floGetAuthorizationToken();
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `The role service returned ${response.status}.`);
    return result;
  }

  function renderPermissions() {
    if (!permissionOptions) return;
    permissionOptions.replaceChildren();
    overview.permissions.forEach((permission, index) => {
      const label = document.createElement("label");
      label.className = "permission-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = permission.id;
      input.id = `admin-permission-${index}`;
      const copy = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = permission.name;
      const description = document.createElement("small");
      description.textContent = permission.description;
      copy.append(name, description);
      label.append(input, copy);
      permissionOptions.appendChild(label);
    });
  }

  function renderRoles() {
    if (!roleList) return;
    roleList.replaceChildren();
    if (!overview.roles.length) {
      roleList.textContent = "No roles are available.";
      return;
    }
    overview.roles.forEach((role) => {
      const card = document.createElement("article");
      card.className = "admin-role-item";
      const heading = document.createElement("h4");
      heading.textContent = role.name;
      const description = document.createElement("p");
      description.textContent = role.description || (role.isSystem ? "Built-in role" : "Custom role");
      const list = document.createElement("p");
      list.className = "permission-summary";
      list.textContent = role.permissionIds.length
        ? role.permissionIds.map((id) => overview.permissions.find((permission) => permission.id === id)?.name || id).join(" · ")
        : "No permissions";
      card.append(heading, description, list);
      roleList.appendChild(card);
    });
  }

  async function saveUserRoles(user, button, checkboxes) {
    button.disabled = true;
    try {
      const roleIds = [...checkboxes].filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value);
      await request(`/api/admin/users/${encodeURIComponent(user.sub)}/roles`, {
        method: "PUT",
        body: JSON.stringify({ roleIds }),
      });
      setStatus(`Roles saved for ${user.email || user.name || "the user"}.`, "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  function renderUsers() {
    if (!userList) return;
    userList.replaceChildren();
    if (!overview.users.length) {
      userList.textContent = "No users have registered with the role service yet.";
      return;
    }
    overview.users.forEach((user, index) => {
      const row = document.createElement("article");
      row.className = "admin-user-row";
      const identity = document.createElement("div");
      identity.className = "admin-user-identity";
      const name = document.createElement("strong");
      name.textContent = user.name || "FloFileTransfer user";
      const email = document.createElement("span");
      email.textContent = `${user.email || "No email"}${user.emailVerified ? " · verified" : " · unverified"}`;
      identity.append(name, email);

      const roleChoices = document.createElement("div");
      roleChoices.className = "admin-user-role-choices";
      const checkboxes = [];
      overview.roles.forEach((role, roleIndex) => {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = role.id;
        input.checked = user.roleIds.includes(role.id);
        input.id = `admin-user-${index}-role-${roleIndex}`;
        const text = document.createElement("span");
        text.textContent = role.name;
        label.append(input, text);
        roleChoices.appendChild(label);
        checkboxes.push(input);
      });

      const save = document.createElement("button");
      save.type = "button";
      save.className = "secondary-btn compact-btn";
      save.textContent = "Save roles";
      save.addEventListener("click", () => saveUserRoles(user, save, checkboxes));
      row.append(identity, roleChoices, save);
      userList.appendChild(row);
    });
  }

  function renderOverview(data) {
    overview = data;
    renderPermissions();
    renderRoles();
    renderUsers();
    setFormsEnabled(true);
  }

  setFormsEnabled(false);

  async function refreshOverview() {
    const data = await request("/api/admin/overview");
    renderOverview(data);
  }

  async function initialize(user) {
    setAdminLinks(false);
    setAdminSection(false);
    setStatus("");
    setFormsEnabled(false);
    betaPreview?.classList.add("hidden");
    if (!user) return;

    const isBootstrapAdmin = candidateForBootstrapAdmin(user);
    try {
      const access = await request("/api/me");
      const permissions = new Set(access.permissions || []);
      const canManageRoles = permissions.has("roles:manage") && permissions.has("users:manage");
      setAdminLinks(canManageRoles);
      setAdminSection(canManageRoles);
      betaPreview?.classList.toggle("hidden", !permissions.has("features:beta"));
      if (canManageRoles) {
        setStatus("Role changes are enforced by the authorization service.");
        await refreshOverview();
      }
    } catch (error) {
      if (isBootstrapAdmin) {
        setAdminLinks(true);
        setAdminSection(true);
        setStatus(`${error.message} The controls are disabled until the Worker, D1 database, and Auth0 API are configured.`, "warning");
      }
    }
  }

  roleForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    const button = document.getElementById("admin-create-role");
    button.disabled = true;
    const permissionIds = [...permissionOptions.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
    try {
      await request("/api/admin/roles", {
        method: "POST",
        body: JSON.stringify({ name: roleName.value, description: roleDescription.value, permissionIds }),
      });
      roleForm.reset();
      setStatus("Role created.", "success");
      await refreshOverview();
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      busy = false;
      button.disabled = false;
    }
  });

  window.addEventListener("flo-auth-change", (event) => initialize(event.detail?.user || null));
  if (window.floAuthUser) initialize(window.floAuthUser);
})();
