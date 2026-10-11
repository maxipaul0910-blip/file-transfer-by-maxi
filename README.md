# FloFileTransfer

## Auth0 Google and GitHub sign-in

This project is a static HTML/CSS/JavaScript site. It uses the official Auth0
SPA SDK in the browser; no server framework, Node.js app, or npm install is
needed to run the site. The Auth0 domain and public SPA client ID are hardcoded
in `auth.js`. The client ID is intended to be public in a browser app; provider
client secrets must only be entered into Auth0 and must never be added to this
repository.

### Auth0 dashboard

The application should be a **Single Page Application** with **Token Endpoint
Authentication Method** set to **None**. Enable the **Refresh Token** grant and
**Refresh Token Rotation** so the SDK can renew the sign-in across page reloads.
In its settings, use the actual Pages URL (this repository is a project site
under `/file-transfer-by-maxi/`):

- **Allowed Callback URLs:** `https://maxipaul0910-blip.github.io/file-transfer-by-maxi/`
- **Allowed Logout URLs:** `https://maxipaul0910-blip.github.io/file-transfer-by-maxi/`
- **Allowed Web Origins:** `https://maxipaul0910-blip.github.io`

The app's callback and logout URL include the repository path because GitHub
Pages serves this repository below that path. The web origin does not include a
path. The root URLs `https://maxipaul0910-blip.github.io/` alone will redirect
away from the app after sign-in/sign-out.

In **Authentication > Social**, enable Google and GitHub, configure each
provider's credentials in Auth0, and ensure both connections are enabled for
this application. This app selects the Auth0 connection names `google-oauth2`
and `github`.

### Run locally

1. Add the local origin you will actually use to Auth0 → Applications →
   your SPA app. If you run the server on port 8765 (as `serve.py` does), add:
   - **Allowed Callback URLs:** `http://127.0.0.1:8765/`
   - **Allowed Logout URLs:** `http://127.0.0.1:8765/`
   - **Allowed Web Origins:** `http://127.0.0.1:8765`

   If you instead run `python3 -m http.server 8000`, add the same three with
   `http://localhost:8000`. Note that Auth0 treats `127.0.0.1` and `localhost`
   as different origins, so register whichever one you open in the browser.
2. From the project folder run `python3 serve.py` (serves on port 8765) or
   `python3 -m http.server 8000`.
3. Open the matching URL (`http://127.0.0.1:8765/`) and try Google or GitHub
   sign-in.

Do not open `index.html` directly with a `file://` URL. Auth0 redirects back to
the URL of the page that started sign-in, so local testing needs the localhost
URLs above registered.

The Auth0 SDK stores its token cache in this browser's local storage to keep the
session across reloads and the `/dashboard/` route. Sign out on shared devices;
tokens in local storage are available to JavaScript running on this site.

## Roles and beta access

The static site includes an admin panel backed by a Cloudflare Worker and D1
database; setup details are in [`worker/README.md`](worker/README.md). The
Worker and database are deployed, but role management remains unavailable
until the Auth0 API is configured in the same tenant used by the app. The
verified `maxi.paul0910@gmail.com` account is the initial administrator.
Admins can create roles and assign the built-in permissions to registered
users; the `Beta tester` role unlocks the Labs preview card.

The role API stores user identity and role data in D1. It does not support
arbitrary homepage HTML or JavaScript edits. To expose a new preview capability,
add a named permission and explicitly gate that feature in application code.

## Uploads and share links

The upload form sends files to [Filebin](https://filebin.net/) and creates a
random bin for each upload. The resulting public link works from other devices
and browser profiles. Filebin stores the file, not this repository, and removes
uploads automatically. Files are sent to a third-party service and shared by
public link; do not upload private or sensitive data. Links stop working when
Filebin expires or removes the file, and its storage capacity can temporarily
prevent uploads.

New share links open a FloFileTransfer-styled download page with file details
and a download button. Filebin sends `X-Frame-Options: deny`, so browsers block
its website from being displayed inside an iframe; the button opens the
Filebin-hosted download directly instead.

Links created before this external upload integration are browser-local. Their
file contents were never sent to a storage service, so upload the file again to
create a shareable link.

## Personal dashboard and upload history

After sign-in, open **Personal dashboard** from the profile menu or visit
`/dashboard/` on the same site. The dashboard shows the Auth0 profile, account
details, upload counts and sizes, recent uploads, favorites, upload history
tools, and personal settings. The homepage stays focused on browsing and
uploading files.
Multiple files can be selected or dropped together; the per-user setting can
run one, two, or three Filebin requests at once, and one failed file does not
stop the others. The page shows each file's waiting, uploading, success, or
error state. Byte-level
progress is unavailable through the current Filebin `fetch` upload request.

Upload metadata, favorite flags, tags, notes, and preferences are stored in the
current browser's localStorage. Signed-in metadata is keyed to the Auth0 subject;
anonymous history continues to use its separate legacy browser-local store.
Nothing synchronizes across devices because this project has no user-data
backend. Notes and tags are local metadata and are not sent to Filebin. Export
the history as JSON or CSV to keep a copy. “Remove from history” removes only
local metadata; the Filebin-hosted file remains publicly reachable until
Filebin expires or removes it. Filebin documents a `DELETE /{bin}/{filename}`
API, but its current CORS preflight response does not allow the cross-origin
`DELETE` method required by this GitHub Pages app. File size and extension
restrictions are enforced by Filebin's response, so the browser does not
impose guessed limits. See the [Filebin API documentation](https://filebin.net/api).
