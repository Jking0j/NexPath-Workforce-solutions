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

// Contact form -> Web3Forms (only runs on the contact page)
const form = document.getElementById('contactForm');
if (form) {
  const note = document.getElementById('formNote');
  const submitBtn = form.querySelector('button[type="submit"]');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = form.name.value.trim(), email = form.email.value.trim();
    if (!name || !email) { note.textContent = 'Please add your name and email so we can reply.'; note.style.color = '#96741F'; return; }
    const intent = form.intent.value === 'talent' ? 'recruitment' : 'freight';

    const data = new FormData(form);
    data.set('intent', intent);
    data.set('subject', 'New ' + intent + ' enquiry from ' + name);

    submitBtn.disabled = true;
    note.style.color = '#96741F';
    note.textContent = 'Sending your enquiry…';

    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: data
      });
      const out = await res.json();
      if (out.success) {
        note.textContent = 'Thanks ' + name + ', your ' + intent + ' enquiry is on its way. We reply the same working day.';
        form.reset();
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
