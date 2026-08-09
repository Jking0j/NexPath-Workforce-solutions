# NextPath — Recruitment &amp; Logistics

A single-page marketing website for **NextPath**, a company offering both recruitment
and logistics services. Built as one self-contained `index.html` file — no build step,
no dependencies, no framework. Just open it or host it.

Palette: gold-and-white with charcoal contrast bands. Fonts load from Google Fonts.

---

## Files

| File | What it is |
|------|------------|
| `index.html` | The entire website (HTML, CSS, and JS inline) |
| `README.md` | This file |
| `.gitignore` | Standard ignores |
| `LICENSE` | MIT license (edit or remove as you like) |

---

## View it locally

Just double-click `index.html`, or serve it:

```bash
# Python 3
python3 -m http.server 8000
# then open http://localhost:8000
```

---

## Publish free with GitHub Pages

1. Create a new repository on GitHub (e.g. `nextpath-site`).
2. Push these files (see commands below).
3. In the repo, go to **Settings → Pages**.
4. Under **Build and deployment**, set **Source: Deploy from a branch**,
   **Branch: `main`**, folder **`/ (root)`**, then **Save**.
5. Your site goes live at `https://<your-username>.github.io/<repo-name>/`
   within a minute or two.

To use a custom domain (e.g. `nextpath.co`), add it under **Settings → Pages →
Custom domain**, then create a `CNAME` file in the repo containing just your domain.

---

## Push to GitHub

```bash
cd nextpath
git init
git add .
git commit -m "Initial commit: NextPath site"
git branch -M main
git remote add origin git@github.com:Jking0j/NexPath-Workforce-solutions.git
git push -u origin main
```

If SSH isn't set up, use HTTPS instead:

```bash
git remote add origin https://github.com/Jking0j/NexPath-Workforce-solutions.git
git push -u origin main
```

If the push is rejected because the repo already has commits (e.g. you added a
README on GitHub), sync first:

```bash
git pull --rebase origin main
git push -u origin main
```

Once Pages is enabled (Settings → Pages → Deploy from a branch → `main` / root),
the site will be live at:
**https://jking0j.github.io/NexPath-Workforce-solutions/**

---

## Before you go live — replace the placeholders

Open `index.html` and update:

- **Phone numbers** — search for `+1 (000) 000-0000` and `+1 (000) 000-0001`
- **Email** — search for `hello@nextpath.co`
- **Copyright year** — the `© 2026` in the footer, if needed

The site intentionally contains **no invented statistics or testimonials** — it
describes the services offered rather than making unverifiable claims. If you
later have real figures (e.g. years in operation, placements, on-time rate) or a
genuine client quote, they'd fit naturally in the hero strip or the "Our promise"
section.

## Make the contact form actually send

The form currently validates and shows a confirmation message but does **not**
send anywhere. To make it work, connect it to a form backend such as
[Formspree](https://formspree.io), [Basin](https://usebasin.com), or your own
endpoint. In short: give the `<form>` an `action` URL and `method="POST"`, then
remove the `e.preventDefault()` demo handler at the bottom of `index.html`
(or point the fetch at your endpoint).

---

## License

MIT — see `LICENSE`. Replace with your own terms if preferred.
