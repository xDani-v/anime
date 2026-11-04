// Pantalla de historial de reproducción.
import { h, loading, empty, toast, confirmDlg, btn } from './dom.js';

export function renderHistory(svc, navigate) {
  const root = h('div', { class: 'history-screen' });

  const header = h('div', { class: 'section' },
    h('div', { class: 'section-head' },
      h('h2', null, 'Historial'),
      btn('Borrar todo', async () => {
        const ok = await confirmDlg('¿Borrar todo el historial?', 'Borrar', true);
        if (!ok) return;
        await svc.history.clearAll();
        load();
      }, { cls: 'ghost danger' }),
    ),
  );
  root.append(header);

  const content = h('div', { class: 'history-content' });
  root.append(content);
  content.append(loading());

  async function load() {
    content.innerHTML = '';

    let items;
    try {
      items = await svc.history.getAll();
    } catch (e) {
      toast(e.message, 'error');
      return;
    }

    if (!items || !items.length) {
      content.append(empty('Sin historial', 'Los episodios que veas aparecerán aquí.'));
      return;
    }

    const list = h('div', { class: 'history-list', style: 'padding:0 20px 80px' });
    for (const item of items) {
      const pct = Math.round(item.progress * 100);
      const el = h('button', {
        type: 'button',
        class: 'ep-item',
        onclick: (e) => {
          e.preventDefault();
          navigate(`/watch/${item.slug}/${item.epNum}`);
        },
      },
        h('div', { class: 'ep-info' },
          h('div', { class: 'ep-num' }, `${item.title} — ${item.epName}`),
          h('div', { class: 'ep-name' }, new Date(item.watchedAt).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })),
          h('div', { class: 'progress-bar' }, h('div', { class: 'progress-bar-fill', style: `width:${pct}%` })),
        ),
        h('span', { class: 'ep-arrow' }, `${pct}%`),
      );
      list.append(el);
    }
    content.append(list);
  }

  load();
  return root;
}
