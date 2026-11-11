// The waitlist form on the home pages (apps/web/src/waitlist.ts). One request, on submit only, to
// public.join_waitlist on the project in CONFIG. It holds no copy: every message is a data-msg-*
// attribute of the form, so this one file serves English and Greek. No storage, no cookies, no
// other host. Without this script the line under the form gives an email address instead.
(function () {
  'use strict';
  var CONFIG = {"url":"https://badflqpjcyztbhwbhogb.supabase.co/rest/v1/rpc/join_waitlist","key":"sb_publishable_PX5vOCPOTSS-e2FJ9NwQCg__3HU7KG_","consentVersion":"2026-11-10"};
  var TIMEOUT_MS = 10000;
  // The space kept between what a field error shows and the window's edges, in px.
  var EDGE = 16;
  var EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
  // The RPC's refusals (P0001 messages) → the form's message keys.
  var REFUSALS = {
    invalid_email: 'email', consent_required: 'consent', waitlist_closed: 'closed', waitlist_outdated: 'outdated',
    invalid_role: 'outdated', invalid_area: 'outdated', invalid_language: 'outdated'
  };

  var byId = function (id) { return document.getElementById(id); };
  var form = byId('waitlist');
  if (!form || !CONFIG) return;
  var status = byId('waitlist-status');
  var done = byId('waitlist-done');
  var doneTitle = byId('waitlist-done-title');
  var button = byId('waitlist-submit');
  var email = byId('wl-email');
  var area = byId('wl-area');
  var consent = byId('wl-consent');
  var trap = byId('wl-hp-7q');
  var roles = [byId('wl-role-owner'), byId('wl-role-seeker')];
  var fields = roles.concat([email, consent]);
  var idleLabel = button.textContent;
  var sending = false;

  function message(key) { return form.getAttribute('data-msg-' + key) || ''; }

  function clear() {
    for (var i = 0; i < fields.length; i++) {
      fields[i].removeAttribute('aria-invalid');
      fields[i].removeAttribute('aria-describedby');
    }
    status.removeAttribute('data-state');
    status.textContent = '';
  }

  // The message sits just above the button that was pressed. After a field error the page moves
  // only as far as it must: up to show the field where both fit, never so far that the message
  // leaves the screen (a jump to the field alone would hide it on a small phone).
  function reveal(field) {
    if (typeof window === 'undefined' || !window.scrollBy || !status.getBoundingClientRect) return;
    var group = (field.closest && field.closest('.field')) || field;
    var top = group.getBoundingClientRect().top;
    var bottom = status.getBoundingClientRect().bottom;
    var room = window.innerHeight - EDGE;
    var dy = top < EDGE ? top - EDGE : 0;
    if (bottom - dy > room) dy = bottom - room;
    if (dy) window.scrollBy(0, dy);
  }

  function fail(key, field) {
    status.setAttribute('data-state', 'error');
    status.textContent = message(key);
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', 'waitlist-status');
      field.focus({ preventScroll: true });
      reveal(field);
    }
  }

  function succeed() {
    form.hidden = true;
    done.hidden = false;
    doneTitle.focus();
  }

  // The button is never disabled: a disabled button drops the keyboard's focus to the page, and
  // after a failed try Enter would do nothing. `sending` is what stops a second request.
  function busy(on) {
    sending = on;
    if (on) button.setAttribute('aria-disabled', 'true'); else button.removeAttribute('aria-disabled');
    if (on) button.setAttribute('aria-busy', 'true'); else button.removeAttribute('aria-busy');
    button.textContent = on ? message('sending') : idleLabel;
  }

  function chosenRole() {
    for (var i = 0; i < roles.length; i++) if (roles[i].checked) return roles[i].value;
    return null;
  }

  function send(body) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
    return fetch(CONFIG.url, {
      method: 'POST',
      headers: { apikey: CONFIG.key, Authorization: 'Bearer ' + CONFIG.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (json) {
        clearTimeout(timer);
        return { status: res.status, json: json };
      });
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (sending) return;
    clear();
    var role = chosenRole();
    var address = String(email.value || '').trim();
    if (!role) return fail('role', roles[0]);
    if (address.length > 254 || !EMAIL.test(address)) return fail('email', email);
    if (!consent.checked) return fail('consent', consent);

    busy(true);
    send({
      p_email: address,
      p_role: role,
      p_area: area.value,
      p_language: document.documentElement.lang === 'el' ? 'el' : 'en',
      p_consent: true,
      p_consent_version: CONFIG.consentVersion,
      // The honeypot, as it stands: the server decides and counts it (never dropped here, so an
      // autofilled field shows up in the counts instead of losing a person silently).
      p_website: String((trap && trap.value) || '').slice(0, 320)
    }).then(function (reply) {
      busy(false);
      var json = reply.json || {};
      if (reply.status === 200 && json.ok === true) return succeed();
      if (reply.status === 400 && typeof json.message === 'string' && REFUSALS[json.message]) {
        var key = REFUSALS[json.message];
        return fail(key, key === 'email' ? email : key === 'consent' ? consent : null);
      }
      fail('busy', null);
    }, function (err) {
      busy(false);
      // A request we stopped waiting for is slow, not offline.
      fail(err && err.name === 'AbortError' ? 'busy' : 'network', null);
    });
  });

  // "Join as an owner" / "Join as a home seeker": the link jumps to the form; choose its answer too.
  var links = document.querySelectorAll('a[data-role]');
  for (var i = 0; i < links.length; i++) {
    (function (link) {
      link.addEventListener('click', function () {
        var want = link.getAttribute('data-role');
        for (var j = 0; j < roles.length; j++) roles[j].checked = roles[j].value === want;
      });
    })(links[i]);
  }
})();
