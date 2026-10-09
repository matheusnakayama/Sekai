const { app, BrowserWindow, desktopCapturer, ipcMain, session, shell } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOCAL_PORT = Number(process.env.SEKAI_PORT || 4791);
const HOSTED_URL = 'https://murasakidev.com.br';

let mainWindow = null;
let serverProcess = null;
let pendingCapture = null;
let pendingTimer = null;

function allowedUrl(target) {
  try {
    const url = new URL(target);
    const host = url.hostname;
    return host === 'murasakidev.com.br'
      || host === 'www.murasakidev.com.br'
      || host === 'localhost'
      || host === '127.0.0.1';
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
    icon: path.join(ROOT, 'public', 'sekai-symbol.jpg'),
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
  installCaptureHandler();
  attachIpc();
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
  stopServer();
});
