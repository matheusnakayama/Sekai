const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sekaiDesktop', {
  platform: process.platform,
  getWindowState() {
    return ipcRenderer.invoke('sekai:window:get-state');
  },
  minimizeWindow() {
    return ipcRenderer.invoke('sekai:window:minimize');
  },
  toggleMaximizeWindow() {
    return ipcRenderer.invoke('sekai:window:toggle-maximize');
  },
  closeWindow() {
    return ipcRenderer.invoke('sekai:window:close');
  },
  onWindowMaximized(callback) {
    const listener = (_event, maximized) => callback(Boolean(maximized));
    ipcRenderer.on('sekai:window:maximized', listener);
    return () => ipcRenderer.removeListener('sekai:window:maximized', listener);
  },
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
  getGameActivity() {
    return ipcRenderer.invoke('sekai:games:get-activity');
  },
  updateRegisteredGames(games) {
    return ipcRenderer.invoke('sekai:games:update-registered', games);
  },
  onGameActivity(callback) {
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('sekai:games:activity', listener);
    return () => ipcRenderer.removeListener('sekai:games:activity', listener);
  },
});
