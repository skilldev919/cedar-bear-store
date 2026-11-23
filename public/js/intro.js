// Launch intro: a spiral-shaped hole opens in the centre of a full-screen cover, rotating and
// expanding for ~3 s until the page underneath is fully revealed. Plays once per browser session.
// Loaded synchronously right after #intro in index.html so the cover is in place before first paint.
(function () {
  var el = document.getElementById('intro');
  if (!el) return;
  var seen = false;
  try { seen = sessionStorage.getItem('cb_intro_seen') === '1'; sessionStorage.setItem('cb_intro_seen', '1'); } catch (e) { /* storage blocked */ }
  if (seen) { el.remove(); return; }

  var NS = 'http://www.w3.org/2000/svg';
  var ARMS = 6, DURATION = 3000;
  var mk = function (tag, attrs) { var n = document.createElementNS(NS, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); return n; };

  // Spiral arm (Archimedean) from the centre outward, in unit coordinates.
  function arm(k, rMax, turns) {
    var d = '', a0 = (Math.PI * 2 * k) / ARMS;
    for (var i = 0; i <= 64; i++) {
      var u = i / 64, r = u * rMax, a = a0 + u * turns * Math.PI * 2;
      d += (i ? 'L' : 'M') + (Math.cos(a) * r).toFixed(4) + ' ' + (Math.sin(a) * r).toFixed(4);
    }
    return d;
  }

  var svg = mk('svg', { width: '100%', height: '100%', 'aria-hidden': 'true' });
  var defs = mk('defs', {});
  var grad = mk('radialGradient', { id: 'introBg', cx: '50%', cy: '45%', r: '75%' });
  [['0', '#2f5a3c'], ['.55', '#24432f'], ['1', '#14281b']].forEach(function (s) { grad.appendChild(mk('stop', { offset: s[0], 'stop-color': s[1] })); });
  defs.appendChild(grad);

  // Mask: white = cover visible, black = the spiral hole.
  var mask = mk('mask', { id: 'introMask', maskUnits: 'userSpaceOnUse', x: '0', y: '0', width: '100%', height: '100%' });
  mask.appendChild(mk('rect', { x: '0', y: '0', width: '100%', height: '100%', fill: '#fff' }));
  var hole = mk('g', {});
  hole.appendChild(mk('circle', { cx: '0', cy: '0', r: '0.3', fill: '#000' }));
  for (var k = 0; k < ARMS; k++) hole.appendChild(mk('path', { d: arm(k, 1, 0.62), fill: 'none', stroke: '#000', 'stroke-width': '0.17', 'stroke-linecap': 'round' }));
  mask.appendChild(hole);
  defs.appendChild(mask);
  svg.appendChild(defs);

  var cover = mk('g', { mask: 'url(#introMask)' });
  cover.appendChild(mk('rect', { x: '0', y: '0', width: '100%', height: '100%', fill: 'url(#introBg)' }));
  // Faint vortex lines on the cover, turning with the hole.
  var swirl = mk('g', { opacity: '0.35' });
  for (var j = 0; j < ARMS; j++) swirl.appendChild(mk('path', { d: arm(j + 0.5, 1.9, 0.9), fill: 'none', stroke: '#ffe8a3', 'stroke-width': '0.012', 'stroke-linecap': 'round' }));
  cover.appendChild(swirl);
  var brand = mk('text', { x: '50%', y: '50%', 'text-anchor': 'middle', fill: '#f6f2e8', 'font-family': 'Merriweather, Georgia, serif', 'font-weight': '900', 'font-size': '34', 'letter-spacing': '1' });
  brand.textContent = 'Cedar Bear';
  var tag = mk('text', { x: '50%', y: '50%', 'text-anchor': 'middle', fill: '#cfe3cf', 'font-family': '"Source Sans 3", Segoe UI, sans-serif', 'font-size': '15', 'letter-spacing': '3' });
  tag.textContent = 'A HEALTHY LIFESTYLE, NATURALLY';
  cover.appendChild(brand);
  cover.appendChild(tag);
  svg.appendChild(cover);
  // Golden rim glow around the opening.
  var rim = mk('circle', { cx: '0', cy: '0', r: '0.3', fill: 'none', stroke: '#ffe08a', 'stroke-width': '0.03', opacity: '0.9' });
  svg.appendChild(rim);
  el.appendChild(svg);
  el.classList.add('ready');
  document.documentElement.classList.add('intro-on');

  var start = null, done = false;
  var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };
  function frame(now) {
    if (done) return;
    if (start === null) start = now;
    var t = Math.min(1, (now - start) / DURATION);
    var w = window.innerWidth, h = window.innerHeight, cx = w / 2, cy = h / 2;
    var diag = Math.sqrt(w * w + h * h);
    // Hole stays small for a moment, then accelerates until its core covers the whole screen.
    var grow = t < 0.12 ? 0 : Math.pow((t - 0.12) / 0.88, 2.4);
    var scale = 18 + grow * (diag / 0.6) * 1.08;
    var rot = easeOut(t) * 600;
    var tr = 'translate(' + cx + ' ' + cy + ') rotate(' + rot + ') scale(' + scale + ')';
    hole.setAttribute('transform', tr);
    rim.setAttribute('transform', tr);
    rim.setAttribute('opacity', String(0.9 * (1 - t)));
    swirl.setAttribute('transform', 'translate(' + cx + ' ' + cy + ') rotate(' + (rot * 0.6) + ') scale(' + (diag * 0.42) + ')');
    var textY = cy + 70 + scale * 0.05;
    brand.setAttribute('y', String(textY));
    tag.setAttribute('y', String(textY + 30));
    if (t < 1) requestAnimationFrame(frame); else finish();
  }
  function finish() {
    if (done) return;
    done = true;
    el.classList.add('out');
    document.documentElement.classList.remove('intro-on');
    setTimeout(function () { el.remove(); }, 350);
  }
  // Skip on click / key press.
  el.addEventListener('pointerdown', finish);
  window.addEventListener('keydown', finish, { once: true });
  requestAnimationFrame(frame);
  setTimeout(finish, DURATION + 1500); // safety net if animation frames are throttled
})();
