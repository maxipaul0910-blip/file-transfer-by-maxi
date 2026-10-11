# FloFileTransfer roles API

This Worker provides the trusted role and permission API for the static
GitHub Pages app. It verifies Auth0 access-token signatures and claims before
handling requests, and stores registered users, roles, and assignments in D1.
The browser never receives a Cloudflare or Auth0 Management API secret.

## Current Cloudflare deployment

- Worker: `https://flofiletransfer-roles.maxi-paul0910-d91.workers.dev`
- D1 database: `flofiletransfer-roles`
- Health endpoint: `https://flofiletransfer-roles.maxi-paul0910-d91.workers.dev/health`

The Worker and D1 schema are deployed. The API is not ready to accept app
sign-ins until the matching Auth0 tenant has the
`https://flofiletransfer-roles.maxi-paul0910-d91.workers.dev`
API configured and the required identity claims enabled. The `auth.js` file
already points to this Worker. Redeploy code changes from this folder with
`npx wrangler deploy`.

## Cloudflare setup

Run these commands from this `worker/` folder:

1. Install Wrangler using the official Cloudflare CLI and connect the Cloudflare
   account that will host the Worker:

   ```sh
   npx wrangler login
   ```

2. Create the D1 database:

   ```sh
   npx wrangler d1 create flofiletransfer-roles
   ```

   Copy the returned `database_id` into `wrangler.jsonc`, replacing the example
   all-zero ID.

3. Create the local D1 tables and built-in `Admin` and `Beta tester` roles:

   ```sh
   npx wrangler d1 execute flofiletransfer-roles --local --file=./schema.sql
   ```

   For local role testing, put `ADMIN_EMAIL=maxi.paul0910@gmail.com` in a
   `worker/.dev.vars` file. This local-only file is ignored by Git.

4. Run the Worker locally:

   ```sh
   npx wrangler dev
   ```

   It normally listens on `http://localhost:8787`. For local browser testing,
   temporarily set `AUTHZ_API_CONFIG.baseUrl` in `../auth.js` to that URL. Keep
   the Worker URL empty until the Auth0 API configuration below is complete.

5. Before deploying, initialize the remote database and store the bootstrap
   administrator email as a Worker secret:

   ```sh
   npx wrangler d1 execute flofiletransfer-roles --remote --file=./schema.sql
   npx wrangler secret put ADMIN_EMAIL
   ```

   Enter `maxi.paul0910@gmail.com` when Wrangler prompts. The Worker only
   bootstraps this account when Auth0 marks the email as verified.

6. Deploy the Worker:

   ```sh
   npx wrangler deploy
   ```

   Copy the deployed `*.workers.dev` URL to `AUTHZ_API_CONFIG.baseUrl` in
   `../auth.js`. The `ALLOWED_ORIGINS` setting in `wrangler.jsonc` permits the
   GitHub Pages origin and the listed local development origins.

## Auth0 setup

1. In the Auth0 tenant used by `auth.js`, create an API with identifier
   `https://flofiletransfer-roles.maxi-paul0910-d91.workers.dev` and RS256 signing.
2. Create a Post Login Action from `auth0-post-login-action.js`, add it to the
   Login flow, and publish it. It adds namespaced email, verification, and name
   claims to access tokens for the Worker.
   The Worker also checks the Auth0 SPA client ID in `wrangler.jsonc`.
3. Confirm the SPA still has the GitHub Pages and local callback/logout URLs
   configured. Sign in again after changing the API or Action so Auth0 issues a
   fresh access token.

## Role behavior

- The verified bootstrap email gets the built-in `Admin` role on first API use.
- Admins can create custom roles from the permission catalog and assign or
  remove roles for users who have signed in since the Worker was connected.
- `Beta tester` grants `features:beta`, which displays the Labs preview card.
- Role assignment only grants named application permissions. It never lets a
  user submit arbitrary HTML or JavaScript to the site. When adding a new app
  capability, add its permission to `schema.sql` and check that permission in
  the feature/API that implements the capability.
- D1 stores Auth0 subject IDs, email addresses, names, email-verification
  status, last-seen timestamps, and role assignments. The admin user list is
  limited to the 250 most recently active users.

For the D1 and Wrangler command details, see the official
[Cloudflare D1 getting-started guide](https://developers.cloudflare.com/d1/get-started/)
and [D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/).
