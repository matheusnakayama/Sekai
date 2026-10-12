const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sekaiOverlay', {
  onState(callback) {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('sekai:overlay-state', listener);
    return () => ipcRenderer.removeListener('sekai:overlay-state', listener);
  },
  restoreCall() {
    ipcRenderer.send('sekai:overlay:restore-call');
  },
});
