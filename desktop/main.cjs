const { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, screen, session, shell } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SEKAI_LOGO_RED = path.join(ROOT, 'public', 'sekai-logo-red.png');
const LOCAL_PORT = Number(process.env.SEKAI_PORT || 4791);
const HOSTED_URL = 'https://murasakidev.com.br';

let mainWindow = null;
let overlayWindow = null;
let serverProcess = null;
let pendingCapture = null;
let pendingTimer = null;
let overlayParticipants = [];
let overlayCallName = '';
let overlayAccentColor = '#22c55e';
let overlayHiddenByShortcut = false;
let overlayInteractive = false;
let registeredOverlayShortcut = '';

const DEFAULT_OVERLAY_SETTINGS = {
  enabled: false,
  opacity: 82,
  scale: 100,
  position: 'top-left',
  toggleShortcut: 'Control+Shift+F10',
  showAvatars: true,
  showNames: true,
  maxParticipants: 8,
};

function overlaySettingsPath() {
  return path.join(app.getPath('userData'), 'voice-overlay.json');
}

function readOverlaySettings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(overlaySettingsPath(), 'utf8'));
    return sanitizeOverlaySettings(parsed);
  } catch {
    return { ...DEFAULT_OVERLAY_SETTINGS };
  }
}

let overlaySettings = { ...DEFAULT_OVERLAY_SETTINGS };

function sanitizeOverlaySettings(value) {
  const position = ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(value?.position)
    ? value.position
    : DEFAULT_OVERLAY_SETTINGS.position;
  const shortcuts = ['Control+Shift+F10', 'Control+Shift+F9', 'Alt+Shift+F10', 'Alt+Shift+F9'];
  return {
    enabled: value?.enabled === true,
    opacity: Math.max(25, Math.min(100, Number(value?.opacity) || DEFAULT_OVERLAY_SETTINGS.opacity)),
    scale: Math.max(75, Math.min(140, Number(value?.scale) || DEFAULT_OVERLAY_SETTINGS.scale)),
    position,
    toggleShortcut: shortcuts.includes(value?.toggleShortcut) ? value.toggleShortcut : DEFAULT_OVERLAY_SETTINGS.toggleShortcut,
    showAvatars: value?.showAvatars !== false,
    showNames: value?.showNames !== false,
    maxParticipants: Math.max(2, Math.min(12, Number(value?.maxParticipants) || DEFAULT_OVERLAY_SETTINGS.maxParticipants)),
  };
}

function persistOverlaySettings() {
  try {
    fs.mkdirSync(path.dirname(overlaySettingsPath()), { recursive: true });
    fs.writeFileSync(overlaySettingsPath(), JSON.stringify(overlaySettings, null, 2), 'utf8');
  } catch (error) {
    console.error('Não foi possível salvar as preferências da sobreposição:', error);
  }
}

function overlayBounds() {
  const display = screen.getDisplayMatching(mainWindow?.getBounds?.() || screen.getPrimaryDisplay().bounds);
  const { x: areaX, y: areaY, width: areaWidth, height: areaHeight } = display.workArea;
  const scale = overlaySettings.scale / 100;
  const visibleCount = Math.max(1, Math.min(overlayParticipants.length, overlaySettings.maxParticipants));
  const width = Math.round(320 * scale);
  const overflowHeight = overlayParticipants.length > visibleCount ? 28 : 0;
  const height = Math.round((28 + visibleCount * 48 + overflowHeight) * scale);
  const margin = 22;
  const left = overlaySettings.position.endsWith('left');
  const top = overlaySettings.position.startsWith('top');
  return {
    x: left ? areaX + margin : areaX + areaWidth - width - margin,
    y: top ? areaY + margin : areaY + areaHeight - height - margin,
    width,
    height,
  };
}

function updateOverlayWindow() {
  const shouldShow = overlaySettings.enabled && overlayParticipants.length > 0 && !overlayHiddenByShortcut && !mainWindow?.isFocused();
  if (!shouldShow) {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      overlayWindow.hide();
    }
    overlayInteractive = false;
    return;
  }
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    overlayWindow = new BrowserWindow({
      ...overlayBounds(),
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(__dirname, 'overlay-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    overlayWindow.on('closed', () => { overlayWindow = null; });
    overlayWindow.webContents.on('did-finish-load', sendOverlayState);
    void overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));
  } else {
    overlayWindow.setBounds(overlayBounds());
  }
  if (overlayWindow.isVisible()) sendOverlayState();
  else overlayWindow.showInactive();
}

