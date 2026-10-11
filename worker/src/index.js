let cachedJwks;
let cachedJwksUntil = 0;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function jsonResponse(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowedOrigins = (env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
  const headers = {
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && allowedOrigins.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function decodeBase64Url(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function decodeJsonPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

async function getJwks(domain) {
  const now = Date.now();
  if (cachedJwks && cachedJwksUntil > now) return cachedJwks;
  const response = await fetch(`https://${domain}/.well-known/jwks.json`);
  if (!response.ok) throw new HttpError(503, "The identity provider is unavailable.");
  const keys = await response.json();
  cachedJwks = keys.keys || [];
  cachedJwksUntil = now + 10 * 60 * 1000;
  return cachedJwks;
}

async function authenticate(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new HttpError(401, "Sign in to continue.");

  const parts = match[1].split(".");
  if (parts.length !== 3) throw new HttpError(401, "The access token is invalid.");

  let header;
  let claims;
  try {
    header = decodeJsonPart(parts[0]);
    claims = decodeJsonPart(parts[1]);
  } catch {
    throw new HttpError(401, "The access token is invalid.");
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new HttpError(401, "The access token uses an unsupported signature.");
  }

  const domain = (env.AUTH0_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!domain || !env.AUTH0_AUDIENCE) throw new HttpError(503, "The authorization API is not configured.");
  const jwk = (await getJwks(domain)).find((key) => key.kid === header.kid && key.use === "sig");
  if (!jwk) {
    cachedJwksUntil = 0;
    throw new HttpError(401, "The access token signing key is unknown. Sign in again.");
  }

  let validSignature = false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    validSignature = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    throw new HttpError(401, "The access token signature is invalid.");
  }

  const issuer = `https://${domain}/`;
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    !validSignature || claims.iss !== issuer || !audiences.includes(env.AUTH0_AUDIENCE) ||
    (env.AUTH0_CLIENT_ID && claims.azp !== env.AUTH0_CLIENT_ID) ||
    !Number.isFinite(claims.exp) || claims.exp <= nowSeconds ||
    (Number.isFinite(claims.nbf) && claims.nbf > nowSeconds) || typeof claims.sub !== "string"
  ) {
    throw new HttpError(401, "The access token is expired or not valid for this API.");
  }

  const namespace = env.CLAIM_NAMESPACE || "https://flofiletransfer.app";
  return {
    sub: claims.sub,
    email: typeof claims[`${namespace}/email`] === "string" ? claims[`${namespace}/email`] : "",
    emailVerified: claims[`${namespace}/email_verified`] === true,
    name: typeof claims[`${namespace}/name`] === "string" ? claims[`${namespace}/name`] : "",
  };
}

async function recordUser(identity, env) {
  await env.DB.prepare(
    `INSERT INTO users (sub, email, name, email_verified, last_seen_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(sub) DO UPDATE SET email = excluded.email, name = excluded.name,
       email_verified = excluded.email_verified, last_seen_at = excluded.last_seen_at`,
  ).bind(identity.sub, identity.email, identity.name, identity.emailVerified ? 1 : 0, new Date().toISOString()).run();

  const configuredAdminEmail = (env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (identity.emailVerified && identity.email.toLowerCase() === configuredAdminEmail && configuredAdminEmail) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO user_roles (user_sub, role_id, assigned_by, assigned_at)
       VALUES (?, 'admin', 'bootstrap', ?)`,
    ).bind(identity.sub, new Date().toISOString()).run();
  }
}

async function rolesForUser(sub, env) {
  const result = await env.DB.prepare(
    `SELECT r.id, r.name, r.description FROM roles r
     INNER JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_sub = ? ORDER BY r.name COLLATE NOCASE`,
  ).bind(sub).all();
  return result.results || [];
}

async function permissionsForRoles(roles, env) {
  if (!roles.length) return [];
  const placeholders = roles.map(() => "?").join(", ");
  const result = await env.DB.prepare(
    `SELECT DISTINCT p.id FROM permissions p
     INNER JOIN role_permissions rp ON rp.permission_id = p.id
     WHERE rp.role_id IN (${placeholders}) ORDER BY p.id`,
  ).bind(...roles.map((role) => role.id)).all();
  return (result.results || []).map((row) => row.id);
}

async function requirePermission(identity, permission, env) {
  await recordUser(identity, env);
  const roles = await rolesForUser(identity.sub, env);
  const permissions = await permissionsForRoles(roles, env);
  if (!permissions.includes(permission)) throw new HttpError(403, "You do not have permission to do that.");
  return { roles, permissions };
}

async function getCurrentUser(identity, env) {
  await recordUser(identity, env);
  const roles = await rolesForUser(identity.sub, env);
  const permissions = await permissionsForRoles(roles, env);
  return jsonResponse({
    user: { sub: identity.sub, email: identity.email, name: identity.name, emailVerified: identity.emailVerified },
    roles,
    permissions,
  }, 200, {});
}

async function getAdminOverview(identity, env) {
  await requirePermission(identity, "roles:manage", env);
  await requirePermission(identity, "users:manage", env);
  const [rolesResult, permissionsResult, usersResult] = await Promise.all([
    env.DB.prepare("SELECT id, name, description, is_system FROM roles ORDER BY is_system DESC, name COLLATE NOCASE").all(),
    env.DB.prepare("SELECT id, name, description FROM permissions ORDER BY id").all(),
    env.DB.prepare(
      `SELECT u.sub, u.email, u.name, u.email_verified, u.last_seen_at, ur.role_id
       FROM users u LEFT JOIN user_roles ur ON ur.user_sub = u.sub
       ORDER BY u.last_seen_at DESC LIMIT 250`,
    ).all(),
  ]);

  const usersBySub = new Map();
  for (const row of usersResult.results || []) {
    if (!usersBySub.has(row.sub)) {
      usersBySub.set(row.sub, {
        sub: row.sub,
        email: row.email,
        name: row.name,
        emailVerified: Boolean(row.email_verified),
        lastSeenAt: row.last_seen_at,
        roleIds: [],
      });
    }
    if (row.role_id) usersBySub.get(row.sub).roleIds.push(row.role_id);
  }

  const rolePermissionResult = await env.DB.prepare(
    "SELECT role_id, permission_id FROM role_permissions ORDER BY role_id, permission_id",
  ).all();
  const permissionIdsByRole = new Map();
  for (const row of rolePermissionResult.results || []) {
    if (!permissionIdsByRole.has(row.role_id)) permissionIdsByRole.set(row.role_id, []);
    permissionIdsByRole.get(row.role_id).push(row.permission_id);
  }

  return jsonResponse({
    roles: (rolesResult.results || []).map((role) => ({
      ...role,
      isSystem: Boolean(role.is_system),
      permissionIds: permissionIdsByRole.get(role.id) || [],
    })),
    permissions: permissionsResult.results || [],
    users: [...usersBySub.values()],
  }, 200, {});
}

async function parseJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Send a valid JSON request body.");
  }
}

async function createRole(request, identity, env) {
  await requirePermission(identity, "roles:manage", env);
  const body = await parseJson(request);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const permissionIds = Array.isArray(body.permissionIds) ? [...new Set(body.permissionIds)] : [];
  if (name.length < 2 || name.length > 40) throw new HttpError(400, "Role names must be 2–40 characters.");
  if (description.length > 240) throw new HttpError(400, "Descriptions must be 240 characters or fewer.");
  if (permissionIds.length > 20 || permissionIds.some((permission) => typeof permission !== "string")) {
    throw new HttpError(400, "Choose up to 20 valid permissions.");
  }
  if (["admin", "beta tester"].includes(name.toLowerCase())) {
    throw new HttpError(409, "That name is reserved for a built-in role.");
  }
  if (permissionIds.length) {
    const placeholders = permissionIds.map(() => "?").join(", ");
    const available = await env.DB.prepare(`SELECT id FROM permissions WHERE id IN (${placeholders})`).bind(...permissionIds).all();
    if ((available.results || []).length !== permissionIds.length) throw new HttpError(400, "One or more permissions are unavailable.");
  }

  const roleId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const statements = [
    env.DB.prepare("INSERT INTO roles (id, name, description, is_system, created_at) VALUES (?, ?, ?, 0, ?)")
      .bind(roleId, name, description, createdAt),
    ...permissionIds.map((permissionId) => env.DB.prepare(
      "INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)",
    ).bind(roleId, permissionId)),
  ];
  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      throw new HttpError(409, "A role with that name already exists.");
    }
    throw error;
  }
  return jsonResponse({ id: roleId, name, description, permissionIds }, 201, {});
}

async function assignUserRoles(request, encodedSub, identity, env) {
  await requirePermission(identity, "users:manage", env);
  let targetSub;
  try {
    targetSub = decodeURIComponent(encodedSub);
  } catch {
    throw new HttpError(400, "The user id is invalid.");
  }
  const body = await parseJson(request);
  const roleIds = Array.isArray(body.roleIds) ? [...new Set(body.roleIds)] : [];
  if (roleIds.length > 20 || roleIds.some((roleId) => typeof roleId !== "string")) {
    throw new HttpError(400, "Choose up to 20 valid roles.");
  }
  const target = await env.DB.prepare("SELECT sub FROM users WHERE sub = ?").bind(targetSub).first();
  if (!target) throw new HttpError(404, "That user has not signed in to FloFileTransfer yet.");
  if (roleIds.length) {
    const placeholders = roleIds.map(() => "?").join(", ");
    const available = await env.DB.prepare(`SELECT id FROM roles WHERE id IN (${placeholders})`).bind(...roleIds).all();
    if ((available.results || []).length !== roleIds.length) throw new HttpError(400, "One or more roles are unavailable.");
  }

  const statements = [
    env.DB.prepare("DELETE FROM user_roles WHERE user_sub = ?").bind(targetSub),
    ...roleIds.map((roleId) => env.DB.prepare(
      "INSERT INTO user_roles (user_sub, role_id, assigned_by, assigned_at) VALUES (?, ?, ?, ?)",
    ).bind(targetSub, roleId, identity.sub, new Date().toISOString())),
  ];
  await env.DB.batch(statements);
  return jsonResponse({ sub: targetSub, roleIds }, 200, {});
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method === "GET" && new URL(request.url).pathname === "/health") {
      return jsonResponse({ ok: true }, 200, headers);
    }

    try {
      const url = new URL(request.url);
      const identity = await authenticate(request, env);
      let response;
      if (request.method === "GET" && url.pathname === "/api/me") {
        response = await getCurrentUser(identity, env);
      } else if (request.method === "GET" && url.pathname === "/api/admin/overview") {
        response = await getAdminOverview(identity, env);
      } else if (request.method === "POST" && url.pathname === "/api/admin/roles") {
        response = await createRole(request, identity, env);
      } else {
        const assignment = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/roles$/);
        if (request.method === "PUT" && assignment) {
          response = await assignUserRoles(request, assignment[1], identity, env);
        } else {
          response = jsonResponse({ error: "Not found." }, 404, headers);
        }
      }
      const responseHeaders = new Headers(response.headers);
      for (const [key, value] of Object.entries(headers)) responseHeaders.set(key, value);
      return new Response(response.body, { status: response.status, headers: responseHeaders });
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500;
      if (status >= 500) console.error("Role API request failed:", error);
      return jsonResponse({ error: status >= 500 ? "The role service could not complete the request." : error.message }, status, headers);
    }
  },
};
