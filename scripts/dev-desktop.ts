/**
 * `bun run dev:desktop [dir]` — launch the desktop app in dev mode on a workspace.
 * `tauri dev` runs the binary with cwd = packages/desktop/src-tauri, so a relative
 * path given on the command line would resolve against that directory. Resolve it
 * here, against the caller's cwd, and pass it through as absolute. With no argument
 * the app opens its folder picker.
 */
import { resolve } from 'node:path'

const arg = process.argv[2]
const dirArgs = arg === undefined ? [] : ['--', '--', resolve(arg)]
const proc = Bun.spawn(['bun', 'run', '--cwd', 'packages/desktop', 'tauri', 'dev', ...dirArgs], {
  stdio: ['inherit', 'inherit', 'inherit'],
  env: process.env,
})
process.exit(await proc.exited)
