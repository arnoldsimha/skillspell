(function () {
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!('IntersectionObserver' in window)) {
    return; // without html.js, CSS keeps everything visible and static
  }
  // The reduced-motion media query in style.css neutralizes all animation;
  // adding .js is safe either way because that block also forces .reveal visible.
  document.documentElement.classList.add('js');

  // Scroll reveals — hero, steps, and feature cards get a stagger within their group
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

  // Typing terminal — retype the pre-rendered lines once, when scrolled into view.
  // Skipped under reduced motion: the static lines already say everything.
  var term = document.querySelector('.js-terminal');
  if (!term || reduced) return;
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
})();
