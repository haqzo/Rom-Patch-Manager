# Who can use dev mode, and how publishing is protected

Short version: `?dev` only **shows** the dev tools. It is not a login and never will be. Anyone can open `?dev`,
make a draft, and preview it in their own browser. That is harmless, because a draft never leaves the browser.
**Publishing** is the only thing that changes the website, and GitHub decides who may do it.

## What actually protects the website today

| Layer | What it does |
|---|---|
| GitHub repository permissions | Publishing commits through the GitHub API with the user's own token. GitHub only accepts the commit if that account has write access to `haqzo/Rom-Patch-Manager`. Right now that means Haqzo (owner) and MaToRiuKo (`matoriuko-cmd`, collaborator). |
| Permission check in dev mode | After sign-in, dev mode asks GitHub (`GET /user`, `GET /repos/haqzo/Rom-Patch-Manager` → `permissions.push`) and only enables **Publish** when GitHub says yes. This is only a convenience: the real check is GitHub refusing the commit. |
| Validation before commit | Dev mode refuses to publish missing files, broken references, presets pointing at removed items, and similar problems. The site build (`scripts/add-community.mjs`) runs the same checks again and **fails the deploy** if `edits.json` is broken, so the old site stays online. |
| Review option | **Send for review (pull request)** puts the changes on a `dev/<login>-…` branch and opens a PR. Nothing changes until someone merges it. |
| Content-Security-Policy | The page may only talk to `api.github.com` (plus itself), so a token typed into the page can't be sent anywhere else by the page. |

## Token handling (changed in this upgrade)

- The token is kept in **sessionStorage** by default, so it's forgotten when the browser closes.
  "Remember on this device" keeps it in localStorage (the old behaviour).
- **Sign out** removes it from both.
- The token is never written into drafts, `.rpmpack` files, `edits.json` or commits.

Recommended token for Haqzo and Mato: a **fine-grained personal access token**:
- Repository access: only `haqzo/Rom-Patch-Manager`
- Permissions: **Contents: Read and write** and, for the pull-request option, **Pull requests: Read and write**
- An expiry date (e.g. 90 days)

If a token leaks, revoke it on github.com → Settings → Developer settings. That is the only step needed.

## Options for making it stricter (not built: they need decisions or a server)

1. **Branch protection / rulesets on `main`**, with Haqzo and MaToRiuKo on the bypass list. This stops anyone else
   from pushing, even a future collaborator added for something unrelated. It costs nothing and needs no code
   (repo Settings → Rules). *Recommended next step; it needs Haqzo to set it up.*
2. **Review-only publishing.** Require PRs for `main` (rule above, without bypass) and use only **Send for review**.
   This is safer and slower: every change needs a second click on GitHub.
3. **"Sign in with GitHub" instead of pasting a token** (OAuth App or GitHub App). It's nicer to use and gives
   short-lived tokens. But GitHub's sign-in endpoints (`/login/oauth/access_token` and the device flow) don't allow
   calls straight from a web page (no CORS), and the web flow needs a client secret. Both need a **small server**,
   for example a Cloudflare Worker or a tiny serverless function, that only trades the sign-in code for a token. That is a
   new piece of infrastructure to host and keep safe, so it isn't built. The current fine-grained token is
   equivalent in security as long as it's kept scoped and expiring.
4. **A GitHub App installed only on this repo.** It's the most locked-down option: per-repo permissions, a 1-hour token,
   and an audit trail as the app. It needs the same small server as option 3, plus a private key to protect there.

What is deliberately **not** done: a username check in the page, a hidden URL, or a password in the JavaScript.
All of those can be bypassed by anyone who opens the browser's developer tools, so they would only look secure.
