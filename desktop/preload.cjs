const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sekaiDesktop', {
  listSources(kind) {
    return ipcRenderer.invoke('sekai:list-sources', kind === 'screen' ? 'screen' : 'window');
  },
  prepareCapture(sourceId, shareAudio) {
    ipcRenderer.sendSync('sekai:prepare-capture', String(sourceId), Boolean(shareAudio));
  },
  getOverlaySettings() {
    return ipcRenderer.invoke('sekai:overlay:get-settings');
  },
  updateOverlaySettings(settings) {
    return ipcRenderer.invoke('sekai:overlay:update-settings', settings);
  },
  updateOverlayCall(state) {
    ipcRenderer.send('sekai:overlay:update-call', state);
  },
  restoreCallFromOverlay() {
    ipcRenderer.send('sekai:overlay:restore-call');
  },
  onOverlayState(callback) {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('sekai:overlay-state', listener);
    return () => ipcRenderer.removeListener('sekai:overlay-state', listener);
  },
});
