/* XO LAB — MIDI controllers (Windows / Mac app, Chrome, Edge). iPhone has no Web MIDI, so the panel says so.
 * MIDI LEARN: press LEARN, click any slider, switch, option button, scene or button, then move a knob / fader or hit
 * a pad. Knobs and faders follow the slider's full range; pads press buttons, flip switches and load scenes.
 * Mappings are saved on this device. */
(function () {
  'use strict';
  const XO = window.XO, $ = XO.$, $$ = XO.$$;
  const KEY = 'xolab-midi-map-v1';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const M = (XO.midi = { access: null, supported: typeof navigator.requestMIDIAccess === 'function', inputs: [], map: load(), learning: false, target: null, last: '', status: 'off' });

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(M.map)); } catch (e) { /* private mode */ } }

  /* ---------------- what a control is ---------------- */
  // A target describes a control in a way that survives a reload: by setting key, scene name or element id.
  function targetOf(el) {
    if (!el) return null;
    const range = el.closest('input[type="range"][data-k]'); if (range) return { t: 'range', k: range.dataset.k };
    const tog = el.closest('label.toggle'); if (tog) { const i = tog.querySelector('input[type="checkbox"][data-k]'); if (i) return { t: 'toggle', k: i.dataset.k }; }
    const segBtn = el.closest('.seg[data-k] button[data-value]'); if (segBtn) return { t: 'seg', k: segBtn.closest('.seg').dataset.k, v: segBtn.dataset.value };
    const scene = el.closest('[data-scene]'); if (scene) return { t: 'scene', name: scene.dataset.scene };
    const btn = el.closest('button[id], .pad[id]'); if (btn && !btn.closest('#midiPanel')) return { t: 'btn', id: btn.id };
    return null;
  }
  function labelOf(tg) {
    if (!tg) return '?';
    if (tg.t === 'scene') return 'Scene: ' + tg.name;
    if (tg.t === 'btn') { const b = document.getElementById(tg.id); return (b ? (b.getAttribute('aria-label') || b.textContent || tg.id) : tg.id).replace(/\s+/g, ' ').trim().slice(0, 32); }
    const el = $('[data-k="' + tg.k + '"]');
    const box = el && el.closest('.control, .toggle, .seg-wrap');
    let name = box ? (box.querySelector('.control-head, .opt-label') || box).childNodes[0].textContent.trim() : tg.k;
    if (tg.t === 'seg') { const b = $('.seg[data-k="' + tg.k + '"] button[data-value="' + tg.v + '"]'); name += ' → ' + (b ? b.textContent.trim() : tg.v); }
    return name.slice(0, 40);
  }
  function elementOf(tg) {
    if (!tg) return null;
    if (tg.t === 'range' || tg.t === 'toggle') return $('[data-k="' + tg.k + '"]');
    if (tg.t === 'seg') return $('.seg[data-k="' + tg.k + '"] button[data-value="' + CSS.escape(tg.v) + '"]');
    if (tg.t === 'scene') return $('[data-scene="' + CSS.escape(tg.name) + '"] [data-sa="load"]');
    return document.getElementById(tg.id);
  }

  /* ---------------- acting on a message ---------------- */
  const held = {};
  function act(id, kind, value) { // value 0..127
    const tg = M.map[id]; if (!tg) return false;
    const el = elementOf(tg); if (!el) return false;
    if (tg.t === 'range') {
      const min = +el.min, max = +el.max, step = +el.step || 1;
      let v = min + (value / 127) * (max - min);
      v = Math.round(v / step) * step; v = Math.min(max, Math.max(min, +v.toFixed(6)));
      if (+el.value !== v) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
      return true;
    }
    // buttons, switches, options and scenes fire once per press (value crossing 64, or note on)
    const down = value >= 64, was = !!held[id]; held[id] = down;
    if (!down || was) return true;
    M._acting = true; // learn mode must not swallow the controller's own press
    try { el.click(); } finally { M._acting = false; }
    return true;
  }
  function idOf(st, d1) { const type = st & 0xf0, ch = (st & 0x0f) + 1; return (type === 0xb0 ? 'cc' : 'note') + ':' + ch + ':' + d1; }
  function onMessage(e) {
    const [st, d1, d2 = 0] = e.data; const type = st & 0xf0;
    if (type !== 0xb0 && type !== 0x90 && type !== 0x80) return;
    const id = idOf(st, d1), value = type === 0x80 || (type === 0x90 && d2 === 0) ? 0 : (type === 0x90 ? 127 : d2);
    M.last = (type === 0xb0 ? 'CC ' : 'NOTE ') + d1 + ' · CH ' + ((st & 0x0f) + 1) + ' · ' + d2;
    if (M.learning && M.target && value > 0) {
      Object.keys(M.map).forEach((k) => { if (JSON.stringify(M.map[k]) === JSON.stringify(M.target)) delete M.map[k]; }); // one control, one knob
      M.map[id] = M.target; save();
      XO.toast('Mapped ' + nice(id) + ' → ' + labelOf(M.target));
      markTarget(null); M.target = null; held[id] = value >= 64;
      renderList();
      return;
    }
    act(id, type, value);
    paintLast();
  }
  M.handle = onMessage; // for tests
  const nice = (id) => { const [k, ch, n] = id.split(':'); return (k === 'cc' ? 'Knob CC ' : 'Pad note ') + n + (ch !== '1' ? ' (ch ' + ch + ')' : ''); };

  /* ---------------- connecting ---------------- */
  async function connect() {
    if (!M.supported) return;
    try {
      M.access = await navigator.requestMIDIAccess({ sysex: false });
      M.access.onstatechange = () => attach();
      attach();
      M.status = 'on';
    } catch (e) { M.status = e && e.name === 'InvalidStateError' ? 'nosystem' : 'blocked'; M.error = e && (e.name + ': ' + e.message); }
    renderStatus();
  }
  M.connect = connect;
  function attach() {
    if (!M.access) return;
    M.inputs = [];
    M.access.inputs.forEach((inp) => { inp.onmidimessage = onMessage; if (inp.state !== 'disconnected') M.inputs.push(inp.name || 'MIDI device'); });
    renderStatus();
  }

  /* ---------------- learn mode ---------------- */
  function markTarget(el) { $$('.midi-target').forEach((x) => x.classList.remove('midi-target')); if (el) (el.closest('.control, .toggle, .seg-wrap, .scene, button') || el).classList.add('midi-target'); }
  function setLearning(on) {
    M.learning = on; M.target = null; markTarget(null);
    document.documentElement.classList.toggle('midi-learning', on);
    const b = $('#midiLearn'); if (b) { b.textContent = on ? '■ DONE' : 'MIDI LEARN'; b.classList.toggle('on', on); }
    if (on) XO.toast('MIDI LEARN: click a slider, switch, option, scene or button — then move a knob or hit a pad.', false, 6000);
  }
  M.setLearning = setLearning;
  // While learning, a click picks the control instead of using it.
  document.addEventListener('click', (e) => {
    if (!M.learning || M._acting || e.target.closest('#midiPanel')) return;
    const tg = targetOf(e.target); if (!tg) return;
    e.preventDefault(); e.stopPropagation();
    M.target = tg; markTarget(e.target.closest('[data-k], [data-scene], button, .pad') || e.target);
    XO.toast('Now move a knob or hit a pad for: ' + labelOf(tg));
  }, true);
  document.addEventListener('pointerdown', (e) => { if (M.learning && !e.target.closest('#midiPanel') && targetOf(e.target) && e.target.matches('input[type="range"]')) { e.preventDefault(); const tg = targetOf(e.target); M.target = tg; markTarget(e.target); XO.toast('Now move a knob or fader for: ' + labelOf(tg)); } }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && M.learning) setLearning(false); });

  /* ---------------- panel ---------------- */
  function renderStatus() {
    const s = $('#midiState'); if (!s) return;
    if (!M.supported) s.textContent = XO.exporter && XO.exporter.isNative() ? 'iPhone doesn\'t allow MIDI in apps like this. Use the Windows or Mac app for MIDI controllers.' : 'This browser has no MIDI. Use the Windows / Mac app, Chrome or Edge.';
    else if (M.status === 'blocked') s.textContent = 'MIDI access was blocked. Allow it and press CONNECT again.';
    else if (M.status === 'nosystem') s.textContent = 'This computer\'s MIDI system didn\'t start. Reconnect the controller and press CONNECT again.';
    else if (M.status !== 'on') s.textContent = 'Press CONNECT, then plug in your controller.';
    else s.textContent = M.inputs.length ? 'CONNECTED: ' + M.inputs.join(', ') : 'No controller found. Plug one in (USB) — it appears here by itself.';
    const c = $('#midiConnect'); if (c) { c.hidden = !M.supported || M.status === 'on'; c.textContent = M.status === 'off' ? 'CONNECT MIDI' : 'TRY AGAIN'; }
    const l = $('#midiLearn'); if (l) l.disabled = !M.supported || M.status !== 'on';
  }
  function paintLast() { const l = $('#midiLast'); if (l) l.textContent = M.last ? 'LAST: ' + M.last : ''; }
  function renderList() {
    const el = $('#midiList'); if (!el) return;
    const ids = Object.keys(M.map);
    el.innerHTML = ids.length ? ids.map((id) => `<div class="scene midi-row"><b>${esc(nice(id))}</b><small>${esc(labelOf(M.map[id]))}</small><button class="mini" type="button" data-unmap="${esc(id)}" aria-label="Remove mapping">✕</button></div>`).join('') : '<div class="sub">No mappings yet.</div>';
    const clr = $('#midiClear'); if (clr) clr.disabled = !ids.length;
  }
  M.renderList = renderList;

  XO.customs.midi = (el) => {
    el.id = 'midiPanel';
    el.innerHTML = `<div class="live-row"><button class="btn" id="midiConnect" type="button">CONNECT MIDI</button><button class="btn" id="midiLearn" type="button" disabled>MIDI LEARN</button><button class="btn" id="midiClear" type="button" disabled>CLEAR ALL</button></div>
      <div class="sub" id="midiState"></div><div class="sub midi-last" id="midiLast"></div>
      <div class="scene-list" id="midiList"></div>
      <div class="hint">Knobs and faders follow a slider's full range. Pads press buttons, flip switches, pick options and load scenes. Mappings stay on this device.</div>`;
    el.querySelector('#midiConnect').addEventListener('click', connect);
    el.querySelector('#midiLearn').addEventListener('click', () => setLearning(!M.learning));
    el.querySelector('#midiClear').addEventListener('click', async () => { if (await XO.confirm('Remove all MIDI mappings?')) { M.map = {}; save(); renderList(); } });
    el.addEventListener('click', (e) => { const x = e.target.closest('[data-unmap]'); if (x) { delete M.map[x.dataset.unmap]; save(); renderList(); } });
    renderStatus(); renderList();
    // The desktop app already has permission, so connect straight away there; browsers ask first.
    if (M.supported && (XO.isDesktopApp || window.xoDesktop || Object.keys(M.map).length)) setTimeout(connect, 0);
  };
})();
