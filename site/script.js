(function () {
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!('IntersectionObserver' in window)) {
    return; // without html.js, CSS keeps everything visible and static
  }
  // The reduced-motion media query in style.css neutralizes all animation;
  // adding .js is safe either way because that block also forces .reveal visible.
  document.documentElement.classList.add('js');

  // ── Scroll reveals — hero, steps, and feature cards stagger within their group
  var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  ['.hero', '.steps', '.feat-list'].forEach(function (scope) {
    var group = document.querySelectorAll(scope + ' .reveal');
    Array.prototype.forEach.call(group, function (el, i) {
      el.style.transitionDelay = (i * 90) + 'ms';
    });
  });

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      io.unobserve(entry.target);
    });
  }, { threshold: 0.15 });
  reveals.forEach(function (el) { io.observe(el); });

  if (!reduced) {
    initConstellation();
    initTerminal();
  }

  // ── Living constellation: drifting stars connect into lines, lean toward
  //    the cursor, and a meteor streaks by every so often.
  function initConstellation() {
    var hero = document.querySelector('.hero');
    var canvas = document.querySelector('.hero-canvas');
    if (!hero || !canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    hero.classList.add('has-canvas');

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, stars = [], meteor = null, mouse = null;
    var LINK_DIST = 120, MOUSE_DIST = 170;

    function resize() {
      W = hero.clientWidth; H = hero.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var count = Math.min(110, Math.floor((W * H) / 16000));
      stars = [];
      for (var i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * W, y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22,
          r: 0.6 + Math.random() * 1.1,
          a: 0.35 + Math.random() * 0.55,
          tw: Math.random() * Math.PI * 2,
          violet: Math.random() < 0.3
        });
      }
    }

    function spawnMeteor() {
      meteor = {
        x: W * (0.35 + Math.random() * 0.6), y: -20,
        vx: -(4.5 + Math.random() * 3), vy: 2.2 + Math.random() * 1.6,
        life: 1
      };
    }
    function scheduleMeteor() {
      setTimeout(function () { spawnMeteor(); scheduleMeteor(); }, 6000 + Math.random() * 6000);
    }

    hero.addEventListener('mousemove', function (e) {
      var b = hero.getBoundingClientRect();
      mouse = { x: e.clientX - b.left, y: e.clientY - b.top };
    });
    hero.addEventListener('mouseleave', function () { mouse = null; });
    window.addEventListener('resize', resize);

    var running = false, rafId = 0;
    function frame(t) {
      ctx.clearRect(0, 0, W, H);

      // stars: drift, twinkle, gentle pull toward the cursor
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        if (mouse) {
          var mdx = mouse.x - s.x, mdy = mouse.y - s.y;
          var md = Math.sqrt(mdx * mdx + mdy * mdy);
          if (md < MOUSE_DIST && md > 1) {
            s.x += (mdx / md) * 0.25; s.y += (mdy / md) * 0.25;
          }
        }
        s.x += s.vx; s.y += s.vy;
        if (s.x < -5) s.x = W + 5; if (s.x > W + 5) s.x = -5;
        if (s.y < -5) s.y = H + 5; if (s.y > H + 5) s.y = -5;
        var glow = s.a * (0.75 + 0.25 * Math.sin(t / 900 + s.tw));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = s.violet
          ? 'rgba(167,139,250,' + glow + ')'
          : 'rgba(199,203,255,' + glow + ')';
        ctx.fill();
      }

      // constellation lines between nearby stars
      for (var a = 0; a < stars.length; a++) {
        for (var b2 = a + 1; b2 < stars.length; b2++) {
          var dx = stars[a].x - stars[b2].x, dy = stars[a].y - stars[b2].y;
          var d2 = dx * dx + dy * dy;
          if (d2 < LINK_DIST * LINK_DIST) {
            var alpha = (1 - Math.sqrt(d2) / LINK_DIST) * 0.16;
            ctx.strokeStyle = 'rgba(129,140,248,' + alpha + ')';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(stars[a].x, stars[a].y);
            ctx.lineTo(stars[b2].x, stars[b2].y);
            ctx.stroke();
          }
        }
        // lines from cursor to nearby stars — the visitor casts their own sigil
        if (mouse) {
          var cdx = stars[a].x - mouse.x, cdy = stars[a].y - mouse.y;
          var cd2 = cdx * cdx + cdy * cdy;
          if (cd2 < MOUSE_DIST * MOUSE_DIST) {
            var calpha = (1 - Math.sqrt(cd2) / MOUSE_DIST) * 0.22;
            ctx.strokeStyle = 'rgba(167,139,250,' + calpha + ')';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(stars[a].x, stars[a].y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
          }
        }
      }

      // meteor: bright head with a fading tail
      if (meteor) {
        var m = meteor;
        var grad = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 22, m.y - m.vy * 22);
        grad.addColorStop(0, 'rgba(224,226,255,' + (0.9 * m.life) + ')');
        grad.addColorStop(1, 'rgba(224,226,255,0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - m.vx * 22, m.y - m.vy * 22);
        ctx.stroke();
        m.x += m.vx; m.y += m.vy;
        if (m.x < -160 || m.y > H + 40) meteor = null;
      }

      rafId = requestAnimationFrame(frame);
    }

    function start() { if (!running) { running = true; rafId = requestAnimationFrame(frame); } }
    function stop() { if (running) { running = false; cancelAnimationFrame(rafId); } }

    // only animate while the hero is on screen and the tab is visible
    new IntersectionObserver(function (entries) {
      entries[0].isIntersecting ? start() : stop();
    }, { threshold: 0 }).observe(hero);
    document.addEventListener('visibilitychange', function () {
      document.hidden ? stop() : start();
    });

    resize();
    scheduleMeteor();
    start();
  }

  // ── Typing terminal — retype the pre-rendered lines once, on scroll into view
  function initTerminal() {
    var term = document.querySelector('.js-terminal');
    if (!term) return;
    var lines;
    try { lines = JSON.parse(term.getAttribute('data-lines')); } catch (e) { return; }
    var body = term.querySelector('.t-body');
    if (!body || !Array.isArray(lines)) return;

    var tio = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      tio.disconnect();
      body.innerHTML = '';
      typeLine(0);
    }, { threshold: 0.4 });
    tio.observe(term);

    function typeLine(idx) {
      if (idx >= lines.length) return;
      var line = lines[idx];
      var el = document.createElement('div');
      el.className = 't-line' + (line.ok ? ' ok' : '');
      body.appendChild(el);
      if (line.ok) {
        el.textContent = line.ok;
        var caret = document.createElement('span');
        caret.className = 'caret';
        el.appendChild(caret);
        return;
      }
      var prompt = document.createElement('span');
      prompt.className = 'p';
      prompt.textContent = line.p + ' ';
      el.appendChild(prompt);
      var text = document.createTextNode('');
      el.appendChild(text);
      var i = 0;
      (function tick() {
        if (i <= line.c.length) {
          text.nodeValue = line.c.slice(0, i);
          i++;
          setTimeout(tick, 24);
        } else {
          setTimeout(function () { typeLine(idx + 1); }, 260);
        }
      })();
    }
  }
})();
