// Register / Log In pages (one module, two modes). Matches the site's layout; animated card.
import { html, raw, icon, logo, api, setTitle } from '../lib.js';
import { account, safeNext } from '../state.js';
import { data } from '../components.js';
import { navigate, refreshHeader } from '../app.js';

function strength(pw) {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  return Math.min(4, score);
}
const LEVELS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];

export default async function authPage(root, { arg, query }) {
  const mode = arg === 'register' ? 'register' : 'login';
  const next = safeNext(query.get('next'));
  const nextQs = query.get('next') ? `?next=${encodeURIComponent(next)}` : '';
  const fromGate = Boolean(query.get('next'));
  setTitle(mode === 'register' ? 'Register' : 'Log In');
  const products = await data.products().catch(() => []);

  const field = (id, label, type, auto, extra = '') => html`<div class="af">
    <input id="${id}" name="${id}" type="${type}" autocomplete="${auto}" placeholder=" " required ${extra ? raw(extra) : ''}>
    <label for="${id}">${label}</label>
    ${type === 'password' ? html`<button type="button" class="af-eye" data-eye="${id}" aria-label="Show password">${icon('eye')}</button>` : ''}
    <small class="af-err" id="${id}-err"></small>
  </div>`;

  root.innerHTML = String(html`
  <section class="auth-wrap">
    <div class="auth-card" data-mode="${mode}">
      <aside class="auth-side">
        <a class="brand brand-light" href="/">${logo()}<span>Cedar Bear</span></a>
        <h2>${mode === 'register' ? 'Join Cedar Bear' : 'Welcome back'}</h2>
        <p>${mode === 'register' ? 'Create your free account to shop our alcohol-free herbal formulas and exclusive campaign offers.' : 'Log in to continue shopping, claim campaign offers and check out.'}</p>
        <ul class="auth-perks">
          <li>${icon('bag')}<span>Shop the full herbal catalog</span></li>
          <li>${icon('tag')}<span>Unlock campaign-exclusive offers</span></li>
          <li>${icon('cart')}<span>One cart for catalog &amp; offers</span></li>
          <li>${icon('shield')}<span>Secure account &amp; faster checkout</span></li>
        </ul>
        <div class="auth-bottles" aria-hidden="true">${products.slice(0, 3).map((p, i) => html`<img src="${p.images[0].src}" alt="" class="ab ab-${i}">`)}</div>
      </aside>

      <div class="auth-main">
        <div class="auth-tabs" role="tablist">
          <a href="/login${nextQs}" role="tab" aria-selected="${mode === 'login'}" class="${mode === 'login' ? 'on' : ''}">Log In</a>
          <a href="/register${nextQs}" role="tab" aria-selected="${mode === 'register'}" class="${mode === 'register' ? 'on' : ''}">Register</a>
          <span class="auth-tab-ink" aria-hidden="true"></span>
        </div>
        <h1>${mode === 'register' ? 'Create your account' : 'Log in to your account'}</h1>
        <p class="muted">${fromGate ? 'Please log in or register to access the shop.' : mode === 'register' ? 'It only takes a minute.' : 'Good to see you again.'}</p>
        <div class="notice notice-error auth-error" role="alert" hidden></div>
        <form id="auth-form" novalidate>
          ${mode === 'register' ? field('name', 'Full name', 'text', 'name', 'maxlength="80"') : ''}
          ${field('email', 'Email address', 'email', 'email')}
          ${field('password', 'Password', 'password', mode === 'register' ? 'new-password' : 'current-password')}
          ${mode === 'register' ? html`<div class="pw-meter" aria-live="polite"><span class="pw-bar"><i></i></span><small class="pw-label">Use 8+ characters with a letter and a number</small></div>
            ${field('confirm', 'Confirm password', 'password', 'new-password')}
            <label class="auth-check"><input type="checkbox" id="terms" required> <span>I agree to the <a href="/terms" target="_blank" rel="noopener">Terms</a> and <a href="/privacy" target="_blank" rel="noopener">Privacy</a> notice</span></label>
            <small class="af-err" id="terms-err"></small>` : ''}
          <button class="btn btn-primary btn-lg btn-block auth-submit" type="submit"><span>${mode === 'register' ? 'Create Account' : 'Log In'}</span>${icon('arrowR')}</button>
        </form>
        <p class="auth-switch">${mode === 'register'
          ? html`Already have an account? <a href="/login${nextQs}">Log in</a>`
          : html`New to Cedar Bear? <a href="/register${nextQs}">Create an account</a>`}</p>
        <p class="auth-demo">${icon('flask')} Phase 1 demo: accounts are for testing the shop — no payment details are ever requested.</p>
      </div>

      <div class="auth-success" hidden>
        <svg class="check-draw" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27 l7 7 l15 -16"/></svg>
        <h2 class="success-title"></h2>
        <p class="muted">Taking you to the shop…</p>
      </div>
    </div>
  </section>`);

  const $ = (s) => root.querySelector(s);
  const form = $('#auth-form');
  const card = $('.auth-card');
  const errBox = $('.auth-error');
  const setErr = (id, msg) => {
    const el = $(`#${id}-err`); if (el) el.textContent = msg || '';
    const input = $(`#${id}`); if (input) input.closest('.af')?.classList.toggle('invalid', Boolean(msg));
  };
  const showError = (msg) => {
    errBox.hidden = !msg;
    errBox.textContent = msg || '';
    if (msg) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
  };

  root.querySelectorAll('[data-eye]').forEach((b) => b.addEventListener('click', () => {
    const input = $(`#${b.dataset.eye}`);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    b.classList.toggle('on', show);
  }));
  form.addEventListener('input', (e) => {
    if (e.target.id) setErr(e.target.id, '');
    if (e.target.id === 'password' && mode === 'register') {
      const s = strength(e.target.value);
      const meter = $('.pw-meter');
      meter.dataset.level = e.target.value ? String(s) : '';
      $('.pw-label').textContent = e.target.value ? `Password strength: ${LEVELS[s]}` : 'Use 8+ characters with a letter and a number';
    }
  });
  if (mode === 'register') ['change', 'input', 'click'].forEach((ev) => $('#terms').addEventListener(ev, () => { if ($('#terms').checked) setErr('terms', ''); }));

  function validate() {
    const v = (id) => ($(`#${id}`)?.value || '').trim();
    const errs = {};
    if (mode === 'register' && !v('name')) errs.name = 'Enter your name';
    if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(v('email'))) errs.email = 'Enter a valid email address';
    const pw = $('#password').value;
    if (mode === 'register') {
      if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) errs.password = 'At least 8 characters, with a letter and a number';
      if ($('#confirm').value !== pw) errs.confirm = 'Passwords do not match';
      if (!$('#terms').checked) errs.terms = 'Please accept the Terms to continue';
    } else if (!pw) errs.password = 'Enter your password';
    ['name', 'email', 'password', 'confirm', 'terms'].forEach((k) => setErr(k, errs[k]));
    const first = Object.keys(errs)[0];
    if (first) { $(`#${first}`)?.focus(); showError(''); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
    return !first;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    if (!validate()) return;
    const btn = $('.auth-submit');
    btn.disabled = true; btn.classList.add('loading');
    try {
      const body = mode === 'register'
        ? { name: $('#name').value.trim(), email: $('#email').value.trim(), password: $('#password').value }
        : { email: $('#email').value.trim(), password: $('#password').value };
      const { user } = await api(`/api/account/${mode}`, { method: 'POST', body });
      account.set(user);
      refreshHeader();
      // Success: animated check, then on to the page the visitor wanted.
      $('.success-title').textContent = mode === 'register' ? `Welcome, ${user.name.split(' ')[0]}!` : `Welcome back, ${user.name.split(' ')[0]}!`;
      card.classList.add('done');
      $('.auth-success').hidden = false;
      setTimeout(() => navigate(next, { replace: true }), 1100);
    } catch (ex) {
      btn.disabled = false; btn.classList.remove('loading');
      if (ex.data?.field) setErr(ex.data.field, ex.message);
      showError(ex.message || 'Something went wrong — please try again.');
    }
  });
  setTimeout(() => $(mode === 'register' ? '#name' : '#email')?.focus({ preventScroll: true }), 350);
}
