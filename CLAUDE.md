# NextPath site — project instructions for Claude Code

This repository is a multi-page static website deployed on Vercel, with two serverless
functions in `api/` that send form submissions to ClickUp (see README.md).

## Git workflow — do this automatically

After you finish editing any file in this repo, **without waiting to be asked**:

1. Stage everything: `git add -A`
2. Commit with a short, descriptive message summarising what changed.
3. Push: `git push`

Skip only if there are no changes to commit, or a git command errors — in that
case, show me the error instead of retrying blindly. Never force-push.

## Repo facts

- Remote: `https://github.com/Jking0j/NexPath-Workforce-solutions.git`
- Default branch: `main`
- Live site: `https://www.nexpathsolution.com/` (Vercel; production builds from `main`)

## Editing rules

- Pages are plain HTML sharing `styles.css` and `main.js`. No build step, no dependencies.
- Keep the gold-and-white palette and the professional, service-focused tone.
- **Do not invent** statistics, testimonials, dates, or any facts about the business.
- Forms post to `api/contact.js` and `api/careers.js` (ClickUp tasks + Resend auto-replies).
