# Garden blog

A small, framework-free garden journal: centered text and a photo grid per post. Click a photo to open a full-screen carousel. The site is static HTML, CSS, and JavaScript—no build step—and is meant to be hosted on **GitHub Pages**.

**Phase 1:** Reader site with responsive layout, `data/posts.json` as the source of truth, photo grid + carousel, sample posts, and `.nojekyll` for Pages — **done** in this repo.

## Phased roadmap

| Phase | Focus | Status |
| ----- | ----- | ------ |
| **1 — Reader site** | Responsive layout, JSON posts, photo grid, carousel, sample content, GitHub Pages notes | Complete |
| **2 — Authoring on Mac** | Local preview with a static server; how to add posts (JSON + images); git push updates the public site | Documented below |
| **3 — Dev UI (optional)** | Local admin at `admin.html` edits JSON and uploads images | Complete |
| **4 — iOS app** | Poster app under `ios/` using the same content contract | Not started (folder reserved) |

## Repository layout

- `index.html` — page shell
- `styles/main.css` — layout, grid, carousel
- `scripts/app.js` — loads posts, renders articles, carousel behavior
- `admin.html` + `scripts/admin.js` + `styles/admin.css` — local admin UI (see below)
- `data/posts.json` — post list (title, date, body, image paths)
- `assets/posts/<slug>/` — images for each post
- `ios/` — reserved for the future app (empty stub)

## Local development vs public site

| Context | What you do | What visitors see |
| -------- | ----------- | ----------------- |
| **Local** | From the repo root, run a static HTTP server, edit `data/posts.json` and files under `assets/posts/`, refresh the browser | — |
| **Public** | Commit and push to the branch GitHub Pages serves | The same static files as the live site |

Use a local server so `fetch("data/posts.json")` works (opening `index.html` as a `file://` URL often blocks fetches).

**Example (Python 3):**

```bash
cd /path/to/garden-blog
python3 -m http.server 8080
```

Then open `http://localhost:8080/` for the public site, or `http://localhost:8080/admin.html` for the admin UI.

**Example (Node, if you have npx):**

```bash
npx --yes serve .
```

## Adding a post (Phase 2 workflow)

1. Create a folder under `assets/posts/<slug>/` and add image files (JPEG, PNG, WebP, etc.).
2. Edit `data/posts.json` and append an object with:
   - `id` — unique string (e.g. UUID or timestamp)
   - `slug` — folder name under `assets/posts/`
   - `title` — post title
   - `date` — ISO 8601 date string (e.g. `2026-03-27`)
   - `body` — plain text; use `\n` in JSON for line breaks
   - `images` — array of paths relative to the site root, e.g. `assets/posts/my-slug/01.jpg`
3. Newest posts can be listed first in the array (the site sorts by `date` descending).
4. Commit, push, and wait for GitHub Pages to update.

The future dev UI or iOS app should output this same JSON shape and file layout.

## Admin UI (`admin.html`)

Use this on your Mac with the same local static server as the site (repo root as the server root).

1. Open `http://localhost:8080/admin.html` (port may differ).
2. **Choose project folder** — In Chrome or Edge, pick your `garden-blog` repo root. The admin loads `data/posts.json` from disk. Grant read/write permission when the browser asks.
3. Or **Load posts from server** — Uses `fetch("data/posts.json")` (same as the public site). Use this if you only want to preview edits without connecting a folder yet.
4. Add or edit posts: title, slug, date, body (one paragraph per line), reorder/remove images, **Upload images** to add files (paths like `assets/posts/your-slug/photo.jpg` are computed from the slug).
5. **Save everything** — With a connected folder: writes `data/posts.json` and copies new images under `assets/posts/`. Without folder support (or if you skip picking a folder): downloads `posts.json` and each new image; replace `data/posts.json` manually and move downloaded images into the matching paths (downloaded names use `__` instead of `/` — rename the file to the path shown in the list).

**Tip:** After saving to disk, refresh `index.html` to verify. Commit and push when you are happy.

The admin page can be hosted on GitHub Pages like any other file; only **Choose project folder** gives real writes, and only after you explicitly select your local repo (visitors cannot change your computer).

## GitHub Pages

1. Push this repository to GitHub.
2. **Settings → Pages → Build and deployment**
   - **Source:** Deploy from a branch.
   - **Branch:** e.g. `main`, folder **`/ (root)`** (this repo keeps the site at the root).
   - If you prefer serving from **`/docs`**, move the site files into `docs/` and select that folder instead.
3. **Project site** URLs look like `https://<user>.github.io/<repo>/`. Keep links and `fetch` paths **relative** (no leading `/`) so assets resolve under the repo prefix.
4. **User/organization site** (`<user>.github.io`): usually the site lives in a dedicated repo; same relative-path rule applies from that repo’s root.

`.nojekyll` is included at the repo root so Jekyll does not ignore paths it treats specially.
