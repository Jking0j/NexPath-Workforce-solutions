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
// candidate if the Resend variables are set, and the outcome is added as a
// comment on the task — see /api/_autoreply.js.

const { autoReplyAndLog } = require('./_autoreply');

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
  // Drop expired entries now and then so the map can't grow without bound.
  if (hits.size > 5000) {
    for (const [key, entry] of hits) if (now - entry.start > RATE_LIMIT_WINDOW_MS) hits.delete(key);
  }
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

// Only PDF and Word files are accepted, checked by extension AND by the
// file's first bytes, so a renamed executable or HTML file can't be slipped
// into ClickUp for staff to open.
const RESUME_TYPES = {
  pdf:  { mime: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46] },          // %PDF
  doc:  { mime: 'application/msword', magic: [0xD0, 0xCF, 0x11, 0xE0] },      // OLE2
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: [0x50, 0x4B, 0x03, 0x04] }, // ZIP
};

// Returns { name, mime } for a valid resume, or null.
function checkResume(fileName, buffer) {
  const ext = (fileName.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
  const type = RESUME_TYPES[ext];
  if (!type || buffer.length < type.magic.length) return null;
  if (!type.magic.every((b, i) => buffer[i] === b)) return null;
  // Strip path separators and control/odd characters from the filename.
  const safe = fileName.replace(/[\\/\x00-\x1f<>:"|?*]+/g, '_').slice(-120);
  return { name: safe, mime: type.mime };
}

// Adds a comment to the task. Never throws.
async function commentOnTask(taskId, text) {
  try {
    const r = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/comment`, {
      method: 'POST',
      headers: { 'Authorization': CLICKUP_API_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment_text: text, notify_all: false }),
    });
    if (!r.ok) console.error('ClickUp comment failed:', r.status, await r.text());
  } catch (err) {
    console.error('ClickUp comment error:', err);
  }
}

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
  let resume = null;
  if (resumeBase64) {
    const buffer = Buffer.from(resumeBase64, 'base64');
    const checked = checkResume(resumeName, buffer);
    if (!checked) {
      return res.status(400).json({ success: false, error: 'Resume must be a PDF or Word document (.pdf, .doc, .docx).' });
    }
    resume = { ...checked, buffer };
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
    resume ? `**Resume attached:** ${resume.name}` : '**Resume attached:** (none)',
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
  // logged at this point, so an attachment failure doesn't fail the whole
  // submission for the candidate. Instead it's retried once, then flagged
  // with a comment on the task so the team knows to ask for the file.
  let resumeAttached = null; // null = no resume sent
  if (resume) {
    const { buffer } = resume;
    let lastError = '';
    resumeAttached = false;
    for (let attempt = 1; attempt <= 2 && !resumeAttached; attempt++) {
      try {
        const form = new FormData();
        form.append('attachment', new Blob([buffer], { type: resume.mime }), resume.name);
        const attachRes = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/attachment`, {
          method: 'POST',
          headers: { 'Authorization': CLICKUP_API_TOKEN },
          body: form,
        });
        const detail = await attachRes.text();
        if (attachRes.ok) {
          resumeAttached = true;
          console.log('ClickUp resume attached:', taskId, resume.name, buffer.length, 'bytes');
        } else {
          lastError = `ClickUp returned ${attachRes.status}`;
          console.error('ClickUp attachment upload failed:', attempt, attachRes.status, detail);
        }
      } catch (err) {
        lastError = err.message;
        console.error('ClickUp attachment upload error:', attempt, err);
      }
    }
    if (!resumeAttached) {
      await commentOnTask(taskId,
        `Resume "${resume.name}" was submitted but could not be attached (${lastError}). Please ask the candidate to email it to contact@nexpathsolution.com.`);
    }
  }

  // Awaited so the function isn't frozen mid-send; it never throws.
  await autoReplyAndLog('careers', email, { name }, taskId, CLICKUP_API_TOKEN);

  return res.status(200).json({ success: true, taskId, resumeAttached });
};
