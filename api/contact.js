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

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!CLICKUP_API_TOKEN || !CLICKUP_LIST_ID) {
    console.error('Missing CLICKUP_API_TOKEN or CLICKUP_LIST_ID env vars');
    return res.status(500).json({ success: false, error: 'Server is not configured yet.' });
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

  if (!name || !email) {
    return res.status(400).json({ success: false, error: 'Name and email are required.' });
  }
  // Very loose email sanity check — the browser already does the real validation.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, error: 'That email address doesn\'t look right.' });
  }

  const taskName = `New ${intentLabel} enquiry — ${name}`;
  const description = [
    `**Type:** ${intentLabel}`,
    `**Name:** ${name}`,
    `**Email:** ${email}`,
    company ? `**Company:** ${company}` : null,
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
