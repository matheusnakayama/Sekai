const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sekaiDesktop', {
  listSources(kind) {
    return ipcRenderer.invoke('sekai:list-sources', kind === 'screen' ? 'screen' : 'window');
  },
  prepareCapture(sourceId, shareAudio) {
    ipcRenderer.sendSync('sekai:prepare-capture', String(sourceId), Boolean(shareAudio));
  },
});
