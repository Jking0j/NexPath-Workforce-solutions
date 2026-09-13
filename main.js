// ===== Shared behaviour for every NextPath page =====

// Footer year — keeps the copyright notice current with no manual edits each January
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

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

// Back-to-top button
const toTop = document.getElementById('toTop');
if (toTop) {
  let toTopTicking = false;
  window.addEventListener('scroll', () => {
    if (toTopTicking) return;
    toTopTicking = true;
    requestAnimationFrame(() => { toTop.hidden = window.scrollY < 600; toTopTicking = false; });
  }, { passive: true });
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// Count-up animation for numeric stats marked .count, once they scroll into view
const countEls = document.querySelectorAll('.count');
if (countEls.length) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animateCount = el => {
    const match = el.textContent.trim().match(/^(\d+)(.*)$/);
    if (!match) return;
    const target = parseInt(match[1], 10);
    const suffix = match[2];
    if (reduceMotion) { el.textContent = target + suffix; return; }
    const duration = 900;
    const start = performance.now();
    const step = now => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const countIo = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) { animateCount(entry.target); countIo.unobserve(entry.target); } });
  }, { threshold: .5 });
  countEls.forEach(el => countIo.observe(el));
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
    const isFreight = form.elements.intent.value === 'freight';
    freightFields.hidden = !isFreight;
    submitLabel.textContent = isFreight ? 'Get quote' : 'Send enquiry';
  }
  intentRadios.forEach(r => r.addEventListener('change', syncIntent));
  syncIntent();

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fields = form.elements;
    const name = fields.name.value.trim(), email = fields.email.value.trim();
    if (!name || !email) { note.textContent = 'Please add your name and email so we can reply.'; note.style.color = '#96741F'; return; }

    const intent = fields.intent.value; // 'talent' or 'freight'
    const freightType = fields.freightType.value.trim();
    const origin = fields.origin.value.trim();
    const destination = fields.destination.value.trim();

    if (intent === 'freight' && (!freightType || !origin || !destination)) {
      note.textContent = 'Please add the freight type, origin and destination so we can quote accurately.';
      note.style.color = '#96741F';
      return;
    }

    const payload = {
      name,
      email,
      company: fields.company.value.trim(),
      msg: fields.msg.value.trim(),
      intent,
      freightType,
      origin,
      destination,
      botcheck: fields.botcheck.checked
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

// Careers application -> ClickUp (via /api/careers serverless function; only runs on the careers page)
const careersForm = document.getElementById('careersForm');
if (careersForm) {
  const cNote = document.getElementById('careersFormNote');
  const cSubmitBtn = careersForm.querySelector('button[type="submit"]');
  const cResumeInput = document.getElementById('cResume');
  const MAX_RESUME_BYTES = 3 * 1024 * 1024; // 3MB - keeps the base64 payload safely under Vercel's request limit

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(new Error('Could not read the file.'));
      reader.readAsDataURL(file);
    });
  }

  careersForm.addEventListener('submit', async e => {
    e.preventDefault();
    const fields = careersForm.elements;
    const name = fields.name.value.trim(), email = fields.email.value.trim();
    if (!name || !email) { cNote.textContent = 'Please add your name and email so we can reply.'; cNote.style.color = '#96741F'; return; }

    const niche = fields.niche.value;
    if (!niche) { cNote.textContent = 'Please select a niche.'; cNote.style.color = '#96741F'; return; }

    let resumeName = '', resumeType = '', resumeBase64 = '';
    const file = cResumeInput.files[0];
    if (file) {
      if (file.size > MAX_RESUME_BYTES) {
        cNote.textContent = 'Your resume is over 3MB — please attach a smaller file.';
        cNote.style.color = '#96741F';
        return;
      }
      cNote.style.color = '#96741F';
      cNote.textContent = 'Preparing your application…';
      try {
        resumeBase64 = await readFileAsBase64(file);
        resumeName = file.name;
        resumeType = file.type || 'application/octet-stream';
      } catch (err) {
        cNote.textContent = 'Could not read your resume file. Please try again.';
        return;
      }
    }

    const payload = {
      name,
      email,
      phone: fields.phone.value.trim(),
      niche,
      specialisation: fields.specialisation.value.trim(),
      experience: fields.experience.value,
      skills: fields.skills.value.trim(),
      resumeName,
      resumeType,
      resumeBase64,
      botcheck: fields.botcheck.checked,
    };

    cSubmitBtn.disabled = true;
    cNote.style.color = '#96741F';
    cNote.textContent = 'Submitting your application…';
    try {
      const res = await fetch('/api/careers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const out = await res.json();
      if (out.success) {
        cNote.textContent = "Submitted successfully! A team member will be in touch if there's a match.";
        careersForm.reset();
      } else {
        cNote.textContent = out.error || 'Something went wrong. Please email contact@nexpathsolution.com directly.';
      }
    } catch (err) {
      cNote.textContent = 'Network error. Please email contact@nexpathsolution.com directly.';
    } finally {
      cSubmitBtn.disabled = false;
    }
  });
}
