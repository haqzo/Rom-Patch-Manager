/*
 * Browser helpers: file pickers and saving.
 * Edge/Chrome get a real "Save as" dialog (File System Access API); other browsers download.
 */
export const platform = {
  version: '1.1.1',

  /** Ask for files. Returns File objects. */
  pickFiles({ accept = '', multiple = false, directory = false } = {}) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.multiple = multiple;
      if (directory) input.webkitdirectory = true;
      input.style.display = 'none';
      document.body.appendChild(input);
      let done = false;
      const finish = (v) => { if (done) return; done = true; input.remove(); resolve(v); };
      input.addEventListener('change', () => finish([...input.files]));
      input.addEventListener('cancel', () => finish([]));
      input.click();
    });
  },

  /** Save bytes. Returns { name } (save dialog), { downloaded: true } or null if cancelled. */
  async save(defaultName, bytes) {
    if (typeof window.showSaveFilePicker === 'function' && !navigator.webdriver) {
      const ext = (defaultName.match(/\.[a-z0-9]+$/i) || [''])[0];
      try {
        const h = await window.showSaveFilePicker({ suggestedName: defaultName, types: ext ? [{ description: ext.slice(1).toUpperCase() + ' file', accept: { 'application/octet-stream': [ext] } }] : undefined });
        const w = await h.createWritable(); await w.write(bytes); await w.close();
        return { name: h.name };
      } catch (e) {
        if (e && e.name === 'AbortError') return null;
      }
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url; a.download = defaultName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { downloaded: true };
  },
};
