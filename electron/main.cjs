/**
 * God's Eye View — Electron main process
 *
 * Ensures the Vite dev server (which carries all /api/* proxies) is running,
 * then opens a BrowserWindow pointed at it. If a healthy server is already
 * listening on the port (e.g. a dev terminal), it is reused, never killed.
 *
 * Debugging: launch from a terminal to see [electron] logs — they cover Vite
 * startup, renderer load success/failure, and renderer console errors.
 */

const { app, BrowserWindow, Menu, shell, nativeTheme } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
// Always use the explicit IPv4 loopback host: Chromium may resolve `localhost`
// to ::1 first, and a Vite bound to 127.0.0.1 would then be unreachable.
const DEV_HOST = '127.0.0.1';
const DEV_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4173;
const DEV_URL = `http://${DEV_HOST}:${DEV_PORT}`;
// When packaged, electron-builder (asar:false) lays the app out at
// Resources/app/ — that directory holds index.html, vite.config.js, src/, etc.
const PROJECT_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, 'app')
  : path.join(__dirname, '..');
// Run Vite with Electron's own bundled Node (ELECTRON_RUN_AS_NODE) so the
// packaged app never depends on a system Node install or .bin symlinks.
const VITE_JS = path.join(PROJECT_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

const STARTUP_TIMEOUT_MS = 60_000;
/** Fallback: never leave the user staring at nothing if ready-to-show lags. */
const SHOW_FALLBACK_MS = 10_000;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let mainWindow = null;
let viteProcess = null; // only set when WE spawned the server

// ---------------------------------------------------------------------------
// Server probe helpers
// ---------------------------------------------------------------------------

/** GET a URL; resolve {ok, status} — never rejects. */
function probe(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve({ ok: res.statusCode >= 200 && res.statusCode < 500, status: res.statusCode });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0 }); });
    req.on('error', () => resolve({ ok: false, status: 0 }));
  });
}

/**
 * Wait until the dev server answers on DEV_URL.
 * @returns {Promise<boolean>} true when reachable, false on timeout.
 */
async function waitForServer(url, timeoutMs = STARTUP_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { ok } = await probe(url);
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Vite dev-server lifecycle
// ---------------------------------------------------------------------------

/**
 * Ensure a Vite dev server is up:
 *  1. If something already answers on DEV_URL, reuse it (likely a dev terminal).
 *  2. Otherwise spawn `vite --strictPort` and wait for readiness.
 */
async function ensureServerRunning() {
  if (await waitForServer(DEV_URL, 2_000)) {
    console.log(`[electron] reusing already-running dev server at ${DEV_URL}`);
    return;
  }

  console.log('[electron] starting Vite dev server…');
  // --strictPort: fail loudly instead of silently drifting to another port
  // (which would leave this window pointed at nothing). The positional root
  // keeps Vite serving the app dir regardless of our cwd.
  viteProcess = spawn(process.execPath, [
    VITE_JS,
    PROJECT_ROOT,
    '--host', DEV_HOST,
    '--port', String(DEV_PORT),
    '--strictPort',
  ], {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      ELECTRON_NO_ATTACH_CONSOLE: '1',
      FORCE_COLOR: '0',
    },
  });

  viteProcess.stdout.on('data', (chunk) => process.stdout.write(`[vite] ${chunk}`));
  viteProcess.stderr.on('data', (chunk) => process.stderr.write(`[vite] ${chunk}`));

  viteProcess.on('error', (err) => {
    console.error('[electron] failed to launch Vite binary:', err.message);
  });

  viteProcess.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`[electron] Vite exited with code ${code}`);
    }
    // If Vite dies while the window is open, tell the user instead of hanging.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('gev:server-lost');
      mainWindow.loadURL('data:text/html,<body style="background:#000;color:#0f0;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><h1>SERVER LOST — restart the app</h1></body>');
    }
  });

  const up = await waitForServer(DEV_URL);
  if (!up) {
    throw new Error(`dev server did not become reachable at ${DEV_URL} within ${STARTUP_TIMEOUT_MS / 1000}s`);
  }
  console.log('[electron] Vite dev server ready');
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: "God's Eye View",
    // Native title bar: draggable like any normal macOS app. (hiddenInset
    // looked sleek but made the window undraggable — the HUD has no drag
    // regions.) Force dark so the titlebar matches the black UI.
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false, // keep Cesium ticking when occluded
    },
    show: false,
  });

  const wc = mainWindow.webContents;

  // Surface renderer problems in the terminal instead of failing silently.
  wc.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[electron] did-fail-load ${code} ${desc} ${url}`);
  });
  wc.on('did-finish-load', () => {
    console.log('[electron] renderer finished loading', DEV_URL);
  });
  wc.on('render-process-gone', (_e, details) => {
    console.error('[electron] renderer gone:', details.reason);
  });
  // Forward renderer console errors (Cesium/WebGL failures show up here).
  wc.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) console.error(`[renderer] ${message} (${sourceId}:${line})`);
  });

  // Context menu for text inputs (cut, copy, paste, select all)
  wc.on('context-menu', (_e, props) => {
    if (props.isEditable) {
      const editMenu = Menu.buildFromTemplate([
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ]);
      editMenu.popup({ window: mainWindow });
    }
  });

  mainWindow.loadURL(DEV_URL);

  // Show as soon as first paint is possible — with a fallback timer so a
  // stalled ready-to-show never leaves an invisible app.
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      console.warn('[electron] ready-to-show never fired — showing window anyway');
      mainWindow.show();
    }
  }, SHOW_FALLBACK_MS);

  // External links go to the system browser.
  wc.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// macOS menu
// ---------------------------------------------------------------------------

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// Hardware VSync and Metal acceleration flags
app.commandLine.appendSwitch('enable-features', 'Metal,UseSkiaRenderer');
app.commandLine.appendSwitch('disable-frame-rate-limit', '0'); // Enforce strict display VSync
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

// Hard cap on Chromium's disk cache so 3D Photorealistic Tiles don't fill the disk
app.commandLine.appendSwitch('disk-cache-size', '1073741824'); // 1 GB max
app.commandLine.appendSwitch('media-cache-size', '268435456'); // 256 MB max

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark'; // dark titlebar/menu to match the app
  buildMenu();

  try {
    await ensureServerRunning();
  } catch (err) {
    console.error('[electron] startup failed:', err.message);
    // Show the failure instead of quitting silently.
    mainWindow = new BrowserWindow({
      width: 640, height: 320, title: "God's Eye View — startup failed",
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });
    mainWindow.loadURL(
      'data:text/html,<body style="background:#000;color:#f55;font-family:monospace;padding:24px"><h2>Startup failed</h2><pre>'
      + String(err.message).replace(/[<>&]/g, '') + '</pre></body>',
    );
    mainWindow.show();
    return;
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  if (viteProcess && !viteProcess.killed) {
    console.log('[electron] stopping spawned Vite dev server');
    viteProcess.kill('SIGTERM');
  }
});
