// Helpers mínimos de DOM. Misma filosofía que app_sp: sin frameworks, sin deps.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) {
      const evtName = k.slice(2).toLowerCase();
      el.addEventListener(evtName, v);
      // Accesibilidad y soporte nativo de D-Pad / Android TV para elementos con click
      if (evtName === 'click' && !['button', 'a', 'input', 'select', 'textarea'].includes(tag.toLowerCase())) {
        if (!props.tabindex && !props.tabIndex) el.setAttribute('tabindex', '0');
        el.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.keyCode === 13 || ev.keyCode === 23) {
            ev.preventDefault();
            v(ev);
          }
        });
      }
    }
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const fmtDate = (iso) => new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });

// ---------- Iconos SVG ----------
const ICONS = {
  home:     'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  search:   'M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z',
  heart:    'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z',
  heartFill:'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z',
  clock:    'M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  play:     'M5 3l14 9-14 9z',
  back:     'M15 5l-7 7 7 7',
  minus:    'M5 12h14',
  check:    'M5 13l4 4L19 7',
  trash:    'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  refresh:  'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.36-3.36L23 10M1 14l5.09 4.36A9 9 0 0020.49 15',
  download: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
  share:    'M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13',
};

export function icon(name, size = 22, fill = false) {
  const wrap = document.createElement('span');
  wrap.className = 'icon';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[name] || ''}"/></svg>`;
  return wrap;
}

export function btn(label, onClick, { cls = '', ic = null, title = null, disabled = false, fill = false } = {}) {
  return h('button', { type: 'button', class: `btn ${cls}`, onclick: onClick, 'aria-label': title || label || null, title, disabled },
    ic ? icon(ic, 20, fill) : null,
    label ? h('span', null, label) : null,
  );
}
export const iconBtn = (ic, title, onClick, cls = '', fill = false) => btn('', onClick, { cls: `icon-btn ${cls}`, ic, title, fill });

export function empty(title, text, action) {
  return h('div', { class: 'empty' },
    h('h3', null, title),
    h('p', null, text),
    action || null,
  );
}

export function loading() {
  return h('div', { class: 'loading' }, h('div', { class: 'spinner' }), 'Cargando…');
}

// ---------- Toast ----------
let toastTimer;
export function toast(msg, kind = '') {
  let el = document.getElementById('toast');
  if (!el) { el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(el); }
  el.className = `toast show ${kind}`;
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), kind === 'error' ? 5000 : 2500);
}

// ---------- Modal ----------
export function modal(title, body, actions = []) {
  return new Promise((resolve) => {
    const close = (v) => { overlay.remove(); document.body.classList.remove('no-scroll'); resolve(v); };
    const overlay = h('div', { class: 'overlay', onclick: (e) => e.target === overlay && close(null) },
      h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('div', { class: 'sheet-head' },
          h('h2', null, title),
          iconBtn('minus', 'Cerrar', () => close(null), 'ghost'),
        ),
        h('div', { class: 'sheet-body' }, typeof body === 'function' ? body(close) : body),
        actions.length
          ? h('div', { class: 'sheet-actions' }, ...actions.map((a) =>
              btn(a.label, async () => {
                const r = await a.onClick?.(close);
                if (r !== false && !a.keepOpen) close(a.value ?? true);
              }, { cls: a.cls || '' }),
            ))
          : null,
      ),
    );
    document.body.append(overlay);
    document.body.classList.add('no-scroll');
    overlay.querySelector('input,select,textarea,button.btn')?.focus?.();
  });
}

export const confirmDlg = (message, okLabel = 'Aceptar', danger = false) =>
  modal('Confirmar', h('p', { class: 'pre' }, message), [
    { label: 'Cancelar', cls: 'ghost', value: false },
    { label: okLabel, cls: danger ? 'danger' : 'primary', value: true },
  ]).then((v) => v === true);

export async function guard(fn) {
  try { return await fn(); } catch (e) {
    toast(e?.message || String(e), 'error');
    console.error(e);
    return undefined;
  }
}
