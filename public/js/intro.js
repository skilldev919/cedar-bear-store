// Launch loading screen: a small cloud spins in the centre of a deep forest-green background with "Loading...",
// for 2.5 seconds, then fades out to the main page. Plays once per browser session.
// Loaded synchronously right after #intro in index.html so the screen is in place before first paint.
(function () {
  var el = document.getElementById('intro');
  if (!el) return;
  var seen = false;
  try { seen = sessionStorage.getItem('cb_intro_seen') === '1'; sessionStorage.setItem('cb_intro_seen', '1'); } catch (e) { /* storage blocked */ }
  if (seen) { el.remove(); return; }

  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', 'Loading');
  el.innerHTML =
    '<div class="intro-box">' +
      '<div class="intro-spinner">' +
        '<svg viewBox="0 0 64 64" aria-hidden="true">' +
          '<circle cx="32" cy="32" r="30" fill="#f6f1e4"/>' +
          '<path d="M20 42h25a8 8 0 0 0 1.2-15.9A11 11 0 0 0 25.3 24 8.5 8.5 0 0 0 20 42z" fill="#7fa88a" stroke="#f6f1e4" stroke-width="2" stroke-linejoin="round"/>' +
        '</svg>' +
      '</div>' +
      '<p class="intro-text">Loading<span>.</span><span>.</span><span>.</span></p>' +
    '</div>';
  document.documentElement.classList.add('intro-on');

  var done = false;
  function finish() {
    if (done) return;
    done = true;
    el.classList.add('out');
    document.documentElement.classList.remove('intro-on');
    setTimeout(function () { el.remove(); }, 450);
  }
  setTimeout(finish, 2500);
})();
