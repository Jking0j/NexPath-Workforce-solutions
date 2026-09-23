// /api/careers.js — Vercel Serverless Function
//
// Receives the NextPath careers application form submission (from main.js)
// and creates a task in ClickUp, with the candidate's resume (if provided)
// attached to that task.
//
// Requires two environment variables, set in Vercel → Project → Settings →
// Environment Variables (never commit these):
//   CLICKUP_API_TOKEN         — personal API token from ClickUp → Settings → Apps
//                                (shared with /api/contact.js)
//   CLICKUP_CAREERS_LIST_ID   — the List candidate applications should land in
//
// Once the task is created, a no-reply confirmation email is sent to the
// candidate if the Resend variables are set — see /api/_autoreply.js.

const { sendAutoReply } = require('./_autoreply');

const CLICKUP_API_TOKEN = process.env.CLICKUP_API_TOKEN;
const CLICKUP_CAREERS_LIST_ID = process.env.CLICKUP_CAREERS_LIST_ID;

// --- Abuse guards --------------------------------------------------------
// Same best-effort approach as /api/contact.js — see the comment there. This
// resets whenever Vercel spins a fresh instance, so it blunts a casual spam
// script rather than guaranteeing a hard cap.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 6;
const hits = global.__nextpathCareersHits || (global.__nextpathCareersHits = new Map());

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

// See /api/contact.js — stops browser-driven cross-site abuse only, not a
// direct non-browser caller, which can set any header it likes.
function isSameOrigin(req) {
  const host = req.headers.host;
  const originHeader = req.headers.origin || req.headers.referer;
  if (!host || !originHeader) return true;
  try {
    return new URL(originHeader).host === host;
  } catch {
    return false;
  }
}

const MAX_LEN = { name: 200, email: 320, phone: 50, specialisation: 200, skills: 3000, resumeName: 300 };
const ALLOWED_NICHE = ['IT', 'Logistics', 'Both'];
const ALLOWED_EXPERIENCE = ['', 'Entry-level', '1-3 years', '3-5 years', '5+ years'];

// Resumes are sent as base64 JSON, capped client-side at 3MB raw — base64
// inflates that by ~33%, so this is a generous server-side backstop against
// an oversized payload slipping through (Vercel's hard request-body limit
// is 4.5MB).
const MAX_RESUME_BASE64_CHARS = 4_600_000;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!CLICKUP_API_TOKEN || !CLICKUP_CAREERS_LIST_ID) {
    console.error('Missing CLICKUP_API_TOKEN or CLICKUP_CAREERS_LIST_ID env vars');
    return res.status(500).json({ success: false, error: 'Server is not configured yet.' });
  }

  if (!isSameOrigin(req)) {
    return res.status(403).json({ success: false, error: 'Forbidden.' });
  }

  const ip = clientIp(req);
  if (isRateLimited(ip)) {
    return res.status(429).json({ success: false, error: 'Too many requests. Please try again later.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  // Honeypot: real visitors never fill this in, bots usually do.
  // Pretend success so the bot doesn't learn anything, but don't create a task.
  if (body.botcheck) {
    return res.status(200).json({ success: true });
  }

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const phone = String(body.phone || '').trim();
  const niche = String(body.niche || '').trim();
  const specialisation = String(body.specialisation || '').trim();
  const experience = String(body.experience || '').trim();
  const skills = String(body.skills || '').trim();
  const resumeName = String(body.resumeName || '').trim();
  const resumeType = String(body.resumeType || '').trim();
  const resumeBase64 = String(body.resumeBase64 || '');

  if (!name || !email) {
    return res.status(400).json({ success: false, error: 'Name and email are required.' });
  }
  // Very loose email sanity check — the browser already does the real validation.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, error: 'That email address doesn\'t look right.' });
  }
  if (!niche) {
    return res.status(400).json({ success: false, error: 'Please select a niche.' });
  }
  if (!ALLOWED_NICHE.includes(niche)) {
    return res.status(400).json({ success: false, error: 'Please select a valid niche.' });
  }
  if (!ALLOWED_EXPERIENCE.includes(experience)) {
    return res.status(400).json({ success: false, error: 'Please select a valid experience level.' });
  }
  for (const [field, value] of Object.entries({ name, email, phone, specialisation, skills, resumeName })) {
    if (value.length > MAX_LEN[field]) {
      return res.status(400).json({ success: false, error: `That ${field} is too long.` });
    }
  }
  if (resumeBase64 && resumeBase64.length > MAX_RESUME_BASE64_CHARS) {
    return res.status(400).json({ success: false, error: 'Resume file is too large.' });
  }

  const taskName = `New candidate application — ${name} (${niche})`;

  const description = [
    `**Niche:** ${niche}`,
    specialisation ? `**Specialisation:** ${specialisation}` : null,
    experience ? `**Experience level:** ${experience}` : null,
    `**Name:** ${name}`,
    `**Email:** ${email}`,
    phone ? `**Phone:** ${phone}` : null,
    '',
    '**Key skills:**',
    skills || '(none provided)',
    '',
    resumeName ? `**Resume attached:** ${resumeName}` : '**Resume attached:** (none)',
  ].filter(Boolean).join('\n');

  let taskId;
  try {
    const clickupRes = await fetch(`https://api.clickup.com/api/v2/list/${CLICKUP_CAREERS_LIST_ID}/task`, {
      method: 'POST',
      headers: {
        'Authorization': CLICKUP_API_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: taskName,
        description,
        tags: ['careers'],
        // The Free plan caps uses of custom task types. Explicitly create a
        // standard Task so website applications remain deliverable after the
        // Candidate task-type allowance has been exhausted.
        custom_item_id: 0,
      }),
    });

    const data = await clickupRes.json();

    if (!clickupRes.ok) {
      console.error('ClickUp API error:', clickupRes.status, data);
      return res.status(502).json({ success: false, error: 'Could not reach ClickUp.' });
    }

    taskId = data.id;
  } catch (err) {
    console.error('ClickUp request failed:', err);
    return res.status(502).json({ success: false, error: 'Network error contacting ClickUp.' });
  }

  // Attach the resume, if one was provided. The application is already
  // logged at this point, so an attachment failure is reported in the
  // server logs but doesn't fail the whole submission for the candidate.
  if (resumeBase64 && resumeName) {
    try {
      const buffer = Buffer.from(resumeBase64, 'base64');
      const blob = new Blob([buffer], { type: resumeType || 'application/octet-stream' });
      const form = new FormData();
      form.append('attachment', blob, resumeName);

      const attachRes = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/attachment`, {
        method: 'POST',
        headers: { 'Authorization': CLICKUP_API_TOKEN },
        body: form,
      });

      if (!attachRes.ok) {
        console.error('ClickUp attachment upload failed:', attachRes.status, await attachRes.text());
      }
    } catch (err) {
      console.error('ClickUp attachment upload error:', err);
    }
  }

  // Awaited so the function isn't frozen mid-send; it never throws.
  await sendAutoReply('careers', email, { name });

  return res.status(200).json({ success: true, taskId });
};
