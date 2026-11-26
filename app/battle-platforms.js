import { t, L, authorName } from './i18n.js';
import { bytesEqual } from './core/rom.js';
import { GROUPS, MEMBERS, SLOT, modelFile, platformAssignments } from './core/platforms.js';

const numbered = (n) => String(n).padStart(2, '0');
const title = (key, n) => t(key).replace('{n}', numbered(n));
export const platformName = (lib, member) => L(lib.platforms?.slots[member]?.name) || title('bpMember', member);
const groupName = (lib, group) => L(lib.platforms?.groups[group]?.name) || title('bpGroup', group);
export function memberRanges(members) {
  const runs = [];
  for (const member of [...members].sort((a, b) => a - b)) {
    const last = runs.at(-1);
    if (last && member === last[1] + 1) last[1] = member;
    else runs.push([member, member]);
  }
  return runs.map(([first, last]) => first === last ? `#${first}` : `#${first}–#${last}`).join(', ');
}
export const assignmentState = (assignment) => ({
  inherit: 'bpInherited', model: 'bpOverride', keep: 'bpKeep', stock: 'bpStock',
})[assignment?.kind] || 'bpUnchanged';

export function groupAssignment(members, assignments) {
  const entries = members.map(member => assignments.get(member));
  const signature = a => [a?.kind, a?.file, a?.set?.id, a?.model?.id].join('|');
  return entries.every(a => signature(a) === signature(entries[0]))
    ? { mixed: false, assignment: entries[0] } : { mixed: true };
}

function installedName(S, member) {
  const entry = S.scan?.platforms[member];
  if (entry?.kind === 'model') return L(S.lib.platforms.models.find(m => m.id === entry.id)?.name);
  return t({ stock: 'bpVerifiedStock', unknown: 'bpUnknown', unavailable: 'bpInvalidTarget' }[entry?.kind] || 'bpNoRom');
}

function metaLine(meta, esc) {
  return `<span class="muted small">${esc(t(meta?.status === 'verified' ? 'bpVerified' : 'bpUnconfirmed'))}
    ${meta?.desc ? ' · ' + esc(L(meta.desc)) : ''}${meta?.evidence ? ' · ' + esc(meta.evidence) : ''}</span>`;
}

