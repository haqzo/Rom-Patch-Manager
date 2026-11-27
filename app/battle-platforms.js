import { battleSlotCard, battleLibraryCard, battleLibraryGroups } from './battle-cards.js';
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
  return `<span>${esc(t(meta?.status === 'verified' ? 'bpVerified' : 'bpUnconfirmed'))}
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
  const button = (action, text, disabled = false, style = 'ghost') =>
    `<button type="button" class="${style} small" data-bp="${esc(action)}" ${disabled ? 'disabled' : ''}>${esc(text)}</button>`;
  const previewButton = (action, label, style = 'peek') =>
    `<button type="button" class="${style}" data-bp="${esc(action)}" aria-label="${esc(label)}" title="${esc(label)}">${icon('eye')}</button>`;
  const line = text => `<span>${esc(text)}</span>`;
  const modelName = id => L(lib.platforms.models.find(m => m.id === id)?.name);
  const knownModel = (file, member) => lib.platforms.models.find(m => modelFile(m, member, lib) === file);
  const suggested = meta => {
    const name = modelName(meta?.suggested);
    return name ? line(t('bpSuggested') + ' ' + name) : '';
  };
  const assignmentLabel = (a, member) => [
    t(assignmentState(a)), a?.model ? L(a.model.name) : a?.set ? L((knownModel(a.file, member) || a.set).name) : null,
  ].filter(Boolean).join(' · ');
  const current = member => target && available.includes(member) ?
    `<button type="button" class="link" data-bp="current-${member}">${esc(t('bpPreviewCurrent'))}</button>` : '';
  const isOverride = member => assignments.has(member) && assignments.get(member).kind !== 'inherit';

  function destination(members, group = null) {
    const first = members[0];
    const count = members.filter(member => S.selPlatforms.has(member)).length;
    const { mixed, assignment } = groupAssignment(members, assignments);
    const a = assignments.get(first);
    const installed = S.scan?.platforms[first];
    const effectiveModel = a?.file ? a.model || knownModel(a.file, first) :
      a?.kind === 'stock' ? null : lib.platforms.models.find(m => m.id === installed?.id);
    const usable = a?.kind === 'stock' ? !!S.stockPlatforms && available.includes(first) :
      !!a?.file || !!target?.valid.includes(first);
    const photo = effectiveModel?.empty || !usable || hasThumb(effectiveModel?.id) ? '' :
      a?.file ? 'file:' + a.file : (a?.kind === 'stock' ? 'stock:' : 'rom:') + first;
    const mini = effectiveModel?.empty ? esc(t('bpIntentionalEmpty')) :
      hasThumb(effectiveModel?.id) ? thumb(effectiveModel.id, 'disc') : icon('disc', 'glyph');
    const different = models => models?.[first] && members.some(member =>
      models[member] && !bytesEqual(models[first], models[member]));
    const mixedInstalled = different(target?.models);
    const mixedEffective = mixed || (!assignment?.file &&
      (assignment?.kind === 'stock' ? different(S.stockPlatforms?.models) : mixedInstalled));
    const meta = group == null ? slotMeta[first] : groupMeta[group];
    const name = group == null ? platformName(lib, first) : groupName(lib, group);
    const memberLine = (member, withMetadata) => {
      const { group, variant } = SLOT[member];
      const coordinates = groupName(lib, group) + ' · ' + title('bpVariant', variant);
      const state = t('bpInstalled') + ' · ' + installedName(S, member);
      if (!withMetadata) return line('#' + numbered(member) + ' · ' + title('bpVariant', variant) + ' · ' + state + ' · ' + assignmentLabel(assignments.get(member), member));
      return line(coordinates) + line(state) + current(member);
    };
    const isGroup = group != null;
    const detail = isGroup
      ? line(members.map(member => '#' + numbered(member)).join(', ')) +
        members.map(member => members.length === 1 ? memberLine(member, true) :
          `<div class="platform-variant">${memberLine(member, false)}
             ${member !== first ? `<button type="button" class="link" data-bp="effective-${member}">${esc(t('bpPreviewEffective'))}</button>` : ''}
             ${current(member)}
             ${isOverride(member) ? `<button type="button" class="link" data-bp="clear-${member}">${esc(t('bpClearOverride'))}</button>` : ''}
             ${slotMeta[member] ? metaLine(slotMeta[member], esc) : ''}</div>`).join('')
      : memberLine(first, true);
    const validity = isGroup || available.includes(first);
    return battleSlotCard({
      attrs: `data-platform-slot data-${isGroup ? 'group' : 'member'}="${group ?? first}" aria-label="${esc(name)}"${validity ? '' : ' aria-disabled="true"'}`,
      selected: count === members.length, checked: count && count < members.length ? 'mixed' : String(count === members.length),
      mini, miniAttrs: `${photo ? `data-platform-photo="${esc(photo)}"` : ''}${mixedEffective ? ` data-preview-member="#${numbered(first)}"` : ''}`,
      tick: count === members.length ? icon('check') : count ? '−' : '',
      clear: members.some(isOverride) ? `<button type="button" class="clear" data-bp="clear-${isGroup ? 'group-' + group : first}"
        aria-label="${esc(t('bpClearOverride'))}" title="${esc(t('bpClearOverride'))}">✕</button>` : '',
      preview: usable ? previewButton('effective-' + first, t('bpPreviewEffective')) : '',
      name: esc(name) + (L(meta?.name) ? ' · #' + numbered(group ?? first) : ''),
      detail: `<span data-assignment="${mixed ? 'mixed' : assignment?.kind || 'unchanged'}">${esc(mixed ? t('bpMixedAssignments') : assignmentLabel(assignment, first))}</span>` +
        (mixedEffective && !mixed ? line(t('bpMixedModels')) : '') + (isGroup && mixedInstalled ? line(t('bpMixedInstalled')) : '') + detail +
        metaLine(meta, esc) + suggested(meta) +
        ((!isGroup && first === 5) || (isGroup && !target.groupUsed.includes(group)) ? line(t('bpNoOrdinaryLookup')) : ''),
    });
  }
  const sets = lib.items.filter(it => it.cat === 'platforms' && !it.archived);
  const models = lib.platforms.models.filter(m => !m.archived)
    .sort((a, b) => authorName(a.by).localeCompare(authorName(b.by)));
  const modelCard = m => {
    const canApply = selected.length > 0 && selected.every(member => !!modelFile(m, member, lib));
    const pending = [...assignments.values()].filter(a => a.model?.id === m.id).length;
    return battleLibraryCard({
      attrs: `data-platform-model="${esc(m.id)}" data-f="${esc(filterKey(m))}" data-by="${esc(m.by)}"${canApply ? ' tabindex="0" role="button"' : ''}`,
      selected: pending > 0,
      thumbnail: m.empty ? esc(t('bpIntentionalEmpty')) : thumb(m.id, 'disc'),
      thumbnailAttrs: !m.empty && m.file && !hasThumb(m.id) ? `data-platform-photo="file:${esc(m.file)}"` : '',
      flag: pending ? `<span class="pill sel">${icon('check')}${esc(t('bpAssigned').replace('{n}', pending))}</span>` : '',
      preview: previewButton('preview-model-' + m.id, t('preview') + ' · ' + L(m.name)),
      meta: `<div class="name">${esc(L(m.name))}</div><div class="by">${esc(t('by'))} ${esc(authorName(m.by))}</div>
        ${m.desc ? `<div class="note">${esc(L(m.desc))}</div>` : ''}
        ${m.members ? `<div class="note">${esc(t('bpCompatible').replace('{members}', memberRanges(m.members)))}</div>` : ''}
        <div class="row">${button('model-' + m.id, t('bpApply'), !canApply, 'secondary')}</div>`,
    });
  };
  body.innerHTML = `
    <div class="battle-bar">
      <div class="seg">
        <button type="button" data-bp="members" class="${groups ? '' : 'on'}" aria-pressed="${!groups}">${esc(t('bpMembersMode'))}</button>
        <button type="button" data-bp="groups" class="${groups ? 'on' : ''}" aria-pressed="${!!groups}" ${target?.groupSafe ? '' : `disabled title="${esc(t('bpGroupsUnavailable'))}"`}>${esc(t('bpGroupsMode'))}</button>
      </div>
      <span class="muted small">${esc(t('bpShared'))}</span>
    </div>
    <div class="group-title platform-heading" id="bpTargets" tabindex="-1">${esc(t('bpDestinations'))}
      <span class="muted" aria-live="polite">${esc(selectedLabel)}</span>
      ${button('all', t('selectAll'), !available.length)}${button('none', t('selectNone'), !selected.length)}
      ${button('catalog', t('bpBrowseModels'))}</div>
    <div class="slots">${groups ? GROUPS.map((members, group) => destination(members, group)).join('') : MEMBERS.map(member => destination([member])).join('')}</div>
    <div class="group-title platform-heading">${esc(t('sets'))}
      ${button('reset', t('bpReset'), !base && !Object.keys(S.picks.platforms).length)}</div>
    <div class="row">${sets.map(it => `<div class="row">
      <button type="button" class="secondary small" data-bp="set-${esc(it.id)}" aria-pressed="${it.id === base?.id}"
        ${target && !it.writes.every(w => available.includes(w.member)) ? 'disabled' : ''}>${esc(L(it.name))}</button>
      ${previewButton('preview-set-' + it.id, t('preview') + ' · ' + L(it.name), 'icon-btn')}</div>`).join('')}</div>
    <div class="group-title platform-heading" id="bpLibrary" tabindex="-1">${esc(t('library'))}
      <span class="muted" aria-live="polite">${esc(selected.length ? selectedLabel + ' · ' + memberRanges(selected) : t('bpChooseTargets'))}</span>
      ${button('destinations', t('bpChooseDestinations'))}</div>
    <div class="battle-bar">
      ${button('keep', t('bpKeep'), !selected.length)}${button('stock', t('bpStock'), !selected.length || !S.stockPlatforms)}
      ${button('clear', t('bpClearOverride'), !selected.some(isOverride))}${button('donor', t('bpLoadDonor'), !target?.groupSafe)}
      <span class="muted small">${esc(S.stockPlatforms ? t('bpStockReady') : t('bpNeedDonor'))}</span>
    </div>
    ${filterBar(models)}${battleLibraryGroups(models, m => authorName(m.by), modelCard, esc)}
    <p class="muted" id="fempty" hidden>${esc(t('noMatch'))}</p>`;

  const update = control => updated(control);
  function activateCard(card, action) {
    card.onclick = e => { if (!e.target.closest('button')) action(); };
    card.onkeydown = e => {
      if (e.target !== card || ![' ', 'Enter'].includes(e.key)) return;
      e.preventDefault();
      action();
    };
  }
  for (const card of body.querySelectorAll('[data-platform-slot]:not([aria-disabled])')) {
    const members = card.dataset.group == null ? [Number(card.dataset.member)] : GROUPS[Number(card.dataset.group)];
    activateCard(card, () => {
      const remove = members.every(member => S.selPlatforms.has(member));
      for (const member of members) {
        if (remove) S.selPlatforms.delete(member); else S.selPlatforms.add(member);
      }
      update(card);
    });
  }
  for (const card of body.querySelectorAll('[data-platform-model][tabindex]')) {
    activateCard(card, () => card.querySelector('.secondary').click());
  }
  for (const b of body.querySelectorAll('[data-bp]')) b.onclick = async () => {
    const action = b.dataset.bp;
    if (action.startsWith('preview-') || action.startsWith('current-') || action.startsWith('effective-')) return preview(action);
    if (action === 'catalog' || action === 'destinations') {
      const focus = body.querySelector(action === 'catalog' ? '#bpLibrary' : '#bpTargets');
      focus.focus();
      focus.scrollIntoView({ block: 'start' });
      return;
    }
    if (action === 'donor') return chooseDonor();
    if (action === 'all') S.selPlatforms = new Set(available);
    if (action === 'none') S.selPlatforms.clear();
    if (action === 'members' || action === 'groups') S.platformRaw = action === 'members';
    if (['keep', 'stock'].includes(action) || action.startsWith('model-')) {
      const assignment = action.startsWith('model-') ? { kind: 'model', id: action.slice(6) } : { kind: action };
      for (const m of selected) S.picks.platforms[m] = assignment;
    }
    if (action === 'clear' || action.startsWith('clear-')) {
      const members = action === 'clear' ? selected : action.startsWith('clear-group-') ?
        GROUPS[Number(action.slice(12))] : [Number(action.slice(6))];
      for (const m of members) delete S.picks.platforms[m];
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
