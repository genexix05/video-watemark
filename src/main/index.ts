import { app, BrowserWindow, ipcMain, protocol, shell } from 'electron'
import { join } from 'node:path'
import { IPC_CHANNELS } from '../shared/api'
import { getMediaBinaryPaths } from './media-binaries'
import { registerMediaIpc, registerMediaPreviewProtocol } from './media/ipc'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media-preview',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
])

const createWindow = (): void => {
  const window = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.once('ready-to-show', () => window.show())

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.local.video-watermark')

  ipcMain.handle(IPC_CHANNELS.runtimeInfo, () => ({
    platform: process.platform,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
    mediaBinaries: getMediaBinaryPaths(),
  }))
  registerMediaPreviewProtocol()
  registerMediaIpc()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