function sendOverlayState() {
  if (!overlayWindow || overlayWindow.isDestroyed() || overlayWindow.webContents.isLoading()) return;
  overlayWindow.webContents.send('sekai:overlay-state', {
    settings: overlaySettings,
    callName: overlayCallName,
    accentColor: overlayAccentColor,
    participants: overlayParticipants,
  });
}

function registerOverlayShortcuts() {
  if (registeredOverlayShortcut) globalShortcut.unregister(registeredOverlayShortcut);
  const toggleVisibility = overlaySettings.toggleShortcut;
  const toggleInteraction = 'Control+Shift+F11';
  const registered = globalShortcut.register(toggleVisibility, () => {
    if (!overlaySettings.enabled || !overlayParticipants.length) return;
    overlayHiddenByShortcut = !overlayHiddenByShortcut;
    updateOverlayWindow();
  });
  if (registered) registeredOverlayShortcut = toggleVisibility;
  else {
    registeredOverlayShortcut = '';
    console.warn(`O atalho ${toggleVisibility} já está em uso por outro aplicativo.`);
  }
  globalShortcut.register(toggleInteraction, () => {
    if (!overlayWindow || !overlayWindow.isVisible()) return;
    overlayInteractive = !overlayInteractive;
    overlayWindow.setIgnoreMouseEvents(!overlayInteractive, { forward: true });
    if (overlayInteractive) overlayWindow.moveTop();
  });
}

function allowedUrl(target) {
  try {
    const url = new URL(target);
    const host = url.hostname;
    return host === 'murasakidev.com.br'
      || host === 'www.murasakidev.com.br'
      || host === 'localhost'
      || host === '127.0.0.1'
      || host === 'accounts.spotify.com';
  } catch {
    return false;
  }
}

function rememberCapture(sourceId, shareAudio) {
  pendingCapture = { sourceId, shareAudio };
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingCapture = null;
  }, 15000);
}

function installCaptureHandler() {
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const pending = pendingCapture;
    pendingCapture = null;
    if (pendingTimer) clearTimeout(pendingTimer);
    if (!pending?.sourceId) {
      callback({});
      return;
    }
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 0, height: 0 },
        fetchWindowIcons: false,
      });
      const source = sources.find((item) => item.id === pending.sourceId);
      if (!source) {
        callback({});
        return;
      }
      const withAudio = pending.shareAudio && process.platform === 'win32';
      callback(withAudio ? { video: source, audio: 'loopback' } : { video: source });
    } catch (error) {
      console.error('Não foi possível capturar a fonte escolhida:', error);
      callback({});
    }
  });

  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === 'media' || permission === 'display-capture' || permission === 'notifications');
  });
}

async function listSources(kind) {
  const sources = await desktopCapturer.getSources({
    types: [kind === 'screen' ? 'screen' : 'window'],
    thumbnailSize: kind === 'screen' ? { width: 320, height: 180 } : { width: 280, height: 158 },
    fetchWindowIcons: kind !== 'screen',
  });
  const ownId = mainWindow?.getMediaSourceId?.() || '';
  return sources
    .filter((source) => source.id !== ownId && source.name.trim())
    .map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.isEmpty() ? '' : source.thumbnail.toDataURL(),
      appIcon: source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : null,
    }));
}

