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
Authentication Method** set to **None**. In its settings, use the actual Pages
URL (this repository is a project site under `/file-transfer-by-maxi/`):

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

1. Add `http://localhost:8000/` to **Allowed Callback URLs** and **Allowed
   Logout URLs**. Add `http://localhost:8000` to **Allowed Web Origins**.
2. From the project folder run `python3 -m http.server 8000`.
3. Open `http://localhost:8000/` and try Google or GitHub sign-in.

Do not open `index.html` directly with a `file://` URL. Auth0 redirects back to
the URL of the page that started sign-in, so local testing needs the localhost
URLs above registered.
