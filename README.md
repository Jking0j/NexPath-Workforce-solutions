# NextPath — Recruitment &amp; Logistics

A multi-page marketing website for **NextPath**, a company offering both recruitment
and logistics services across Australia. Plain HTML/CSS/JS, no build step, no
framework — plus two small Vercel serverless functions that send form submissions
straight into ClickUp as tasks.

Palette: gold-and-white with charcoal contrast bands. Fonts load from Google Fonts.

---

## Files

| File | What it is |
|------|------------|
| `index.html` | Home |
| `services.html` | Services (recruitment + logistics) |
| `process.html` | How it works |
| `network.html` | Network / coverage |
| `careers.html` | Careers — candidate application form |
| `contact.html` | Contact — enquiry / quote-request form |
| `styles.css` | Shared stylesheet for every page |
| `main.js` | Shared behaviour: nav, scroll-reveal, both forms, back-to-top, etc. |
| `api/contact.js` | Vercel function — contact form → ClickUp task |
| `api/careers.js` | Vercel function — careers form → ClickUp task (+ resume attachment) |
| `api/_autoreply.js` | Shared helper — no-reply confirmation email to the person who submitted (not an endpoint) |
| `site.webmanifest` | Web app manifest (uses the existing icon files) |
| `robots.txt`, `sitemap.xml` | SEO |
| `vercel.json` | Clean URLs, security headers, static asset caching |
| `.env.example` | Template for the ClickUp environment variables (see below) |
| `LICENSE` | MIT license (edit or remove as you like) |

---

## Deployment: Vercel, not GitHub Pages

This site **requires Vercel** (or an equivalent platform that runs Node serverless
functions) — not plain GitHub Pages. Two things depend on it:

1. **Clean URLs.** Every page links to `/services`, `/process`, etc. with no
   `.html` extension. `vercel.json` sets `"cleanUrls": true` to make that resolve.
   Plain GitHub Pages won't rewrite those and will 404.
2. **The forms.** Both forms `fetch()` a same-origin `/api/...` endpoint. Those
   are Vercel Serverless Functions (`api/contact.js`, `api/careers.js`) — GitHub
   Pages can't run them at all.

To deploy: import the repo at [vercel.com/new](https://vercel.com/new), set the
three environment variables below under **Project → Settings → Environment
Variables**, and point your domain at the Vercel project.

## View it locally

```bash
npm i -g vercel
vercel dev
```

`vercel dev` serves the static pages **and** runs the `/api` functions locally,
so the forms work. Copy `.env.example` to `.env.local` first and fill in real
ClickUp values (see below) — without them the forms will get a 500.

Opening the HTML files directly (or a plain `python -m http.server`) will render
the pages fine, but the forms will fail since there's no `/api` to call.

---

## Forms → ClickUp

The contact form and the careers application form both post to a serverless
function, which creates a task in a ClickUp List — no email service involved.

1. In ClickUp: **avatar → Settings → Apps** → generate a personal API token
   (starts with `pk_`).
2. Create (or pick) a List for enquiries and another for candidate applications.
   Open each List → **"..." → Copy link** — the number after
   `app.clickup.com/<team_id>/v/li/` is the List ID.
3. Set these in Vercel → Project → Settings → Environment Variables:

   | Variable | Used by |
   |---|---|
   | `CLICKUP_API_TOKEN` | both functions |
   | `CLICKUP_LIST_ID` | `api/contact.js` — enquiries/quote requests |
   | `CLICKUP_CAREERS_LIST_ID` | `api/careers.js` — candidate applications |

Both functions include a honeypot field, a same-origin check, per-IP rate
limiting and input length caps — see the comments at the top of each file.
The careers function only accepts PDF and Word resumes, checked by file
extension and by the file's first bytes, so other file types can't reach ClickUp.

### No-reply confirmation emails (optional)

After a submission is saved to ClickUp, the person who filled in the form gets an
automatic "we've received it" email from a no-reply address. It's sent through
[Resend](https://resend.com) via its HTTP API (still no npm dependencies).

1. Sign up at Resend. Under **Domains**, add `nexpathsolution.com` and add the DNS
   records it gives you (SPF/DKIM), so the mail isn't flagged as spam.
2. Under **API Keys**, create a key with "Sending access".
3. Add these in Vercel → Project → Settings → Environment Variables, then redeploy:

   | Variable | Value |
   |---|---|
   | `RESEND_API_KEY` | the `re_...` key |
   | `AUTOREPLY_FROM` | e.g. `NextPath <noreply@nexpathsolution.com>` |
   | `AUTOREPLY_REPLY_TO` | optional — defaults to `contact@nexpathsolution.com` |

If `RESEND_API_KEY` or `AUTOREPLY_FROM` isn't set, no email is sent and the forms
work as before. If an email fails to send, the error is logged and the visitor still
sees success, because their submission is already in ClickUp. Each ClickUp task also gets a comment saying
whether the confirmation was sent, failed or skipped, so the team can tell who needs
a manual follow-up. The email wording lives in `api/_autoreply.js`. It only repeats the person's name (not their
message), so the form can't be used to send arbitrary text to a stranger's inbox.

---

## Before you go live — replace the placeholders

- **Email** — search for `contact@nexpathsolution.com` if that's not the real inbox.
- **Copyright year** — handled automatically now (`main.js` fills in `#year`
  from the visitor's clock), so nothing to edit each January.
- **Domain** — the canonical/OG URLs are hard-coded to
  `https://www.nexpathsolution.com/`; update every `<link rel="canonical">`,
  `og:url`, `sitemap.xml` and `robots.txt` if the domain changes.

The site intentionally contains **no invented statistics or testimonials** — it
describes the services offered rather than making unverifiable claims. If you
later have real figures or a genuine client quote, they'd fit naturally in the
hero strip or the "Our promise" section.

---

## License

MIT — see `LICENSE`. Replace with your own terms if preferred.
