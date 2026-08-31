// ===== Shared behaviour for every NextPath page =====

// Mobile menu toggle
const menuBtn = document.getElementById('menuBtn');
const navlinks = document.getElementById('navlinks');
if (menuBtn && navlinks) {
  menuBtn.addEventListener('click', () => {
    const open = navlinks.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', open);
  });
  navlinks.querySelectorAll('a').forEach(a =>
    a.addEventListener('click', () => {
      navlinks.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', false);
    })
  );
}

// Scroll-reveal for elements marked .reveal
const io = new IntersectionObserver(
  es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }),
  { threshold: .14 }
);
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

// Subtle header shadow once the page has scrolled
const navEl = document.querySelector('header.nav');
if (navEl) {
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { navEl.classList.toggle('scrolled', window.scrollY > 8); ticking = false; });
  }, { passive: true });
}

// Contact form -> ClickUp (via /api/contact serverless function; only runs on the contact page)
const form = document.getElementById('contactForm');
if (form) {
  const note = document.getElementById('formNote');
  const submitBtn = form.querySelector('button[type="submit"]');
  const submitLabel = document.getElementById('submitLabel');
  const freightFields = document.getElementById('freightFields');
  const intentRadios = form.querySelectorAll('input[name="intent"]');

  // Show the freight-specific fields, and relabel the button, based on the selected intent
  function syncIntent() {
    const isFreight = form.intent.value === 'freight';
    freightFields.hidden = !isFreight;
    submitLabel.textContent = isFreight ? 'Get quote' : 'Send enquiry';
  }
  intentRadios.forEach(r => r.addEventListener('change', syncIntent));
  syncIntent();

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = form.name.value.trim(), email = form.email.value.trim();
    if (!name || !email) { note.textContent = 'Please add your name and email so we can reply.'; note.style.color = '#96741F'; return; }

    const intent = form.intent.value; // 'talent' or 'freight'
    const freightType = form.freightType.value.trim();
    const origin = form.origin.value.trim();
    const destination = form.destination.value.trim();

    if (intent === 'freight' && (!freightType || !origin || !destination)) {
      note.textContent = 'Please add the freight type, origin and destination so we can quote accurately.';
      note.style.color = '#96741F';
      return;
    }

    const payload = {
      name,
      email,
      company: form.company.value.trim(),
      msg: form.msg.value.trim(),
      intent,
      freightType,
      origin,
      destination,
      botcheck: form.botcheck.checked
    };

    submitBtn.disabled = true;
    note.style.color = '#96741F';
    note.textContent = intent === 'freight' ? 'Getting your quote request through\u2026' : 'Sending your enquiry\u2026';

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const out = await res.json();
      if (out.success) {
        note.textContent = 'Submitted successfully! A team member will contact you shortly.';
        form.reset();
        syncIntent();
      } else {
        note.textContent = 'Something went wrong. Please email contact@nexpathsolution.com directly.';
      }
    } catch (err) {
      note.textContent = 'Network error. Please email contact@nexpathsolution.com directly.';
    } finally {
      submitBtn.disabled = false;
    }
  });
}
