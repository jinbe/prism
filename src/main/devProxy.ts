import { spawn, ChildProcess } from 'child_process'
import net from 'net'
import { session, BrowserWindow } from 'electron'

export interface ProxyConfig {
  /** SSH host (as known to ssh/ssh_config), e.g. "dev-host". */
  host: string
  /** Local SOCKS5 port the tunnel listens on, e.g. 1080. */
  port: number
}

export interface ProxyStatus {
  enabled: boolean
  host?: string
  port?: number
  /** true if WE started the tunnel; false if we reused one already running. */
  ownTunnel?: boolean
  reason?: string
}

let child: ChildProcess | null = null
let enabled = false
let current: ProxyConfig | null = null

function broadcast(status: ProxyStatus): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('devproxy:status', status)
  }
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host: '127.0.0.1', port }, () => {
      sock.destroy()
      resolve(true)
    })
    sock.on('error', () => {
      sock.destroy()
      resolve(false)
    })
  })
}

function waitForPort(port: number, timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve) => {
    const tryOnce = async (): Promise<void> => {
      if (await portOpen(port)) return resolve(true)
      if (Date.now() > deadline) return resolve(false)
      setTimeout(tryOnce, 500)
    }
    void tryOnce()
  })
}

async function applyProxy(partition: string, port: number): Promise<void> {
  const ses = session.fromPartition(partition)
  await ses.setProxy({
    proxyRules: `socks5://127.0.0.1:${port}`,
    // "<-loopback>" removes Chromium's implicit "bypass localhost" rule, so
    // loopback requests are ALSO sent through the SOCKS proxy — i.e. localhost
    // is resolved on the remote host. This mirrors your chrome-dev script's
    // --proxy-bypass-list="<-loopback>".
    proxyBypassRules: '<-loopback>'
  })
}

async function clearProxy(partition: string): Promise<void> {
  const ses = session.fromPartition(partition)
  await ses.setProxy({ mode: 'direct' })
}

function stopChild(): void {
  if (child) {
    try {
      child.kill()
    } catch {
      /* ignore */
    }
    child = null
  }
}

function spawnTunnel(cfg: ProxyConfig): void {
  // Prefer autossh (auto-reconnect) and fall back to plain ssh if it's missing.
  const useAutossh = true
  const cmd = useAutossh ? 'autossh' : 'ssh'
  const args = useAutossh
    ? [
        '-M',
        '0',
        '-N',
        '-C',
        '-D',
        String(cfg.port),
        '-o',
        'ServerAliveInterval=15',
        '-o',
        'ServerAliveCountMax=3',
        '-o',
        'ExitOnForwardFailure=yes',
        '-o',
        'TCPKeepAlive=yes',
        cfg.host
      ]
    : [
        '-N',
        '-C',
        '-D',
        String(cfg.port),
        '-o',
        'ServerAliveInterval=15',
        '-o',
        'ExitOnForwardFailure=yes',
        cfg.host
      ]

  child = spawn(cmd, args, {
    env: { ...process.env, AUTOSSH_GATETIME: '0' },
    stdio: 'ignore'
  })

  child.on('error', (err) => {
    child = null
    enabled = false
    broadcast({ enabled: false, reason: `tunnel error: ${err.message}` })
  })

  child.on('exit', (code) => {
    child = null
    if (enabled) {
      enabled = false
      broadcast({ enabled: false, reason: `tunnel exited (code ${code ?? 'null'})` })
    }
  })
}

export async function enable(cfg: ProxyConfig, partition: string): Promise<ProxyStatus> {
  current = cfg

  // Reuse a tunnel that's already up (e.g. one started by your chrome-dev script).
  const reused = await portOpen(cfg.port)
  if (!reused) {
    spawnTunnel(cfg)
    const ok = await waitForPort(cfg.port)
    if (!ok) {
      stopChild()
      enabled = false
      const status: ProxyStatus = {
        enabled: false,
        reason: `SSH tunnel did not open port ${cfg.port}. Is "${cfg.host}" reachable and is autossh installed?`
      }
      broadcast(status)
      return status
    }
  }

  await applyProxy(partition, cfg.port)
  enabled = true
  const status: ProxyStatus = { enabled: true, host: cfg.host, port: cfg.port, ownTunnel: !reused }
  broadcast(status)
  return status
}

export async function disable(partition: string): Promise<ProxyStatus> {
  await clearProxy(partition)
  stopChild()
  enabled = false
  const status: ProxyStatus = { enabled: false }
  broadcast(status)
  return status
}

export function status(): ProxyStatus {
  return enabled && current
    ? { enabled: true, host: current.host, port: current.port, ownTunnel: !!child }
    : { enabled: false }
}
