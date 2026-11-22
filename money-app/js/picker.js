// Searchable institution dropdown (combobox) with a logo badge per option and a "custom bank" option.
import { GROUPS, INSTITUTIONS, searchInstitutions, institutionOf, customValue, norm, badgeHTML } from './institutions.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function pickerHTML(id, value, label = 'Bank or institution', placeholder = 'Search banks, wallets, cards or type your own') {
  const inst = institutionOf(value);
  return `<div class="combo" id="${id}">
    <label for="${id}-input">${esc(label)}</label>
    <div class="combo-box">
      <span class="combo-badge">${badgeHTML(inst)}</span>
      <input type="text" id="${id}-input" role="combobox" aria-expanded="false" aria-controls="${id}-list" aria-autocomplete="list"
        autocomplete="off" spellcheck="false" placeholder="${esc(placeholder)}" value="${esc(inst ? inst.name : '')}">
      <button type="button" class="combo-clear" aria-label="Clear selection" ${inst ? '' : 'hidden'}>×</button>
    </div>
    <ul class="combo-list" id="${id}-list" role="listbox" hidden></ul>
    <input type="hidden" name="institution" value="${esc(value || '')}">
  </div>`;
}

// onChange(value, displayName) is called whenever the selection changes.
// opts.accept(institution) limits which providers are listed (for example only banks of one country).
export function mountPicker(root, onChange = () => {}, opts = {}) {
  const accept = opts.accept || (() => true);
  const input = root.querySelector('input[role="combobox"]');
  const list = root.querySelector('.combo-list');
  const hidden = root.querySelector('input[name="institution"]');
  const badge = root.querySelector('.combo-badge');
  const clear = root.querySelector('.combo-clear');
  let items = []; // [{value, node}]
  let active = -1;
  let open = false;

  function setValue(value) {
    hidden.value = value || '';
    const inst = institutionOf(value);
    input.value = inst ? inst.name : '';
    badge.innerHTML = badgeHTML(inst);
    clear.hidden = !inst;
    onChange(value || '', inst ? inst.name : '');
  }

  function optionHTML(i, idx) {
    return `<li role="option" id="${root.id}-o${idx}" data-v="${esc(i.id)}" aria-selected="false">${badgeHTML(i, 'sm')}
      <span class="opt-text"><span class="opt-name">${esc(i.name)}</span></span></li>`;
  }

  function render() {
    const text = input.value.trim();
    const q = norm(text);
    let found = searchInstitutions(text).filter(accept);
    if (!text) found = [...found.filter((i) => i.country !== '*'), ...found.filter((i) => i.country === '*')]; // the country's own first
    let html = '';
    let n = 0;
    const vals = [];
    for (const [kind, label] of GROUPS) {
      const g = found.filter((i) => i.kind === kind);
      if (!g.length) continue;
      html += `<li role="presentation" class="opt-group">${esc(label)}</li>`;
      for (const i of g) {
        html += optionHTML(i, n++);
        vals.push(i.id);
      }
    }
    if (text) {
      const exact = INSTITUTIONS.some((i) => norm(i.name) === q);
      if (!exact) {
        const cv = customValue(text);
        html += `<li role="option" class="opt-custom" id="${root.id}-o${n}" data-v="${esc(cv)}" aria-selected="false">${badgeHTML(institutionOf(cv), 'sm')}
          <span class="opt-text"><span class="opt-name">Use “${esc(text)}” as a custom bank</span><span class="opt-sub">✨ Not in the list? Add your own</span></span></li>`;
        vals.push(cv);
        n++;
      }
    }
    if (!n) html = '<li role="presentation" class="opt-empty">No match. Keep typing to add it as your own bank.</li>';
    if (!text && n) html += '<li role="presentation" class="opt-empty">Not listed? Type its name to add a custom bank.</li>';
    list.innerHTML = html;
    items = [...list.querySelectorAll('[role="option"]')].map((node, k) => ({ value: vals[k], node }));
    setActive(text && items.length ? 0 : -1, false);
  }

  function setActive(i, scroll = true) {
    active = i;
    items.forEach((it, k) => it.node.setAttribute('aria-selected', String(k === i)));
    if (i >= 0 && items[i]) {
      input.setAttribute('aria-activedescendant', items[i].node.id);
      if (scroll) items[i].node.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }

  function show() {
    open = true;
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    render();
  }
  function hide() {
    open = false;
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
  function choose(value) {
    setValue(value);
    hide();
  }

  input.addEventListener('focus', show);
  input.addEventListener('click', () => !open && show());
  input.addEventListener('input', () => {
    if (!open) show();
    else render();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return show();
      if (!items.length) return;
      setActive(e.key === 'ArrowDown' ? (active + 1) % items.length : (active - 1 + items.length) % items.length);
    } else if (e.key === 'Enter') {
      if (open && active >= 0 && items[active]) {
        e.preventDefault();
        choose(items[active].value);
      } else if (open) {
        e.preventDefault();
        commitTyped();
        hide();
      }
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      input.value = institutionOf(hidden.value)?.name || '';
      hide();
    }
  });
  // mousedown (not click) so the choice lands before the input loses focus.
  list.addEventListener('mousedown', (e) => {
    const li = e.target.closest('[role="option"]');
    e.preventDefault();
    if (li) choose(li.dataset.v);
  });
  clear.addEventListener('click', () => {
    setValue('');
    input.focus();
  });

  // Leaving the field: typed text becomes a custom bank (or the matching catalog entry).
  function commitTyped() {
    const text = input.value.trim();
    if (!text) return setValue('');
    const current = institutionOf(hidden.value);
    if (current && current.name === text) return;
    const q = norm(text);
    const hit = INSTITUTIONS.find((i) => norm(i.name) === q);
    setValue(hit ? hit.id : customValue(text));
  }
  input.addEventListener('blur', () => {
    commitTyped();
    hide();
  });

  return { show, hide, refresh: () => open && render(), setLabel: (t) => { root.querySelector('label').textContent = t; }, setValue, get value() { return hidden.value; } };
}
