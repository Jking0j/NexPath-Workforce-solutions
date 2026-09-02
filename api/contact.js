// /api/contact.js — Vercel Serverless Function
//
// Receives the NextPath contact form submission (from main.js) and creates
// a task in ClickUp instead of emailing through Web3Forms.
//
// Requires two environment variables, set in Vercel → Project → Settings →
// Environment Variables (never commit these):
//   CLICKUP_API_TOKEN  — personal API token from ClickUp → Settings → Apps
//   CLICKUP_LIST_ID    — the List new enquiries should land in as tasks

const CLICKUP_API_TOKEN = process.env.CLICKUP_API_TOKEN;
const CLICKUP_LIST_ID = process.env.CLICKUP_LIST_ID;

// --- Abuse guards --------------------------------------------------------
// Vercel functions are stateless and can run on many instances, so this rate
// limit is best-effort (it resets whenever a fresh instance is used). Paired
// with the honeypot field and the length caps below, it's enough to blunt a
// casual spam script against a low-traffic form — it isn't meant to stop a
// determined attacker, which would need an auth layer this public form can't have.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 6;
const hits = global.__nextpathContactHits || (global.__nextpathContactHits = new Map());

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

// Rejects requests whose Origin/Referer point at a different host than the one
// serving this function. This only stops browser-driven cross-site abuse (a
// non-browser client can set any header it likes) — it's a cheap extra layer,
// not the only line of defense.
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

const MAX_LEN = { name: 200, email: 320, company: 200, msg: 5000, freightType: 100, origin: 200, destination: 200 };

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!CLICKUP_API_TOKEN || !CLICKUP_LIST_ID) {
    console.error('Missing CLICKUP_API_TOKEN or CLICKUP_LIST_ID env vars');
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
  const company = String(body.company || '').trim();
  const msg = String(body.msg || '').trim();
  const intent = body.intent === 'freight' ? 'freight' : 'talent';
  const intentLabel = intent === 'freight' ? 'freight' : 'recruitment';
  const freightType = String(body.freightType || '').trim();
  const origin = String(body.origin || '').trim();
  const destination = String(body.destination || '').trim();

  if (!name || !email) {
    return res.status(400).json({ success: false, error: 'Name and email are required.' });
  }
  // Very loose email sanity check — the browser already does the real validation.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, error: 'That email address doesn\'t look right.' });
  }
  if (intent === 'freight' && (!freightType || !origin || !destination)) {
    return res.status(400).json({ success: false, error: 'Freight type, origin and destination are required.' });
  }

  for (const [field, value] of Object.entries({ name, email, company, msg, freightType, origin, destination })) {
    if (value.length > MAX_LEN[field]) {
      return res.status(400).json({ success: false, error: `That ${field} is too long.` });
    }
  }

  const taskName = intent === 'freight'
    ? `New freight quote request — ${name} (${origin} → ${destination})`
    : `New recruitment enquiry — ${name}`;

  const description = [
    `**Type:** ${intentLabel}`,
    `**Name:** ${name}`,
    `**Email:** ${email}`,
    company ? `**Company:** ${company}` : null,
    intent === 'freight' ? `**Freight type:** ${freightType}` : null,
    intent === 'freight' ? `**Origin:** ${origin}` : null,
    intent === 'freight' ? `**Destination:** ${destination}` : null,
    '',
    '**Details:**',
    msg || '(none provided)',
  ].filter(Boolean).join('\n');

  try {
    const clickupRes = await fetch(`https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task`, {
      method: 'POST',
      headers: {
        'Authorization': CLICKUP_API_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: taskName,
        description,
        tags: [intentLabel],
      }),
    });

    const data = await clickupRes.json();

    if (!clickupRes.ok) {
      console.error('ClickUp API error:', clickupRes.status, data);
      return res.status(502).json({ success: false, error: 'Could not reach ClickUp.' });
    }

    return res.status(200).json({ success: true, taskId: data.id });
  } catch (err) {
    console.error('ClickUp request failed:', err);
    return res.status(502).json({ success: false, error: 'Network error contacting ClickUp.' });
  }
};
