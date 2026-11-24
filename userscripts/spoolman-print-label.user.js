// ==UserScript==
// @name         Spoolman: print label on the SpoolmanScale
// @namespace    spoolmanscale-bridge
// @version      2.2
// @description  Adds a button next to "Beschriftung drucken" in Spoolman that prints the selected spool's label on the SpoolmanScale (bridge firmware), directly over HTTP.
// @match        http://10.0.0.8:7912/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      10.0.20.250
// ==/UserScript==

(function () {
  'use strict';

  const SCALE = 'http://10.0.20.250';
  const USER = 'scale';            // any user name works, the scale checks the password only
  const PIN_KEY = 'scale_pin';     // kept in the userscript manager, not in this file
  const POLL_MS = 500;             // Spoolman is a single page app: the URL and the page change without a reload
  const RESULT_POLL_MS = 1500;     // the print takes about 9 s after the scale took the job
  const RESULT_TRIES = 20;
  const SHOW_MS = 5000;
  // Spoolman's own print button, in the languages of its UI. Our button is placed right behind it.
  const ANCHOR_TEXTS = ['Beschriftung drucken', 'Print labels', 'Print label'];
  const TONE = { idle: '', work: '#9aa0a6', ok: '#6fcf97', info: '#56ccf2', bad: '#eb5757' };

  const btn = document.createElement('button');
  btn.type = 'button';

  let spoolId = null;
  let busy = false;
  let mode = '';                   // 'native' (next to Spoolman's button) or 'floating'

  // The selected spool is in the address bar as ?sel=spool:<id> (a scanned old QR code is redirected there).
  function currentSpoolId() {
    const sel = new URLSearchParams(location.search).get('sel') || '';
    const m = /^spool:(\d+)$/.exec(sel);
    return m ? m[1] : null;
  }

  function findAnchor() {
    const nodes = document.querySelectorAll('button, a');
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i] !== btn && ANCHOR_TEXTS.indexOf((nodes[i].textContent || '').trim()) >= 0) return nodes[i];
    }
    return null;
  }

  function idleText() { return 'Auf Waage drucken (#' + spoolId + ')'; }

  function setTone(tone) {
    if (mode === 'floating') btn.style.background = tone ? '#2b2f33' : '#1f3d36';
    btn.style.color = mode === 'floating' ? (TONE[tone] || '#fff') : TONE[tone];
  }

  function floatingStyle() {
    btn.className = '';
    btn.removeAttribute('style');
    Object.assign(btn.style, {
      position: 'fixed', right: '20px', bottom: '60px', zIndex: '2147483647',
      padding: '10px 16px', borderRadius: '8px', border: '1px solid #4a9',
      background: '#1f3d36', color: '#fff', font: '600 14px sans-serif',
      cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,.4)'
    });
  }

  // Keeps the button where it belongs. Spoolman re-renders its detail panel whenever another spool is
  // picked and drops foreign nodes with it, so this runs on every poll and puts the button back.
  function place() {
    const anchor = findAnchor();
    if (anchor) {
      if (mode !== 'native' || btn.previousElementSibling !== anchor) {
        btn.className = anchor.className;   // takes over the look of Spoolman's own buttons
        btn.removeAttribute('style');
        btn.style.marginLeft = '8px';
        anchor.after(btn);
        mode = 'native';
      }
    } else if (mode !== 'floating' || !btn.isConnected) {
      floatingStyle();
      document.body.appendChild(btn);
      mode = 'floating';
    }
  }

  function refresh() {
    const id = currentSpoolId();
    if (id !== spoolId) { spoolId = id; if (!busy) btn.textContent = id ? idleText() : ''; }
    if (!id) { btn.remove(); mode = ''; return; }
    place();
    if (!busy && btn.textContent !== idleText()) btn.textContent = idleText();
  }

  function show(text, tone) {
    btn.textContent = text;
    setTone(tone);
  }

  function release() {
    busy = false;
    setTone('idle');
    if (spoolId) btn.textContent = idleText();
  }

  function finish(text, tone) {
    show(text, tone);
    setTimeout(release, SHOW_MS);
  }

  function request(method, path, pin, cb) {
    GM_xmlhttpRequest({
      method: method,
      url: SCALE + path,
      headers: { Authorization: 'Basic ' + btoa(USER + ':' + pin) },
      timeout: 8000,
      onload: cb,
      onerror: function () { cb({ status: 0, responseText: 'Waage nicht erreichbar (Tiefschlaf? Display antippen)' }); },
      ontimeout: function () { cb({ status: 0, responseText: 'Zeitüberschreitung' }); }
    });
  }

  // After the scale took the job its verdict shows up in "lastPrint": null until the print is through.
  function waitForResult(pin, id, tries) {
    request('GET', '/api/label', pin, function (r) {
      let last = null;
      try { last = JSON.parse(r.responseText).lastPrint; } catch (e) { /* keep waiting */ }
      if (last) { finish('Waage: ' + last, 'info'); return; }
      if (tries <= 1) { finish('An Waage geschickt (#' + id + ')', 'ok'); return; }
      setTimeout(function () { waitForResult(pin, id, tries - 1); }, RESULT_POLL_MS);
    });
  }

  function failText(r) {
    const t = (r.responseText || '').trim();
    switch (r.status) {
      case 400: return 'Ungültige Spulen-ID';
      case 401: return 'PIN falsch';
      case 403: return 'Web-Konfiguration der Waage ist aus';
      case 409: return t === 'busy' ? 'Waage belegt (Tag auf dem Reader oder Auftrag läuft)' : 'Waage: ' + t;
      default:  return t || ('Fehler: HTTP ' + r.status);
    }
  }

  btn.addEventListener('click', function () {
    if (busy || !spoolId) return;
    let pin = GM_getValue(PIN_KEY, '');
    if (!pin) {
      pin = (prompt('PIN der Waage (Web-Passwort):') || '').trim();
      if (!pin) return;
      GM_setValue(PIN_KEY, pin);
    }
    const id = spoolId;
    busy = true;
    show('Sende ...', 'work');
    request('POST', '/api/label/print?spool=' + encodeURIComponent(id), pin, function (r) {
      if (r.status === 202) { waitForResult(pin, id, RESULT_TRIES); return; }
      if (r.status === 401) GM_deleteValue(PIN_KEY);   // asked for again on the next click
      finish(failText(r), 'bad');
    });
  });

  setInterval(refresh, POLL_MS);
  refresh();
})();
