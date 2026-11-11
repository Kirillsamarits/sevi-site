(function () {
'use strict';
var CONFIG = {"awayMs":20000,"replays":2,"smallBelow":440,"veilMs":150,"lateMs":1500};
var d = document, w = window;
if (!CONFIG) return;
var done = d.querySelector('img[data-play="shown"]'), form = d.getElementById('waitlist');
var block = done && done.closest('[hidden]'), onShown = null;
if (block && form && w.MutationObserver) {
form.addEventListener('focusin', function () { done.loading = 'eager'; }, { once: true });
new MutationObserver(function () {
if (block.hidden) return;
if (done.parentNode.scrollIntoView) done.parentNode.scrollIntoView({ block: 'nearest' });
if (onShown) onShown();
}).observe(block, { attributes: true, attributeFilter: ['hidden'] });
}

if (!w.matchMedia || !matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
if (!('IntersectionObserver' in w) || !w.Promise) return;
if (navigator.connection && navigator.connection.saveData) return;

function decoded(src) {
var i = new Image();
i.src = src;
return i.decode ? i.decode() : new Promise(function (ok, no) { i.onload = ok; i.onerror = no; });
}

function moment(img) {
var box = img.parentNode, poster = img.getAttribute('src'), ms = +img.getAttribute('data-ms');
var restAlt = img.getAttribute('alt'), momentAlt = img.getAttribute('data-alt-moment');
var url, ready = null, playing = false, plays = 0;
function say(alt) { if (momentAlt) img.setAttribute('alt', alt); }
function fetchIt() {
if (!ready) {
var px = img.getBoundingClientRect().width * (w.devicePixelRatio || 1);
url = (px < CONFIG.smallBelow && img.getAttribute('data-moment-small')) || img.getAttribute('data-moment');
ready = Promise.all([decoded(url), decoded(poster)]).then(null, function (e) { ready = null; throw e; });
}
return ready;
}
function rest() { box.classList.remove('is-playing'); say(restAlt); playing = false; }
function play(may, began) {
if (playing || !ms) return;
playing = true;
fetchIt().then(function () {
if (!may()) return rest();
plays++;
if (began) began();
say(momentAlt);
box.classList.add('is-playing');
var veil = new Image();
veil.alt = '';
veil.setAttribute('aria-hidden', 'true');
veil.className = 'sevi sevi-veil';
veil.src = poster;
box.appendChild(veil);
img.src = url;
var raf = w.requestAnimationFrame || function (fn) { setTimeout(fn, 16); };
raf(function () { raf(function () { veil.className = 'sevi sevi-veil is-off'; }); });
setTimeout(function () { veil.className = 'sevi sevi-veil'; }, ms);
setTimeout(function () {
img.src = poster;
var lift = function () { if (veil.parentNode) box.removeChild(veil); rest(); };
if (img.decode) img.decode().then(lift, lift); else lift();
}, ms + CONFIG.veilMs);
}, rest);
}
return { get: fetchIt, play: play, plays: function () { return plays; }, expect: function () { say(momentAlt); } };
}

var imgs = d.querySelectorAll('img[data-moment]');
for (var i = 0; i < imgs.length; i++) (function (img) {
var m = moment(img);
if (img.getAttribute('data-play') === 'view') {
var leftAt = 0, seen = false, inView = false;
var may = function () { return inView && !d.hidden; };
var wave = function () {
if (!may() || (seen && !(leftAt && Date.now() - leftAt >= CONFIG.awayMs && m.plays() <= CONFIG.replays))) return;
m.play(may, function () { seen = true; });
};
var io = new IntersectionObserver(function (entries) {
var e = entries[entries.length - 1];
inView = e.intersectionRatio >= 0.6;
if (inView) { wave(); leftAt = 0; } else if (e.intersectionRatio === 0 && seen && !leftAt) leftAt = Date.now();
}, { threshold: [0, 0.6] });
d.addEventListener('visibilitychange', wave);
var start = function () { m.expect(); m.get().then(null, function () {}); io.observe(img); };
if (d.readyState === 'complete') start(); else w.addEventListener('load', start);
} else if (img === done && block && form && w.MutationObserver) {
form.addEventListener('focusin', function () { m.get().then(null, function () {}); }, { once: true });
onShown = function () {
var at = Date.now();
m.play(function () { return !block.hidden && Date.now() - at <= CONFIG.lateMs; });
};
}
})(imgs[i]);
})();
