// The review-action page's one script (docs/specs/listing-autoreview.md §4.3, D5): the held-listing
// email's Approve / Request changes buttons open https://sevi.homes/review-action/#t=<token>&p=<target>.
// The fragment never reaches GitHub Pages. This script reads it and removes it from the address bar,
// then asks the review-action function for a read-only summary ("peek"). It acts only when the
// reviewer presses a button (POST "act"). Loading the page never decides anything, so a link scanner
// that fetches or even runs the page cannot approve a listing. No storage, no cookies, no tracking,
// no third-party code. Every value from the server is written as text, never parsed as HTML.
// CONFIG is filled in at build time (src/reviewAction.ts): the function URL per target, from
// supabase/scripts/deploy/targets.mjs; the reason titles and the seller's statement wording, from
// supabase/functions/_shared/review-reasons.json; the type names.
(function () {
  'use strict';
  var CONFIG = {"targets":{"staging":"https://pcddbdmymozbzsmdwfwm.supabase.co/functions/v1/review-action","prod":"https://badflqpjcyztbhwbhogb.supabase.co/functions/v1/review-action"},"reasons":{"photos_people":{"title":"People or private details in photos","why":"Photos can't show people, faces, house numbers or number plates.","fix":"Replace those photos, then send your listing again."},"photos_quality":{"title":"Some photos need to be clearer","why":"Buyers can't see the home well in some photos: too dark, blurred, a screenshot or a watermark.","fix":"Take them again in daylight with the lights on, or pick the originals from your camera roll."},"misleading_edit":{"title":"An edited photo changes the home","why":"An edit may only remove things you'd put away before a viewing. It can't hide damage or change the home or its view.","fix":"Use the original, or edit it again and brush only over movable things."},"wrong_details":{"title":"Some details don't match","why":"Something in the details doesn't match the photos or the energy certificate.","fix":"Check the type, size, rooms, energy class and price, then send it again."},"contact_details_in_text":{"title":"Contact details in the text","why":"Phone numbers, emails, links and social handles can't be in the description. Buyers reach you through SEVI.","fix":"Remove them, then send your listing again."},"other":{"title":"Something else","why":"Our team explains below.","fix":"Follow the note from our team, then send your listing again."}},"statement":{"changesLead":"We checked your listing and it can't go live yet. Here's what to change.","noteTitle":"From our team","decidedBy":"A person on our team made this decision.","appeal":"Think we got it wrong? Write to support@sevi.homes and we'll look again.","scopeChanges":"Until then your listing isn't shown to buyers. Send it again once it's fixed."},"types":{"apartment":"Apartment","house_villa":"House","maisonette":"Maisonette","new_development":"New build","land":"Land"}};
  var TOKEN = /^rv1_[A-Za-z0-9_-]{43}$/;
  var APP_PATH = 'In the app: SEVI Pilot → Profile → Review listings.';
  var NOTE_REASONS = ['other', 'photos_people', 'photos_quality', 'misleading_edit'];
  var STATES = {
    used: ['Already decided', 'This listing was already decided from this email or in the app. Nothing more to do.'],
    expired: ['This link has expired', 'Open the listing in the app to decide.'],
    revoked: ['This link was replaced', 'A newer email for this listing has its own buttons. Use that one, or the app.'],
    stale: ['The listing changed', 'The seller changed the listing since this email, or it was already decided. Open it in the app.'],
    disabled: ['Email buttons are off', 'Decide in the app for now.'],
    not_found: ['This link is not valid', 'Open the listing in the app to decide.'],
    locked: ['This link is locked', 'It was opened too many times. Open the listing in the app to decide.'],
  };
  var ERRORS = {
    review_action_invalid: 'This link no longer works. Open the listing in the app.',
    review_action_disabled: 'Email buttons are off. Decide in the app.',
    review_version_stale: 'The seller changed the listing since this email. Open it in the app.',
    review_photos_changed: 'The photos changed since this email. Open the listing in the app.',
    listing_not_in_review: 'This listing is no longer waiting for review.',
    own_listing: 'You cannot decide your own listing.',
    not_staff: 'The review desk account is not staff any more. Use the app.',
    listing_not_publishable: 'It cannot go live yet. Open it in the app to see why.',
    invalid_reason: 'One of the reasons is not allowed here. Reload the page and try again.',
    reason_required: 'Pick at least one reason.',
    note_required: 'Add a note for the seller (say which photos, for example photo 2 and 5).',
    note_too_long: 'The note is too long (1,000 characters at most).',
    action_rate_limited: 'Too many tries. Wait ten minutes, or use the app.',
  };

  var root = document.getElementById('ra-root');
  if (!root || !CONFIG) return;
  // Frame busting: GitHub Pages cannot send frame-ancestors, so a framed page shows nothing.
  if (window.top !== window.self) {
    document.body.textContent = '';
    return;
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) node.setAttribute(k, attrs[k]);
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }
  function show(nodes) {
    root.textContent = '';
    nodes.forEach(function (n) { if (n) root.appendChild(n); });
    root.setAttribute('aria-busy', 'false');
    var h = root.querySelector('h1');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus(); }
  }
  function message(title, body) {
    show([el('h1', null, [title]), el('p', { class: 'lead' }, [body]), el('p', { class: 'meta' }, [APP_PATH])]);
  }
  function group(n) { return Math.round(n).toLocaleString('en-GB'); }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

  // The fragment, read once and removed from the address bar and history.
  var params = {};
  (location.hash || '').replace(/^#/, '').split('&').forEach(function (kv) {
    var i = kv.indexOf('=');
    if (i > 0) params[kv.slice(0, i)] = kv.slice(i + 1);
  });
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
  var token = params.t || '';
  var url = Object.prototype.hasOwnProperty.call(CONFIG.targets, params.p) ? CONFIG.targets[params.p] : null;
  if (!url || !TOKEN.test(token)) {
    message(STATES.not_found[0], STATES.not_found[1]);
    return;
  }

  function post(body) {
    return fetch(url, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) { return { status: res.status, data: data || {} }; });
    });
  }

  function verdict(pc) {
    if (!pc) return 'Not checked';
    var range = num(pc.abs_min) && num(pc.abs_max) ? '€' + group(pc.abs_min) + '–' + group(pc.abs_max) + ' per m²' : 'the national range';
    switch (pc.status) {
      case 'inside': return 'Inside the reference band';
      case 'inside_floor_only': return 'Above the floor (no upper reference)';
      case 'above': return pc.basis === 'absolute' ? 'Outside ' + range + ' (not a public reference)' : 'Above the band' + (num(pc.ratio_to_mid) ? ': ' + pc.ratio_to_mid + '× the reference' : '');
      case 'below': return pc.basis === 'absolute' ? 'Outside ' + range + ' (not a public reference)' : 'Below the band' + (num(pc.ratio_to_mid) ? ': ' + pc.ratio_to_mid + '× the reference' : '');
      case 'no_reference': return 'No reference for this area yet';
      case 'not_applicable': return 'Not checked for land';
      case 'no_size': return 'No size given';
      default: return 'Not checked';
    }
  }

  function summary(p) {
    var l = p.listing || {};
    var f = l.title_facts || {};
    var pc = l.price_check || null;
    var rooms = [];
    if (num(f.bedrooms) !== null) rooms.push(f.bedrooms + (f.bedrooms === 1 ? ' bedroom' : ' bedrooms'));
    if (num(f.bathrooms) !== null) rooms.push(f.bathrooms + (f.bathrooms === 1 ? ' bathroom' : ' bathrooms'));
    var rows = [
      ['Listing', [CONFIG.types[f.property_type] || 'Listing', f.area_name_en || 'Greece'].join(' · ')],
      ['Size', num(f.living_m2) ? group(f.living_m2) + ' m²' + (num(f.plot_m2) ? ' · plot ' + group(f.plot_m2) + ' m²' : '') : (num(f.plot_m2) ? 'plot ' + group(f.plot_m2) + ' m²' : 'not given')],
      ['Rooms', rooms.length ? rooms.join(' · ') : 'not given'],
      ['Price', num(l.price_eur) ? '€' + group(l.price_eur) : 'not given'],
      ['Price per m²', pc && num(pc.price_per_m2) ? '€' + group(pc.price_per_m2) : 'not computed'],
      ['Price check', verdict(pc)],
    ];
    if (pc && pc.market && num(pc.market.low) && num(pc.market.high)) {
      rows.push(['Similar homes', '€' + group(pc.market.low) + '–' + group(pc.market.high) + ' per m² (' + (pc.market.label_en || 'reference') + (pc.market.date ? ', ' + pc.market.date : '') + ')']);
    }
    rows.push(['Version', String(p.review_version) + ' · ' + (p.photos_count || 0) + ' photos']);
    return el('dl', { class: 'ra-summary' }, rows.reduce(function (acc, r) {
      acc.push(el('dt', null, [r[0]]), el('dd', null, [r[1]]));
      return acc;
    }, []));
  }

  function button(label) {
    return el('button', { type: 'button', class: 'ra-button' }, [label]);
  }
  function busy(btn, on, label) {
    btn.disabled = on;
    btn.setAttribute('aria-busy', on ? 'true' : 'false');
    btn.textContent = label;
  }
  function errorLine() {
    return el('p', { class: 'ra-error', role: 'alert', hidden: '' }, []);
  }
  function setError(node, text) {
    node.textContent = text;
    if (text) node.removeAttribute('hidden'); else node.setAttribute('hidden', '');
  }
  function act(btn, label, errNode, body, done) {
    busy(btn, true, 'Working…');
    setError(errNode, '');
    post(body).then(function (r) {
      if (r.status === 200 && r.data && r.data.landed) {
        done(r.data.landed);
        return;
      }
      var code = r.data && r.data.error;
      busy(btn, false, label);
      setError(errNode, ERRORS[code] || 'Something went wrong. Try again, or use the app.');
    }, function () {
      busy(btn, false, label);
      setError(errNode, 'No connection. Try again, or use the app.');
    });
  }

  function approveView(p) {
    var err = errorLine();
    var btn = button('Approve');
    btn.addEventListener('click', function () {
      act(btn, 'Approve', err, { op: 'act', token: token }, function (landed) {
        message(landed === 'live' ? 'Approved: live now' : 'Approved: stays paused',
          landed === 'live' ? 'Buyers can see the listing.' : 'The seller had paused it; it stays paused until they resume.');
      });
    });
    show([
      el('h1', null, ['Approve this listing?']),
      summary(p),
      el('p', { class: 'lead' }, ['It goes live for buyers at once.']),
      el('div', { class: 'ra-actions' }, [btn]),
      err,
      el('p', { class: 'meta' }, ['Not sure? ' + APP_PATH]),
    ]);
  }

  function changesView(p) {
    var allowed = Array.isArray(p.reasons_allowed) ? p.reasons_allowed.filter(function (c) { return CONFIG.reasons[c]; }) : [];
    var boxes = allowed.map(function (code) {
      var id = 'ra-r-' + code;
      var input = el('input', { type: 'checkbox', id: id, value: code });
      return { code: code, input: input, row: el('div', { class: 'ra-check' }, [input, el('label', { for: id }, [CONFIG.reasons[code].title])]) };
    });
    var note = el('textarea', { id: 'ra-note', rows: '4', maxlength: '1000', 'aria-describedby': 'ra-note-help' }, []);
    var help = el('p', { id: 'ra-note-help', class: 'meta' }, ['Needed for photo reasons, a misleading edit and "Other": say which photos, for example photo 2 and 5.']);
    var preview = el('div', { class: 'ra-preview', 'aria-live': 'polite' }, []);
    var err = errorLine();
    var btn = button('Send request');
    function chosen() { return boxes.filter(function (b) { return b.input.checked; }).map(function (b) { return b.code; }); }
    function render() {
      var codes = chosen();
      var text = note.value.trim();
      var s = CONFIG.statement;
      var parts = [el('p', { class: 'overline' }, ['WHAT THE SELLER READS']), el('p', null, [s.changesLead])];
      codes.forEach(function (c) {
        var r = CONFIG.reasons[c];
        parts.push(el('p', null, [el('strong', null, [r.title]), ' ' + r.why + ' ' + r.fix]));
      });
      if (text) parts.push(el('p', null, [el('strong', null, [s.noteTitle + ': ']), text]));
      parts.push(el('p', { class: 'meta' }, [s.scopeChanges + ' ' + s.decidedBy + ' ' + s.appeal]));
      preview.textContent = '';
      parts.forEach(function (n) { preview.appendChild(n); });
    }
    boxes.forEach(function (b) { b.input.addEventListener('change', render); });
    note.addEventListener('input', render);
    btn.addEventListener('click', function () {
      var codes = chosen();
      var text = note.value.trim();
      if (!codes.length) { setError(err, ERRORS.reason_required); return; }
      if (!text && codes.some(function (c) { return NOTE_REASONS.indexOf(c) >= 0; })) { setError(err, ERRORS.note_required); return; }
      act(btn, 'Send request', err, { op: 'act', token: token, reasons: codes, note: text || null }, function () {
        message('Sent to the seller', 'They see what to change and can send the listing again.');
      });
    });
    render();
    show([
      el('h1', null, ['Ask the seller for changes']),
      summary(p),
      el('fieldset', { class: 'ra-reasons' }, [el('legend', null, ['Reasons'])].concat(boxes.map(function (b) { return b.row; }))),
      el('label', { for: 'ra-note', class: 'ra-label' }, ['Note to the seller']),
      note,
      help,
      preview,
      el('div', { class: 'ra-actions' }, [btn]),
      err,
      el('p', { class: 'meta' }, [APP_PATH]),
    ]);
  }

  post({ op: 'peek', token: token }).then(function (r) {
    var p = r.data || {};
    if (r.status === 429) { message('Too many tries', ERRORS.action_rate_limited); return; }
    if (r.status !== 200) { message('Something went wrong', 'Reload the page, or open the listing in the app.'); return; }
    if (p.state === 'ready' && p.action === 'approve') approveView(p);
    else if (p.state === 'ready' && p.action === 'changes') changesView(p);
    else { var s = STATES[p.state] || STATES.not_found; message(s[0], s[1]); }
  }, function () {
    message('No connection', 'Reload the page when you are online, or open the listing in the app.');
  });
})();
