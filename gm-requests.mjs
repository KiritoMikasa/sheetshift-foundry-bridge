import { ATTRIBUTES, parseFreeFormula } from './actions.mjs';
import { escapeHtml as esc, randomId } from './protocol.mjs';
import { TALENTS } from './talents.mjs';

export function requestForm({ body, talents = [], onRequest, onBack }) {
  const catalogue = [...TALENTS];
  for (const talent of talents) {
    if (!catalogue.some(t => t.label === talent.label && t.talentKey === talent.talentKey))
      catalogue.push(talent);
  }
  catalogue.sort((a, b) => a.label.localeCompare(b.label, 'de'));
  let mode = 'talent', chosen, options = [], active = -1;
  body.innerHTML = `<form class="ss-form"><h3>Probe anfordern</h3>
    <div class="ss-modes" role="group" aria-label="Art der Anforderung"><button type="button" data-mode="talent" aria-pressed="true">Talentprobe</button><button type="button" data-mode="free" aria-pressed="false">Freier Wurf</button></div>
    <div data-talent><label>Talent suchen<input name="talent" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="ss-talent-options" autocomplete="off" maxlength="120" placeholder="Name oder Gruppe suchen…" required></label><div id="ss-talent-options" class="ss-suggestions" role="listbox" aria-label="Talente" hidden></div>
    <label>Attribut<select name="attribute">${ATTRIBUTES.map(a => `<option>${a}</option>`).join('')}</select></label><small>1d20 + Talentwert des Spielers + Attribut. Eigene Talentnamen sind möglich.</small></div>
    <div data-free hidden><label>Bezeichnung<input name="label" maxlength="120" placeholder="z. B. Glück, Begegnung, Schaden" disabled></label><label>Würfelformel<input name="formula" maxlength="80" value="1d20" placeholder="z. B. 2d6 + 3" disabled></label><small data-formula>1d20 · ohne Talent- oder Attributwerte</small></div>
    <fieldset><legend>Spieler</legend><div class="ss-modes"><button type="button" data-all>Alle</button><button type="button" data-none>Keine</button></div>${game.users.filter(u => u.active && !u.isGM).map(u => `<label class="ss-player"><input type="checkbox" name="target" value="${esc(u.id)}" checked><span>${esc(u.name)}</span></label>`).join('')}</fieldset>
    <p class="ss-error" role="alert" data-error hidden></p><small>Spieler bestätigen selbst. Ergebnisse sind öffentlich. Gültig für 2 Minuten.</small><button type="submit">Anfordern</button><button type="button" data-back>Zurück</button></form>`;
  const form = body.querySelector('form'), search = form.querySelector('[name=talent]'), list = form.querySelector('[role=listbox]');
  const formula = form.querySelector('[name=formula]'), label = form.querySelector('[name=label]');
  function closeList() { list.hidden = true; search.setAttribute('aria-expanded', 'false'); search.removeAttribute('aria-activedescendant'); }
  function choose(talent) { chosen = talent; search.value = talent.label; closeList(); }
  function suggestions() {
    const query = search.value.trim().toLocaleLowerCase('de');
    options = catalogue.filter(t => `${t.label} ${t.group || ''}`.toLocaleLowerCase('de').includes(query)).slice(0, 12);
    active = -1; list.replaceChildren();
    for (const [index, talent] of options.entries()) {
      const button = document.createElement('button');
      button.type = 'button'; button.id = `ss-talent-option-${index}`; button.setAttribute('role', 'option'); button.setAttribute('aria-selected', 'false');
      button.innerHTML = `<span>${esc(talent.label)}</span><small>${esc(talent.group || 'Eigenes Talent')}</small>`;
      button.onclick = () => choose(talent);
      list.append(button);
    }
    if (!options.length) { const empty = document.createElement('small'); empty.textContent = 'Kein Katalogtreffer. Exakten Talentnamen eingeben oder „Freier Wurf“ wählen.'; list.append(empty); }
    list.hidden = false; search.setAttribute('aria-expanded', 'true');
  }
  search.onfocus = suggestions;
  search.oninput = () => { chosen = undefined; suggestions(); };
  search.onkeydown = event => {
    if (event.key === 'Escape') { event.preventDefault(); closeList(); }
    else if (['ArrowDown', 'ArrowUp'].includes(event.key) && options.length) {
      event.preventDefault(); if (list.hidden) suggestions();
      active = active < 0 ? (event.key === 'ArrowDown' ? 0 : options.length - 1) : (active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      for (const [index, button] of [...list.children].entries()) button.setAttribute('aria-selected', String(index === active));
      search.setAttribute('aria-activedescendant', `ss-talent-option-${active}`);
    } else if (event.key === 'Enter' && !list.hidden && options.length) {
      event.preventDefault(); choose(options[Math.max(0, active)]);
    }
  };
  const modeButtons = form.querySelectorAll('[data-mode]');
  for (const button of modeButtons) button.onclick = () => {
    mode = button.dataset.mode; closeList();
    for (const other of modeButtons) other.setAttribute('aria-pressed', String(other === button));
    form.querySelector('[data-talent]').hidden = mode !== 'talent';
    form.querySelector('[data-free]').hidden = mode !== 'free';
    search.disabled = mode !== 'talent'; label.disabled = formula.disabled = mode !== 'free';
    search.required = mode === 'talent'; label.required = formula.required = mode === 'free';
  };
  formula.oninput = () => {
    const parsed = parseFreeFormula(formula.value);
    formula.setCustomValidity(parsed ? '' : 'Bitte Würfel und ganze Zahlen verwenden, z. B. 2d6 + 3. Maximal 20 Würfel.');
    form.querySelector('[data-formula]').textContent = parsed ? `${parsed.formula} · ohne Talent- oder Attributwerte` : 'Würfel mit + / − verbinden · maximal 20 Würfel';
  };
  for (const [selector, checked] of [['[data-all]', true], ['[data-none]', false]])
    form.querySelector(selector).onclick = () => { for (const input of form.querySelectorAll('[name=target]')) input.checked = checked; };
  form.querySelector('[data-back]').onclick = onBack;
  form.onsubmit = async event => {
    event.preventDefault();
    const data = new FormData(form), targets = data.getAll('target');
    const error = form.querySelector('[data-error]');
    error.hidden = true;
    if (!targets.length) { error.textContent = 'Bitte mindestens einen aktiven Spieler auswählen.'; error.hidden = false; return; }
    const parsed = mode === 'free' ? parseFreeFormula(data.get('formula')) : null;
    if (mode === 'free' && !parsed) { formula.reportValidity(); return; }
    const check = { id: randomId(), kind: mode, targets, expires: Date.now() + 120000,
      ...(mode === 'free' ? { label: String(data.get('label')).trim(), formula: parsed.formula } :
        { talent: String(data.get('talent')).trim(), attribute: data.get('attribute'), ...(chosen ? { talentKey: chosen.talentKey } : {}) }) };
    form.querySelector('[type=submit]').disabled = true;
    try { await onRequest(check); onBack(); }
    catch { error.textContent = 'Anforderung nicht bestätigt. Bitte Foundry-Chat prüfen.'; error.hidden = false; }
    finally { form.querySelector('[type=submit]').disabled = false; }
  };
}
