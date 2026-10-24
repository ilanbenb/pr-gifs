#!/usr/bin/env node
// Records a UI flow with Playwright and encodes it into a GIF for a PR description.
//
//   node <skill-dir>/scripts/record-flow.mjs --flow <file.mjs> --gif <out.gif>
//     [--as <role>]           which entry of the config's `auth` to sign in as
//     [--config <file>]       project config (default: nearest pr-gif.config.mjs,
//                             walking up from the cwd)
//     [--base <url>]          app URL (default: config `baseURL`)
//     [--size 1440x900]       viewport (default: config `viewport`)
//     [--fps 8]               capture rate
//     [--tail-ms 1200]        still footage after the flow returns
//     [--channel chromium]    full headless Chrome (needed to render PDFs)
//     [--out <dir>]           frame directory, wiped first (default: $TMPDIR/pr-frames)
//     [--width 1000]          GIF width (default: config `gif.width`)
//     [--colors 128]          GIF palette size (default: config `gif.colors`)
//     [--reuse-frames]        skip recording; re-encode the frames already in --out
//
// Run it from the directory where @playwright/test, playwright or playwright-core
// is installed — usually the repo root, or the frontend package in a monorepo.
// ffmpeg must be on PATH. Without --gif it stops after writing the PNG frames.
//
// The flow file default-exports `async (page) => {}` and drives the UI with
// ordinary Playwright locators. The recorder signs in (per the config) before
// capture starts, so every GIF opens on the authenticated app, not the login
// form. Frames are captured on a parallel loop, so the flow only has to click and
// `await page.waitForTimeout(...)` where a reviewer needs a beat to read the screen.
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const die = (message) => {
  console.error(message)
  process.exit(1)
}

const arg = (name, dflt) => {
  const i = process.argv.indexOf("--" + name)
  return i === -1 ? dflt : process.argv[i + 1]
}
const flag = (name) => process.argv.includes("--" + name)

const findConfig = () => {
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    const candidate = join(dir, "pr-gif.config.mjs")
    if (existsSync(candidate)) return candidate
    if (dir === dirname(dir)) return null
  }
}
const configPath = arg("config") ? resolve(arg("config")) : findConfig()
const config = configPath ? (await import(pathToFileURL(configPath).href)).default : {}
const configDir = configPath ? dirname(configPath) : process.cwd()
const seeNotes = configPath ? `see the notes at the top of ${configPath}` : "no pr-gif.config.mjs found"

const out = resolve(arg("out", join(tmpdir(), "pr-frames")))
const gifPath = arg("gif") && resolve(arg("gif"))
const fps = Number(arg("fps", "8"))

if (!flag("reuse-frames")) await record()
if (gifPath) encode()

