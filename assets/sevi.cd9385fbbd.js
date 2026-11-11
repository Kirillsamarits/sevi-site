(function () {
'use strict';
var CONFIG = {"awayMs":20000,"replays":2,"probe":"/assets/sevi/probe.avif","veilMs":150,"lateMs":1500,"bytes":{"/assets/sevi/greeting-560.webp":1277046,"/assets/sevi/greeting-720.avif":722422,"/assets/sevi/success-560.webp":1286188,"/assets/sevi/success-720.avif":732512}};
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
var i = new Image(), p = w.performance;
i.src = src;
return (i.decode ? i.decode() : new Promise(function (ok, no) { i.onload = ok; i.onerror = no; })).then(function () {
var e = p && p.getEntriesByName && p.getEntriesByName(i.src).pop(), n = e && e.decodedBodySize;
if (n && CONFIG.bytes[src] && n != CONFIG.bytes[src]) throw 0;
return i;
});
}
var avif = null;
function avifDrawn() {
return avif || (avif = w.OffscreenCanvas ? decoded(CONFIG.probe).then(function (i) {
var c = d.createElement('canvas'), x = c.getContext('2d'), p;
c.width = c.height = 16;
x.drawImage(i, 0, 0);
p = x.getImageData(0, 8, 16, 1).data;
return p[3] === 0 && p[63] === 255;
}).then(null, function () { return false; }) : Promise.resolve(false));
}

function moment(img) {
var box = img.parentNode, cl = box.classList, poster = img.getAttribute('src'), ms = +img.getAttribute('data-ms');
var restAlt = img.getAttribute('alt'), momentAlt = img.getAttribute('data-alt-moment');
var cut = img.getAttribute('data-cut') != null;
var url, ready = null, playing = false, plays = 0;
function say(alt) { if (momentAlt) img.setAttribute('alt', alt); }
function pick(u) { url = u; return decoded(u); }
function fetchIt() {
if (!ready) {
ready = avifDrawn().then(function (yes) {
var modern = yes && img.getAttribute('data-moment-avif');
var old = function () { avif = Promise.resolve(false); return pick(img.getAttribute('data-moment')); };
return modern ? pick(modern).then(null, old) : old();
}).then(function () {
return decoded(poster);
}).then(null, function (e) {
ready = null;
throw e;
});
}
return ready;
}
function rest() { cl.remove('is-playing', 'is-veiled', 'is-fading'); say(restAlt); playing = false; }
function play(may, began) {
if (playing || !ms) return;
playing = true;
fetchIt().then(function () {
if (!may()) return rest();
plays++;
if (began) began();
say(momentAlt);
var veil = new Image(), ending;
veil.alt = '';
veil.setAttribute('aria-hidden', 'true');
veil.className = 'sevi sevi-veil';
veil.src = poster;
box.appendChild(veil);
cl.add('is-playing', 'is-veiled');
img.src = url;
var raf = w.requestAnimationFrame;
raf(function () { raf(function () { if (!ending) { cl.remove('is-veiled'); cl.add('is-fading'); } }); });
setTimeout(function () {
ending = 1;
if (cut) cl.remove('is-fading');
cl.add('is-veiled');
setTimeout(function () {
img.src = poster;
var lift = function () { if (veil.parentNode) box.removeChild(veil); rest(); };
if (img.decode) img.decode().then(lift, lift); else lift();
}, cut ? 0 : CONFIG.veilMs);
}, ms);
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
