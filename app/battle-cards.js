export function battleSlotCard({ attrs, selected, checked = String(selected), mini, miniAttrs = '',
  tick, clear = '', warning = '', preview = '', name, detail }) {
  return `<div class="slot${selected ? ' on' : ''}" ${attrs} role="checkbox" aria-checked="${checked}" tabindex="0">
    <div class="mini" ${miniAttrs}>${mini}</div><span class="tick">${tick}</span>
    ${clear}${warning}${preview}
    <div class="lbl"><b>${name}</b>${detail}</div></div>`;
}

export function battleLibraryCard({ attrs, selected, thumbnail, thumbnailAttrs = '', badge = '', flag = '', preview, meta }) {
  return `<div class="card${selected ? ' sel' : ''}" ${attrs}>
    <div class="thumb" ${thumbnailAttrs}>${thumbnail}${badge}<div class="flag">${flag}</div>${preview}</div>
    <div class="meta">${meta}</div></div>`;
}

export function battleLibraryGroups(items, titleFor, render, esc) {
  const groups = new Map();
  for (const item of items) {
    const title = titleFor(item);
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push(item);
  }
  return [...groups].map(([title, cards]) =>
    `<div class="fgroup"><div class="group-title">${esc(title)}</div><div class="grid">${cards.map(render).join('')}</div></div>`).join('');
}
