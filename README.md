# pr-gifs

An agent skill that opens every UI pull request with a GIF of the change, so
reviewers see the new flow without checking out the branch.

![Recording of the example flow: three todos added and the first one checked off](docs/demo.gif)

The agent writes a short Playwright flow for what the PR changes, records it with
a visible cursor, encodes a small palette GIF, commits it to a hidden ref in your
repo, and puts it at the top of the PR description. It works on private repos,
and no GIF ever reaches `main` or anyone's clone.

## Install

```bash
npx skills add ilanbenb/pr-gifs
```

That installs the `recording-pr-gifs` skill for Claude Code (into
`.claude/skills/`), Codex, Cursor and the other agents
[skills](https://skills.sh) supports. Add `-g` to install it for every project.
Update later with `npx skills update`.

You need Node 18+, Playwright in the project (or just `playwright-core` plus your
installed Chrome), `ffmpeg`, and the [GitHub CLI](https://cli.github.com) signed
in with write access.

## Per-project config

Each project gets a `pr-gif.config.mjs` at its root. The agent creates one the first
time if it's missing. Start from
[`examples/pr-gif.config.mjs`](skills/recording-pr-gifs/examples/pr-gif.config.mjs):

```js
// Stack:
//   supabase start
//   bunx playwright test --project=setup   # writes playwright/.auth/admin.json
//   bun dev &                              # port 5173
export default {
  baseURL: "http://localhost:5173",
  viewport: { width: 1440, height: 900 },
  auth: {
    admin: "playwright/.auth/admin.json", // a storage state your e2e setup writes
    member: async ({ page }) => {
      /* or sign in by hand */
    },
  },
  gif: { width: 1000, colors: 128 },
  cursorColor: "#5856ff",
}
```

The header comment matters as much as the settings. The agent reads it before
every recording, so it's where the project's notes go: how to start the stack,
which seeded users exist, and anything that has spoiled a recording before.

## How the GIF is hosted

`publish-gif.sh` commits the GIF to `refs/pr-media/latest` through the GitHub API
and prints an image link anchored on that commit's SHA:

```
https://github.com/<owner>/<repo>/blob/<sha>/media/<slug>.gif?raw=true
```

- **Not a branch.** A branch raises a "Compare & pull request" banner on every
  push, one click from merging every GIF into `main`. A custom ref shows up
  nowhere in the UI, and `git clone` never fetches it.
- **Chained commits.** Each publish adds a commit on top of the last one, so every
  GIF any PR has ever embedded stays reachable and is never garbage-collected.
- **Anchored on a SHA.** Branch names move and get deleted; a SHA doesn't.
- **Private repos work.** `github.com/.../blob/...?raw=true` is served to anyone
  who can read the repo. `raw.githubusercontent.com` and external image hosts
  either 404 on private repos or put unreleased screens on the public internet.

## Using the scripts by hand

```bash
node skills/recording-pr-gifs/scripts/record-flow.mjs \
  --flow skills/recording-pr-gifs/examples/flow.mjs \
  --base https://demo.playwright.dev --gif /tmp/todomvc.gif

skills/recording-pr-gifs/scripts/publish-gif.sh /tmp/todomvc.gif --alt "TodoMVC"
```

Run `record-flow.mjs` from the directory where Playwright is installed. See the
header of each script for every flag.

## License

[MIT](LICENSE)
