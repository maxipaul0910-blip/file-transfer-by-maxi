CREATE TABLE IF NOT EXISTS users (
  sub TEXT PRIMARY KEY,
  email TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_sub TEXT NOT NULL REFERENCES users(sub) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (user_sub, role_id)
);

CREATE INDEX IF NOT EXISTS user_roles_by_role ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS users_by_last_seen ON users(last_seen_at DESC);

INSERT OR IGNORE INTO permissions (id, name, description) VALUES
  ('roles:manage', 'Manage roles', 'Create roles and select their permissions.'),
  ('users:manage', 'Manage users', 'Assign or remove roles for registered users.'),
  ('features:beta', 'Use beta features', 'See FloFileTransfer preview features.');

INSERT OR IGNORE INTO roles (id, name, description, is_system, created_at) VALUES
  ('admin', 'Admin', 'Manage roles, users, and preview features.', 1, '2026-10-11T00:00:00.000Z'),
  ('beta_tester', 'Beta tester', 'Access FloFileTransfer preview features.', 1, '2026-10-11T00:00:00.000Z');

INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
  ('admin', 'roles:manage'),
  ('admin', 'users:manage'),
  ('admin', 'features:beta'),
  ('beta_tester', 'features:beta');
