// /api/_autoreply.js — shared helper, not an endpoint
//
// Vercel doesn't turn files starting with "_" into functions, so this is only
// ever required by /api/contact.js and /api/careers.js.
//
// Sends a "we got your submission" confirmation from a no-reply address via
// Resend (https://resend.com), using its plain HTTP API so the site still has
// no npm dependencies.
//
// Environment variables (Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY     — API key from Resend → API Keys (starts with "re_")
//   AUTOREPLY_FROM     — verified sender, e.g. "NextPath <noreply@nexpathsolution.com>"
//                        (the domain must be verified in Resend → Domains)
//   AUTOREPLY_REPLY_TO — optional; where replies go if someone hits "Reply"
//                        anyway. Defaults to contact@nexpathsolution.com.
//
// If RESEND_API_KEY or AUTOREPLY_FROM is missing, auto-replies are simply
// skipped — the submission itself still goes through to ClickUp.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const AUTOREPLY_FROM = process.env.AUTOREPLY_FROM;
const AUTOREPLY_REPLY_TO = process.env.AUTOREPLY_REPLY_TO || 'contact@nexpathsolution.com';
const CONTACT_EMAIL = 'contact@nexpathsolution.com';
const SEND_TIMEOUT_MS = 5000;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Anyone can type any address into a public form, so this email could land in
// a stranger's inbox. Only echo the name back when it looks like a name — not a
// link or an address someone is trying to get us to deliver for them.
function greetingName(name) {
  const n = String(name || '').trim().replace(/\s+/g, ' ');
  if (!n || n.length > 60 || /https?:|www\.|@|[<>]/i.test(n)) return '';
  return n;
}

const TEMPLATES = {
  contact: ({ intent }) => ({
    subject: intent === 'freight'
      ? 'We’ve received your freight quote request'
      : 'We’ve received your enquiry',
    lines: [
      intent === 'freight'
        ? 'Thanks for your freight quote request. It’s reached our team and a coordinator will be in touch the same working day.'
        : 'Thanks for your recruitment enquiry. It’s reached our team and a coordinator will be in touch the same working day.',
    ],
  }),
  careers: () => ({
    subject: 'We’ve received your application',
    lines: [
      'Thanks for applying to join the NextPath talent pool. Your application has reached our team.',
      'We’ll review your details and a team member will be in touch if there’s a match.',
    ],
  }),
};

function buildEmail(kind, { name, ...data }) {
  const { subject, lines } = TEMPLATES[kind](data);
  const who = greetingName(name);
  const hello = who ? `Hi ${who},` : 'Hi there,';
  const footer = `This is an automated message from a no-reply address. If you need to add anything, email ${CONTACT_EMAIL}.`;

  const text = [hello, '', ...lines, '', 'The NextPath team', '', '--', footer].join('\n');

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#FCFBF8;font-family:Arial,Helvetica,sans-serif;color:#1C1C22">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FCFBF8;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-top:4px solid #C6A24C;border-radius:6px">
        <tr><td style="padding:28px 28px 8px;font-size:20px;font-weight:bold;color:#1C1C22">NextPath</td></tr>
        <tr><td style="padding:8px 28px 24px;font-size:15px;line-height:1.6">
          <p style="margin:0 0 14px">${escapeHtml(hello)}</p>
          ${lines.map(l => `<p style="margin:0 0 14px">${escapeHtml(l)}</p>`).join('\n          ')}
          <p style="margin:18px 0 0">The NextPath team</p>
        </td></tr>
        <tr><td style="padding:16px 28px 24px;border-top:1px solid #E8E3D6;font-size:12px;line-height:1.5;color:#6B6A72">
          This is an automated message from a no-reply address. If you need to add anything, email
          <a href="mailto:${CONTACT_EMAIL}" style="color:#96741F">${CONTACT_EMAIL}</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}

// Never throws: a failed confirmation email is logged but must not fail a
// submission that has already been saved to ClickUp.
async function sendAutoReply(kind, to, data) {
  if (!RESEND_API_KEY || !AUTOREPLY_FROM) return false;

  const { subject, text, html } = buildEmail(kind, data);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: AUTOREPLY_FROM,
        to: [to],
        reply_to: AUTOREPLY_REPLY_TO,
        subject,
        text,
        html,
        headers: { 'Auto-Submitted': 'auto-replied' },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error('Auto-reply send failed:', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('Auto-reply send error:', err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { sendAutoReply, buildEmail };
