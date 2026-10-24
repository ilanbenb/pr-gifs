// pr-gif.config.mjs — project settings for the recording-pr-gifs skill.
// Copy this to the repo root and commit it.
//
// The agent reads this header before every recording, so write the project's
// recording notes here: how to bring up the stack, which seeded users exist, and
// anything that has spoiled a recording before.
//
// Stack (all required):
//   supabase start                         # API on 54321
//   bunx playwright test --project=setup   # writes playwright/.auth/admin.json
//   bun dev &                              # port 5173
//
// Run the recorder from the repo root — that's where @playwright/test resolves.
// Steal locators from the matching spec in e2e/.
//
// Gotchas:
//   - The setup project's session dies with `supabase db reset`. If a recording
//     lands on /login, re-run the setup project.
//   - Local stack only: a remote database would put real user data in a GIF.
export default {
  // Where the dev server listens. --base overrides it.
  baseURL: "http://localhost:5173",
  viewport: { width: 1440, height: 900 },

  // How the recorder signs in before capture. Each key is a role for --as; the
  // first is the default. A value is either
  //   - a Playwright storage-state file, relative to this config — e.g. the one
  //     your e2e setup project writes. Keeps login in one place and works with MFA.
  //   - an async ({ page, context, playwright }) => {} that signs in.
  // Omit `auth` if the app needs no login.
  auth: {
    admin: "playwright/.auth/admin.json",
    member: async ({ page }) => {
      await page.goto("/login")
      await page.getByLabel("Email").fill("member@local.test")
      await page.getByLabel("Password").fill("member@local.test")
      await page.getByRole("button", { name: "Sign in" }).click()
      await page.waitForURL((url) => !url.pathname.startsWith("/login"))
    },
  },

  // GIF encoding. Dense desktop layouts need ~1000 px; below ~900 table text
  // stops being readable.
  gif: { width: 1000, colors: 128 },

  // The synthetic cursor, so clicks are legible. Any CSS color.
  cursorColor: "#5856ff",

  // "chromium" for full headless Chrome, which renders PDFs; the default headless
  // shell records an empty frame where a PDF should be. --channel overrides it.
  // channel: "chromium",
}
