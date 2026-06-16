# copypastes.xyz

p5.fab is a tool for learning about machines. Built on top of the creative coding library p5.js, it helps you make physical things using code!

On this website—[copypastes.xyz]((https://www.copypastes.xyz/))—you can share your own experiments and remix others'. Like Thingiverse for 3D printing or OpenProcessing for creative code, the goal is to cultivate a community around machine and material explorations. To get started, check out the tutorials, browse recent projects, or make something new!

This repo is one of three projects in the p5.fab family:

| Project | Info | Repo |
| --- | --- | --- |
| **p5.fab** | The library that controls machines from p5.js | [machineagency/p5.fab](https://github.com/machineagency/p5.fab) |
| **copypastes.xyz** | The online editor + sharing/remixing platform | you are here! |
| **p5.fab docs** | Reference, guides, and tutorials | [machineagency/p5.fab-docs](https://github.com/machineagency/p5.fab-docs) |

## Using the Editor
Open up the [copypastes Editor](https://www.copypastes.xyz/sketch/new) to start making! Learn more at the [editor quick start guide](https://docs.copypastes.xyz/resources/guides/editor-guide/), alongside the other guides and tutorials on the documentation site. Find out everything you can do in the [Reference](https://docs.copypastes.xyz/). You can also [explore](https://www.copypastes.xyz/explore) projects people have posted and remix them!

## Contributing
All types of contributions are welcome! More documentation on contributing to come. For now, don't hesitate to make a new issue or contact Blair directly at b1air (at) uw (dot) edu.

## Dev Notes
This project is built with

- [SvelteKit](https://svelte.dev/docs/kit) (Svelte 5) — front end, deployed to Vercel.
- [Firebase](https://firebase.google.com) — Firestore (posts, users, username registry), Storage
  (post images), Auth (email/password), and App Check (reCAPTCHA v3)
- [CodeMirror](https://codemirror.net) — the in-browser code editor
- [d3](https://d3js.org) — remix-lineage graph

## Running locally

```bash
npm install
# create a .env with your Firebase project values (see the table below)
npm run dev
```

The site will be at `http://localhost:5173`.

### Environment variables

All client config is exposed to the browser by design (Firebase web keys are public identifiers, Firestore/Storage rules + App Check handle security). Set these in `.env`:

| Variable | Purpose |
| --- | --- |
| `VITE_API_KEY`, `VITE_AUTH_DOMAIN`, `VITE_DATABASE_URL`, `VITE_PROJECT_ID`, `VITE_STORAGE_BUCKET`, `VITE_MESSAGING_SENDER_ID`, `VITE_APP_ID`, `VITE_MEASUREMENT_ID` | Standard Firebase web config |
| `VITE_RECAPTCHA_SITE_KEY` | App Check reCAPTCHA v3 site key. Can be blank for local dev |
| `VITE_APPCHECK_DEBUG_TOKEN` | Dev-only. Lets `localhost` pass App Check enforcement; register it under Firebase console → App Check → Manage debug tokens |
| `VITE_SANDBOX_ORIGIN` | Untrusted sketch code runs inside a sandboxed iframe. In production it is served from a separate sandbox origin (`https://sandbox.copypastes.xyz`) so the iframe's `allow-same-origin` (needed to delegate Web Serial for printing) can never reach the app's Firebase session. See [`src/lib/sandbox.js`](src/lib/sandbox.js). Optional locally |

## Deploying
-  `git push` to `main` to deploy to Vercel.
-  `git push` does **not** update firestore/storage rules:
  ```bash
  firebase deploy --only firestore   # after editing firestore.rules
  firebase deploy --only storage     # after editing storage.rules
  ```

## Project layout

```
src/
  routes/        SvelteKit pages (gallery, sketch/[id], fabs/[id], embed, user/[id], editor)
  components/    UI components (RemixGraph, RemixPane, CodeDiff, MachineStatus, …)
  lib/           sandbox.js (iframe isolation), repl.js, sketchWrap.js, events/, examples/
  store/         app + auth state
  dbConfig.js    Firebase initialization + App Check
static/
  preview.html   the sandbox document that runs sketch code
firestore.rules  Firestore security rules
storage.rules    Storage security rules
```

## License

[MIT](LICENSE) © Blair Subbaraman.