function attachIpc() {
  ipcMain.handle('sekai:list-sources', (_event, kind) => listSources(kind));
  ipcMain.on('sekai:prepare-capture', (event, sourceId, shareAudio) => {
    rememberCapture(String(sourceId || ''), Boolean(shareAudio));
    event.returnValue = true;
  });
  ipcMain.handle('sekai:overlay:get-settings', (event) => {
    if (event.sender !== mainWindow?.webContents) return { ...DEFAULT_OVERLAY_SETTINGS };
    return overlaySettings;
  });
  ipcMain.handle('sekai:overlay:update-settings', (_event, nextSettings) => {
    if (_event.sender !== mainWindow?.webContents) return overlaySettings;
    const shortcutChanged = nextSettings?.toggleShortcut !== overlaySettings.toggleShortcut;
    overlaySettings = sanitizeOverlaySettings(nextSettings);
    persistOverlaySettings();
    if (shortcutChanged) registerOverlayShortcuts();
    overlayHiddenByShortcut = false;
    if (!overlaySettings.enabled) overlayInteractive = false;
    updateOverlayWindow();
    sendOverlayState();
    return overlaySettings;
  });
  ipcMain.on('sekai:overlay:update-call', (_event, state) => {
    if (_event.sender !== mainWindow?.webContents) return;
    const next = Array.isArray(state?.participants) ? state.participants : [];
    overlayParticipants = next.slice(0, 32).map((participant) => ({
      id: String(participant?.id || '').slice(0, 128),
      name: String(participant?.name || 'Usuário').slice(0, 48),
      avatarUrl: typeof participant?.avatarUrl === 'string' && /^https:\/\//i.test(participant.avatarUrl) ? participant.avatarUrl.slice(0, 2048) : '',
      isSpeaking: participant?.isSpeaking === true,
      micOn: participant?.micOn !== false,
    }));
    overlayCallName = String(state?.callName || '').slice(0, 64);
    overlayAccentColor = /^#[\da-f]{6}$/i.test(state?.accentColor) ? state.accentColor : '#22c55e';
    if (!overlayParticipants.length) overlayHiddenByShortcut = false;
    updateOverlayWindow();
    sendOverlayState();
  });
  ipcMain.on('sekai:overlay:restore-call', (event) => {
    if (event.sender !== overlayWindow?.webContents) return;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

function createWindow(targetUrl) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 640,
    title: 'Sekai',
    backgroundColor: '#1e1f22',
    autoHideMenuBar: true,
    icon: SEKAI_LOGO_RED,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (allowedUrl(url)) {
      mainWindow.loadURL(url);
    } else {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!allowedUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('focus', () => updateOverlayWindow());
  mainWindow.on('blur', () => updateOverlayWindow());

  mainWindow.loadURL(targetUrl);
}

function portOpen(port) {
  return new Promise((resolve) => {
    const request = http.get({ hostname: '127.0.0.1', port, path: '/', timeout: 800 }, (response) => {
      response.resume();
      resolve(true);
    });
    request.on('error', () => resolve(false));
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
  });
}

function waitForPort(port, child) {
  const deadline = Date.now() + 120000;
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (child && child.exitCode != null) {
        reject(new Error('O servidor do Sekai encerrou antes de abrir.'));
        return;
      }
      if (await portOpen(port)) {
        resolve();
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error('O Sekai demorou demais para abrir.'));
        return;
      }
      setTimeout(tick, 400);
    };
    tick();
  });
}

async function startLocalServer() {
  if (await portOpen(LOCAL_PORT)) return `http://127.0.0.1:${LOCAL_PORT}`;
  const nextBin = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
  serverProcess = spawn('node', [nextBin, 'dev', '-p', String(LOCAL_PORT)], {
    cwd: ROOT,
    env: { ...process.env, BROWSER: 'none' },
    stdio: 'inherit',
  });
  await waitForPort(LOCAL_PORT, serverProcess);
  return `http://127.0.0.1:${LOCAL_PORT}`;
}

function stopServer() {
  if (!serverProcess || serverProcess.killed) return;
  serverProcess.kill();
  serverProcess = null;
}

function waitForTitle(win, prefix) {
  const deadline = Date.now() + 8000;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const title = win.getTitle();
      if (title.startsWith(prefix)) {
        resolve(title);
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error(`titulo inesperado: ${title}`));
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  });
}

async function smoke() {
  const sources = await listSources('window');
  const screens = await listSources('screen');
  const screen = screens[0];
  let capture = 'skipped';
  if (screen) {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    mainWindow = win;
    await win.loadFile(path.join(__dirname, 'smoke.html'), { query: { id: screen.id } });
    const title = await waitForTitle(win, 'CAPTURE');
    capture = title;
    win.destroy();
    mainWindow = null;
  }
  const live = capture.startsWith('CAPTURE:live');
  console.log(JSON.stringify({
    ok: live || !screen,
    windows: sources.length,
    screens: screens.length,
    sample: sources.slice(0, 5).map((source) => source.name),
    capture,
  }));
  app.exit(live || !screen ? 0 : 1);
}

app.setName('Sekai');

app.whenReady().then(async () => {
  overlaySettings = readOverlaySettings();
  installCaptureHandler();
  attachIpc();
  registerOverlayShortcuts();
  if (process.argv.includes('--smoke')) {
    await smoke();
    return;
  }
  const explicit = process.env.SEKAI_URL;
  const target = explicit || (app.isPackaged ? HOSTED_URL : await startLocalServer());
  if (!allowedUrl(target)) {
    console.error('SEKAI_URL precisa ser o site do Sekai ou localhost.');
    app.exit(1);
    return;
  }
  createWindow(target);
});

app.on('window-all-closed', () => {
  stopServer();
  app.quit();
});

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy();
  stopServer();
});
