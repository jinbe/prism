import { app, safeStorage } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'

// Proxy connection settings persist between launches. Non-secret fields live as
// plain JSON in userData; the password is encrypted with the OS secret store via
// Electron safeStorage (macOS Keychain / Windows DPAPI / Linux libsecret). When
// no real backend is available (e.g. a headless Linux box without a keyring) we
// refuse to persist the password rather than fall back to safeStorage's
// hardcoded-key plaintext mode.

export interface ProxySettingsSave {
  host: string
  port: number
  username: string
  password: string
}

export interface ProxySettingsLoad {
  host?: string
  port?: number
  username?: string
  password?: string
  /** Whether the OS secret store is available to persist the password. */
  secure: boolean
}

interface StoredFile {
  host?: string
  port?: number
  username?: string
  /** base64 of the safeStorage-encrypted password. */
  passwordEnc?: string
}

function file(): string {
  return join(app.getPath('userData'), 'prism-settings.json')
}

function uiFile(): string {
  return join(app.getPath('userData'), 'prism-ui-state.json')
}

// Last-used UI layout (panes, viewports, urls, toggles). Non-secret, plain JSON.
export async function loadUiState(): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(uiFile(), 'utf8'))
  } catch {
    return null
  }
}

export async function saveUiState(state: unknown): Promise<void> {
  await fs.writeFile(uiFile(), JSON.stringify(state, null, 2))
}

export async function loadProxy(): Promise<ProxySettingsLoad> {
  const secure = safeStorage.isEncryptionAvailable()
  try {
    const data = JSON.parse(await fs.readFile(file(), 'utf8')) as StoredFile
    let password: string | undefined
    if (data.passwordEnc && secure) {
      try {
        password = safeStorage.decryptString(Buffer.from(data.passwordEnc, 'base64'))
      } catch {
        /* wrong key / corrupt — ignore the stored password */
      }
    }
    return { host: data.host, port: data.port, username: data.username, password, secure }
  } catch {
    return { secure }
  }
}

export async function saveProxy(s: ProxySettingsSave): Promise<void> {
  const data: StoredFile = {
    host: s.host,
    port: s.port,
    username: s.username || undefined
  }
  if (s.password && safeStorage.isEncryptionAvailable()) {
    data.passwordEnc = safeStorage.encryptString(s.password).toString('base64')
  }
  // 0o600: readable only by the user, since it references their proxy host/user.
  await fs.writeFile(file(), JSON.stringify(data, null, 2), { mode: 0o600 })
}