async function record() {
  const flowPath = arg("flow")
  if (!flowPath) {
    die(
      "usage: record-flow.mjs --flow <file.mjs> --gif <out.gif>\n" +
        "  [--as|--config|--base|--size|--fps|--tail-ms|--channel|--out|--width|--colors|--reuse-frames]",
    )
  }

  // Bare specifiers resolve against the importing file, not the cwd — and this
  // file lives in the skill directory, which has no node_modules. So require
  // Playwright off the cwd by hand. It's CJS, hence require and not import:
  // `import()` of @playwright/test exposes no named `chromium`.
  const requireFromCwd = createRequire(join(process.cwd(), "noop.cjs"))
  let playwright
  for (const name of ["@playwright/test", "playwright", "playwright-core"]) {
    try {
      playwright = requireFromCwd(name)
      break
    } catch {}
  }
  if (!playwright) {
    die(
      "cannot resolve @playwright/test, playwright or playwright-core — run this from the directory that installs it",
    )
  }

  const base = arg("base", config.baseURL)
  if (!base) die(`no app URL: pass --base or set baseURL in pr-gif.config.mjs (${seeNotes})`)
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|[^/]*\.local)(:|\/|$)/.test(base)
  if (!isLocal) console.error(`recording ${base} — make sure no real user data is on screen`)

  const [width, height] = arg("size", "")
    ? arg("size").split("x").map(Number)
    : [config.viewport?.width ?? 1440, config.viewport?.height ?? 900]
  const frameMs = 1000 / fps
  const tailMs = Number(arg("tail-ms", "1200"))
  const channel = arg("channel", config.channel ?? "")

  // `auth` is one sign-in method, or a map of roles to methods (the first is the
  // default). A method is a storage-state file, relative to the config, or an
  // async ({ page, context, playwright }) => {} that signs in.
  const auth = config.auth ?? {}
  const methods = typeof auth === "object" ? auth : { default: auth }
  const roles = Object.keys(methods)
  const role = arg("as", roles[0])
  if (role !== undefined && !(role in methods)) {
    die(`--as must be one of ${roles.join(", ")} — got ${role}`)
  }
  const method = methods[role]

  let storageState
  if (typeof method === "string") {
    storageState = resolve(configDir, method)
    if (!existsSync(storageState)) die(`${storageState} is missing — ${seeNotes}`)
  }

  mkdirSync(out, { recursive: true })
  // A previous, longer recording would otherwise leak its tail into this GIF.
  for (const f of readdirSync(out)) if (/^f\d{4}\.png$/.test(f)) unlinkSync(join(out, f))

  // The default headless shell ships no PDF viewer, so a flow that opens a
  // document records an empty frame. `--channel chromium` uses full headless
  // Chrome, which renders one.
  const browser = await playwright.chromium.launch(channel ? { channel } : {})
  const context = await browser.newContext({
    baseURL: base,
    viewport: { width, height },
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
    ...(storageState && { storageState }),
  })
  // A synthetic cursor: headless screenshots have no pointer, and a GIF where
  // menus open with nothing touching them is unreadable.
  await context.addInitScript((color) => {
    const paint = () => {
      if (document.getElementById("__prgif_cursor")) return
      const dot = document.createElement("div")
      dot.id = "__prgif_cursor"
      dot.style.cssText =
        "position:fixed;z-index:2147483647;width:18px;height:18px;margin:-9px 0 0 -9px;" +
        `border-radius:50%;background:color-mix(in srgb, ${color} 30%, transparent);` +
        `border:2px solid ${color};pointer-events:none;transition:transform .08s linear;` +
        "left:-40px;top:-40px"
      document.body.appendChild(dot)
      addEventListener("mousemove", (e) => {
        dot.style.left = e.clientX + "px"
        dot.style.top = e.clientY + "px"
      })
      addEventListener("mousedown", () => (dot.style.transform = "scale(.6)"))
      addEventListener("mouseup", () => (dot.style.transform = "scale(1)"))
    }
    if (document.body) paint()
    else addEventListener("DOMContentLoaded", paint)
  }, config.cursorColor ?? "#5856ff")

  const page = await context.newPage()

  // Sign in before any frames are captured — every GIF opening on the same login
  // form is noise.
  if (typeof method === "function") {
    try {
      await method({ page, context, playwright })
    } catch (error) {
      await browser.close()
      die(`signing in as ${role} failed: ${error.message}\n${seeNotes}`)
    }
  }

  const { default: flow } = await import(pathToFileURL(resolve(flowPath)).href)

  let frame = 0
  let capturing = true
  const capture = (async () => {
    while (capturing) {
      const next = Date.now() + frameMs
      try {
        const png = await page.screenshot({ type: "png", animations: "allow" })
        writeFileSync(join(out, `f${String(++frame).padStart(4, "0")}.png`), png)
      } catch {
        // Mid-navigation screenshots throw; dropping the frame is fine at 8 fps.
      }
      const wait = next - Date.now()
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    }
  })()

  let failure
  try {
    await flow(page)
    await page.waitForTimeout(tailMs)
  } catch (error) {
    failure = error
  } finally {
    capturing = false
    await capture
    await browser.close()
  }

  if (failure) die(`flow failed after ${frame} frames: ${failure.message}`)
  console.error(`recorded ${frame} frames in ${out}`)
}

function encode() {
  if (!readdirSync(out).some((f) => /^f\d{4}\.png$/.test(f))) die(`no frames in ${out}`)
  // Dense desktop layouts need ~1000 px; below ~900 table text stops being readable.
  const width = Number(arg("width", config.gif?.width ?? 1000))
  const colors = Number(arg("colors", config.gif?.colors ?? 128))
  const filter =
    `scale=${width}:-1:flags=lanczos,split[s0][s1];` +
    `[s0]palettegen=max_colors=${colors}[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4`
  const ffmpeg = spawnSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", join(out, "f%04d.png"), "-vf", filter, gifPath],
    { stdio: "inherit" },
  )
  if (ffmpeg.error) die(`cannot run ffmpeg (${ffmpeg.error.code}) — install it, e.g. \`brew install ffmpeg\``)
  if (ffmpeg.status !== 0) die("ffmpeg failed")

  const mb = statSync(gifPath).size / 1024 / 1024
  console.error(`wrote ${gifPath} (${mb.toFixed(1)} MB, ${width}px, ${colors} colors)`)
  if (mb > 5) {
    console.error(
      "over 5 MB — trim the flow, or re-encode smaller: --reuse-frames --colors 64, or --width 860",
    )
  }
}
