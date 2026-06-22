import { spawn, spawnSync, ChildProcess } from 'child_process'
import net from 'net'
import { session, BrowserWindow } from 'electron'

export interface ProxyConfig {
  /** SSH host (as known to ssh/ssh_config), e.g. "dev-host". */
  host: string
  /** Local SOCKS5 port the tunnel listens on, e.g. 1080. */
  port: number
  /** Optional SSH username (else from ~/.ssh/config or the OS user). */
  username?: string
  /** Optional SSH password; fed to ssh via sshpass. Blank = key/agent auth. */
  password?: string
}

// Packaged macOS/Linux apps launched from Finder/Dock inherit a bare PATH
// (/usr/bin:/bin:/usr/sbin:/sbin) — NOT the shell's. So binaries installed by
// Homebrew (/opt/homebrew/bin, /usr/local/bin) like autossh/sshpass aren't
// found, even though they work in `pnpm run dev` (terminal PATH). Resolve the
// login shell's real PATH once and merge it in. This runs only when packaged.
let pathFixed = false
function ensurePath(): void {
  if (pathFixed) return
  pathFixed = true
  if (process.platform === 'win32') return

  const extra: string[] = []
  try {
    const shell = process.env.SHELL || '/bin/zsh'
    // Login + interactive so the user's profile (where Homebrew sets PATH) loads.
    const out = spawnSync(shell, ['-ilc', 'printf %s "$PATH"'], {
      encoding: 'utf8',
      timeout: 5000
    })
    if (out.status === 0 && out.stdout) extra.push(...out.stdout.trim().split(':'))
  } catch {
    /* fall back to the static dirs below */
  }
  extra.push('/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin', '/usr/local/sbin')

  const seen = new Set<string>()
  const merged = [...(process.env.PATH || '').split(':'), ...extra].filter((p) => {
    if (!p || seen.has(p)) return false
    seen.add(p)
    return true
  })
  process.env.PATH = merged.join(':')
}

function commandExists(cmd: string): boolean {
  try {
    return spawnSync('which', [cmd], { stdio: 'ignore' }).status === 0
  } catch {
    return false
  }
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
  if (child?.pid) {
    // Children are spawned detached (own process group) so we can take down the
    // whole group — sshpass forks ssh, and killing only sshpass can orphan it.
    try {
      process.kill(-child.pid)
    } catch {
      try {
        child.kill()
      } catch {
        /* ignore */
      }
    }
  }
  child = null
}

function spawnTunnel(cfg: ProxyConfig): void {
  const sshArgs = [
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
    'TCPKeepAlive=yes'
  ]
  if (cfg.username) sshArgs.push('-l', cfg.username)

  let cmd: string
  let args: string[]
  const env: NodeJS.ProcessEnv = { ...process.env }

  if (cfg.password) {
    // sshpass feeds the SSH password non-interactively (there's no tty here).
    // autossh + sshpass is unreliable, so use plain ssh in this path.
    // accept-new avoids a host-key prompt that would otherwise hang silently.
    cmd = 'sshpass'
    args = ['-e', 'ssh', '-o', 'StrictHostKeyChecking=accept-new', ...sshArgs, cfg.host]
    env.SSHPASS = cfg.password
  } else if (commandExists('autossh')) {
    // key/agent auth: prefer autossh for auto-reconnect.
    cmd = 'autossh'
    args = ['-M', '0', ...sshArgs, cfg.host]
    env.AUTOSSH_GATETIME = '0'
  } else {
    // autossh not installed: plain ssh still works (no auto-reconnect).
    cmd = 'ssh'
    args = [...sshArgs, cfg.host]
  }

  child = spawn(cmd, args, { env, stdio: 'ignore', detached: true })

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
  ensurePath()

  if (cfg.password && !commandExists('sshpass')) {
    const status: ProxyStatus = {
      enabled: false,
      reason:
        'Password auth needs sshpass. macOS: brew install hudochenkov/sshpass/sshpass. Linux: apt/dnf/pacman install sshpass.'
    }
    enabled = false
    broadcast(status)
    return status
  }

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
        reason: cfg.password
          ? `SSH tunnel did not open port ${cfg.port}. Check the password and that "${cfg.host}" is reachable.`
          : `SSH tunnel did not open port ${cfg.port}. Is "${cfg.host}" reachable, keys set up (or set a password), and autossh installed?`
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