export function platformPicker(body, C) {
  const { S, esc, icon, updated, ask, chooseDonor, preview, thumb, hasThumb, filterBar, filterKey } = C;
  const lib = S.lib;
  if (lib.platforms?.version !== 1) {
    body.innerHTML = `<p class="callout">${esc(t('bpLibraryUpdate'))}</p>`;
    return;
  }
  const target = S.rom?.platformProfile;
  const available = target ? target.valid : MEMBERS;
  for (const member of [...S.selPlatforms]) if (!available.includes(member)) S.selPlatforms.delete(member);
  const selected = [...S.selPlatforms];
  const selectedLabel = t(selected.length === 1 ? 'bpSelectedOne' : 'bpSelected').replace('{n}', selected.length);
  const base = lib.items.find(it => it.id === S.picks.items.platforms);
  const assignments = platformAssignments(S.picks, lib);
  const groups = target?.groupSafe && !S.platformRaw;
  const groupMeta = lib.platforms.groups;
  const slotMeta = lib.platforms.slots;
  const button = (action, text, disabled = false) =>
    `<button type="button" class="ghost small" data-bp="${action}" ${disabled ? 'disabled' : ''}>${esc(text)}</button>`;
  const peek = (action, text, disabled = false) =>
    `<button type="button" class="icon-btn" data-bp="${action}" aria-label="${esc(text)}" title="${esc(text)}" ${disabled ? 'disabled' : ''}>${icon('eye')}</button>`;
  const modelName = id => L(lib.platforms.models.find(m => m.id === id)?.name);
  const suggested = meta => meta?.suggested && modelName(meta.suggested)
    ? `<span class="muted small">${esc(t('bpSuggested'))} ${esc(modelName(meta.suggested))}</span>` : '';
  const knownModel = (file, member) => lib.platforms.models.find(m => modelFile(m, member, lib) === file);
  const picture = (member, representative = false) => {
    const a = assignments.get(member);
    const installed = S.scan?.platforms[member];
    const model = a?.file ? a.model || knownModel(a.file, member) :
      a?.kind === 'stock' ? null : lib.platforms.models.find(m => m.id === installed?.id);
    const usable = a?.kind === 'stock' ? S.stockPlatforms && available.includes(member) :
      a?.file || target?.valid.includes(member);
    const pending = model?.empty || (!usable || hasThumb(model?.id)) ? '' :
      a?.file ? 'file:' + a.file : (a?.kind === 'stock' ? 'stock:' : 'rom:') + member;
    const label = `${t('bpPreviewEffective')} · ${platformName(lib, member)}`;
    const visible = model?.empty ? `<span class="small muted">${esc(t('bpIntentionalEmpty'))}</span>` :
      hasThumb(model?.id) ? thumb(model.id, 'disc') : icon('disc', 'glyph');
    return `<button type="button" class="bp-picture" data-bp="effective-${member}" ${representative ? `data-preview-member="#${numbered(member)}"` : ''}
      ${pending ? `data-platform-photo="${esc(pending)}"` : ''} ${usable ? '' : 'disabled'}
      aria-label="${esc(label)}" title="${esc(label)}">${visible}</button>`;
  };
  const assignmentLabel = (a, member) => [
    t(assignmentState(a)), a?.model ? L(a.model.name) : a?.set ? L((knownModel(a.file, member) || a.set).name) : null,
  ].filter(Boolean).join(' · ');
  const toggleDetails = (id, nav, contents) => `<details class="bp-meta" data-bp-meta="${id}" ${S.platformDetails.has(id) ? 'open' : ''}>
    <summary>${esc(t('bpDetails'))}</summary>
    <div class="bp-meta-body">${nav}${contents}</div></details>`;
  const memberRow = (member) => {
    const a = assignments.get(member);
    const { group, variant } = SLOT[member];
    return `<span class="muted small">#${numbered(member)} · ${esc(groupName(lib, group))} · ${esc(title('bpVariant', variant))}</span>
      ${member === 5 ? `<span class="muted small">${esc(t('bpNoOrdinaryLookup'))}</span>` : ''}
      ${metaLine(slotMeta[member], esc)}${suggested(slotMeta[member])}
      <span class="small">${esc(t('bpInstalled'))} · ${esc(installedName(S, member))}</span>
      <div class="row">${peek('current-' + member, t('bpPreviewCurrent'), !target || !available.includes(member))}
        ${a && a.kind !== 'inherit' ? button('clear-' + member, t('bpClearOverride')) : ''}</div>`;
  };
  const members = () => MEMBERS.map(member => {
    const valid = available.includes(member), a = assignments.get(member);
    return `<article class="bp-entry" data-member="${member}">
      ${picture(member)}
      <label class="bp-select"><input type="checkbox" data-member-select="${member}" ${S.selPlatforms.has(member) ? 'checked' : ''} ${valid ? '' : 'disabled'}>
        <b>${esc(platformName(lib, member))}</b></label>
      <span class="small bp-assignment" data-assignment="${a?.kind || 'unchanged'}">${esc(assignmentLabel(a, member))}</span>
      ${toggleDetails('member-' + member, '', memberRow(member))}
    </article>`;
  }).join('');
  const groupCards = () => GROUPS.map((members, group) => {
    const count = members.filter(m => S.selPlatforms.has(m)).length;
    const { mixed, assignment } = groupAssignment(members, assignments);
    const first = members[0];
    const mixedModels = models => models?.[first] && members.some(member =>
      models[member] && !bytesEqual(models[first], models[member]));
    const mixedInstalled = mixedModels(target.models);
    const mixedEffective = mixed || (!assignment?.file &&
      (assignment?.kind === 'stock' ? mixedModels(S.stockPlatforms?.models) : mixedInstalled));
    return `<article class="bp-entry" data-group="${group}">
      ${picture(first, mixedEffective)}
      <label class="bp-select"><input type="checkbox" data-group-select="${group}" ${count === members.length ? 'checked' : ''}>
        <b>${esc(groupName(lib, group))}</b></label>
      <span class="small bp-assignment" data-assignment="${mixed ? 'mixed' : assignment?.kind || 'unchanged'}">
        ${esc(mixed ? t('bpMixedAssignments') : assignmentLabel(assignment, first))}</span>
      ${mixedEffective && !mixed ? `<span class="muted small">${esc(t('bpMixedModels'))}</span>` : ''}
      ${mixedInstalled && (mixed || assignment?.file || assignment?.kind === 'stock') ? `<span class="muted small">${esc(t('bpMixedInstalled'))}</span>` : ''}
      ${toggleDetails('group-' + group, `<span class="muted small">${esc(title('bpGroup', group))} · ${memberRanges(members)}</span>
        ${metaLine(groupMeta[group], esc)}${suggested(groupMeta[group])}
        ${!target.groupUsed.includes(group) ? `<span class="muted small">${esc(t('bpNoOrdinaryLookup'))}</span>` : ''}`,
        members.map(m => `<div class="bp-member-detail"><strong>#${numbered(m)} · ${esc(assignmentLabel(assignments.get(m), m))}</strong>
          ${peek('effective-' + m, t('bpPreviewEffective'), assignments.get(m)?.kind === 'stock' && !S.stockPlatforms)}
          ${memberRow(m)}</div>`).join(''))}
    </article>`;
  }).join('');
  const sets = lib.items.filter(it => it.cat === 'platforms' && !it.archived);
  const models = lib.platforms.models.filter(m => !m.archived);
  const modelCards = models.map(m => {
    const compatible = selected.every(member => !!modelFile(m, member, lib));
    const pending = [...assignments.values()].filter(a => a.model?.id === m.id).length;
    return `<article class="card bp-model ${pending ? 'sel' : ''}" data-platform-model="${esc(m.id)}" data-f="${esc(filterKey(m))}" data-by="${esc(m.by)}">
      <div class="thumb" ${!m.empty && m.file && !hasThumb(m.id) ? `data-platform-photo="file:${esc(m.file)}"` : ''}>${m.empty ? `<span class="muted small">${esc(t('bpIntentionalEmpty'))}</span>` : thumb(m.id, 'disc')}</div>
      <div class="meta"><b>${esc(L(m.name))}</b><span class="muted small">${esc(authorName(m.by))}</span>
        ${m.desc ? `<div class="small">${esc(L(m.desc))}</div>` : ''}
        ${m.members ? `<div class="muted small">${esc(t('bpCompatible').replace('{members}', memberRanges(m.members)))}</div>` : ''}
        ${pending ? `<div><span class="pill sel">${esc(t('bpAssigned').replace('{n}', pending))}</span></div>` : ''}
        <div class="row">${button('model-' + m.id, t('bpApply'), !selected.length || !compatible)}
          ${peek('preview-model-' + m.id, t('preview'))}</div>
      </div></article>`;
  }).join('');
  body.innerHTML = `<div class="bp-ui">
    <p class="callout">${esc(t('bpShared'))}</p>
    <section class="bp-panel"><div class="bp-heading"><h3>${esc(t('bpSets'))}</h3>
      ${button('reset', t('bpReset'), !base && !Object.keys(S.picks.platforms).length)}</div>
      <div class="bp-sets">${sets.map(it => {
        const empty = ['disc-none', 'disc-transparent'].includes(it.id);
        return `<article class="card bp-set ${base?.id === it.id ? 'sel' : ''}">
          <button class="thumb bp-pack-preview" data-bp="preview-set-${esc(it.id)}" aria-label="${esc(t('preview') + ' · ' + L(it.name))}">
            ${empty ? `<span class="bp-hidden-model">${icon('disc')} ${esc(t('bpIntentionalEmpty'))}</span>` : thumb(it.id, 'disc')}
          </button>
          <div class="meta"><b>${esc(L(it.name))}</b><span class="muted small">${esc(authorName(it.by))}</span>
            <button class="${base?.id === it.id ? 'primary' : 'ghost'} small" aria-pressed="${base?.id === it.id}" data-bp="set-${esc(it.id)}"
              ${target && !it.writes.every(w => available.includes(w.member)) ? 'disabled' : ''}>${esc(t('bpApplySet'))}</button></div>
        </article>`;
      }).join('')}</div>
    </section>
    <details class="panel bp-panel" id="bpTargets" ${S.platformPickerOpen ? 'open' : ''}>
      <summary>${esc(t('bpDestinations'))} · <span class="bp-count">${esc(selectedLabel)}</span></summary>
      <div class="bp-actions">${button('catalog', t('bpBrowseModels'))}${button('all', t('selectAll'), !available.length)}${button('none', t('selectNone'), !selected.length)}
        ${button('view', t(groups ? 'bpShowRaw' : 'bpShowGroups'), !target?.groupSafe)}</div>
      ${!target?.groupSafe ? `<p class="muted small">${esc(t('bpGroupsUnavailable'))}</p>` : ''}
      <div class="bp-grid" id="bpGrid">${groups ? groupCards() : members()}</div>
    </details>
    <section class="panel bp-panel" id="bpCustomize"><div class="bp-heading"><h3>${esc(t('bpAssignments'))}</h3>${button('destinations', t('bpChooseDestinations'))}</div>
      <p class="small" aria-live="polite">${esc(selected.length ? selectedLabel + ' · ' +
        memberRanges(selected) : t('bpChooseTargets'))}</p>
      <div class="bp-actions">${button('keep', t('bpKeep'), !selected.length)}${button('stock', t('bpStock'), !selected.length || !S.stockPlatforms)}
        ${button('clear', t('bpClearOverride'), !selected.some(m => S.picks.platforms[m]))}
        ${button('donor', t('bpLoadDonor'), !target?.groupSafe)}</div>
      <p class="muted small">${esc(S.stockPlatforms ? t('bpStockReady') : t('bpNeedDonor'))}</p>
    </section>
    <h3>${esc(t('bpModels'))}</h3>${filterBar(models)}<div class="grid bp-models">${modelCards}</div>
    <p class="muted" id="fempty" hidden>${esc(t('noMatch'))}</p>
  </div>`;
  const destination = body.querySelector('#bpTargets');
  destination.ontoggle = () => { S.platformPickerOpen = destination.open; };
  for (const meta of body.querySelectorAll('[data-bp-meta]')) meta.ontoggle = () => {
    if (meta.open) S.platformDetails.add(meta.dataset.bpMeta); else S.platformDetails.delete(meta.dataset.bpMeta);
  };
  const update = control => updated(control);
  for (const input of body.querySelectorAll('[data-member-select]')) input.onchange = () => {
    const m = Number(input.dataset.memberSelect);
    if (input.checked) S.selPlatforms.add(m); else S.selPlatforms.delete(m);
    update(input);
  };
  for (const input of body.querySelectorAll('[data-group-select]')) {
    const group = GROUPS[Number(input.dataset.groupSelect)];
    input.indeterminate = !input.checked && group.some(m => S.selPlatforms.has(m));
    input.onchange = () => {
      for (const m of group) if (input.checked) S.selPlatforms.add(m); else S.selPlatforms.delete(m);
      update(input);
    };
  }
  for (const b of body.querySelectorAll('[data-bp]')) b.onclick = async () => {
    const action = b.dataset.bp;
    if (action.startsWith('preview-') || action.startsWith('current-') || action.startsWith('effective-')) return preview(action);
    if (action === 'catalog' || action === 'destinations') {
      destination.open = action === 'destinations';
      S.platformPickerOpen = destination.open;
      const focus = action === 'catalog' ? body.querySelector('[data-bp="destinations"]') : destination.querySelector('summary');
      focus.focus();
      focus.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (action === 'donor') return chooseDonor();
    if (action === 'all') S.selPlatforms = new Set(available);
    if (action === 'none') S.selPlatforms.clear();
    if (action === 'view') S.platformRaw = groups;
    if (['keep', 'stock'].includes(action) || action.startsWith('model-')) {
      const assignment = action.startsWith('model-') ? { kind: 'model', id: action.slice(6) } : { kind: action };
      for (const m of selected) S.picks.platforms[m] = assignment;
    }
    if (action === 'clear' || action.startsWith('clear-')) {
      for (const m of action === 'clear' ? selected : [Number(action.slice(6))]) delete S.picks.platforms[m];
    }
    if (action === 'reset' || action.startsWith('set-')) {
      const id = action === 'reset' ? null : action.slice(4);
      if (id && Object.keys(S.picks.platforms).length) {
        const choice = await ask(t('bpSets'), t('bpSetOverrides'), [
          { id: 'cancel', label: t('bpCancel') }, { id: 'keep', label: t('bpRetainOverrides') },
          { id: 'clear', label: t('bpReplaceOverrides'), kind: 'primary' },
        ]);
        if (choice === 'cancel') return;
        if (choice === 'clear') S.picks.platforms = {};
      }
      if (id) S.picks.items.platforms = id;
      else { delete S.picks.items.platforms; S.picks.platforms = {}; S.selPlatforms.clear(); }
    }
    update(b);
  };
}
