---
name: recording-pr-gifs
description: Use when opening or updating a pull request that visibly changes a web app's UI, before submitting — the PR description should open with a short GIF of the changed flow so reviewers can see the change without checking out the branch.
---

# Recording PR GIFs

## Overview

A PR that changes anything a user sees opens its description with a ~10–20 s GIF
of the flow it touches. A Playwright recorder signs in, runs a short flow script,
and encodes the frames. The GIF is committed to a non-branch ref
(`refs/pr-media/latest`) and embedded by commit SHA, so it never enters `main`'s
history, never lands in a normal clone, and still renders on private repos.

`$SKILL_DIR` below is the directory this SKILL.md lives in. Write flows and GIFs to
a scratch directory (your scratchpad if you have one, else `mktemp -d`), never
into the repo.

Needs: Node 18+, Playwright installed in the project (`@playwright/test` or
`playwright`, with Chromium downloaded), `ffmpeg`, and `gh` authenticated with
write access to the repo.

## Recipe

**0. Read the project's `pr-gif.config.mjs`** (repo root). Its header is the
project's recording notes: how to bring up the stack, which seeded users exist,
where to run from, what has spoiled recordings before. Follow it.

No config yet? Create one from `$SKILL_DIR/examples/pr-gif.config.mjs`: find the
dev server's port, the e2e suite's auth setup (a storage-state file it writes is
the best sign-in method — it keeps login in one place and survives MFA), and
where Playwright is installed. Write what you learn into the header, and commit it
with the PR.

**1. Bring up the stack** as the config's header says. Local only.

**2. Write the flow.** A file that default-exports `async (page) => {}`, driving
the UI with ordinary Playwright locators — steal them from the matching e2e spec.
The recorder has already signed in, so start at the page the PR changes. Put
`waitForTimeout` where a reviewer needs a beat to read the screen: the GIF is the
only thing they see. Shape: `$SKILL_DIR/examples/flow.mjs`.

**3. Record and encode**, from the directory where Playwright is installed:

```bash
node $SKILL_DIR/scripts/record-flow.mjs --flow <scratch>/flow.mjs --gif <scratch>/<slug>.gif
```

`--as <role>` picks a sign-in from the config's `auth` (record the change from the
seat that sees it). Also `--base`, `--size 1440x900`, `--fps`, `--tail-ms`,
`--channel chromium` (needed when the flow shows a PDF), `--width`, `--colors`.
A synthetic cursor is drawn into the page so clicks are legible.

**Look at the GIF before publishing** — extract a few frames with ffmpeg and view
them. A recording that landed on a login page or an empty screen is worse than
none. Over ~5 MB, trim the flow or re-encode without re-recording:
`--reuse-frames --colors 64` or `--width 860`.

**4. Publish** it to the media ref, from inside the repo:

```bash
$SKILL_DIR/scripts/publish-gif.sh <scratch>/<slug>.gif --alt "<what the flow shows>"
```

It prints the Markdown image line, anchored on the new commit's SHA.

**5. Embed at the top of the PR description:**

```markdown
## Preview

![<what the flow shows>](https://github.com/<owner>/<repo>/blob/<commit-sha>/media/<slug>.gif?raw=true)
```

If the PR already exists (`gh pr list --head <branch>`), `gh pr edit <n>
--body-file …` to put the preview on top, keeping the rest of the body. Stop the
dev servers you started.

## Common mistakes

| Mistake | Reality |
|---|---|
| Embedding `raw.githubusercontent.com/...` | That host has no session, so it 404s for everyone on a private repo. Use the `github.com/.../blob/...?raw=true` form `publish-gif.sh` prints: GitHub serves it to anyone who can read the repo. |
| Embedding `blob/<branch-name>/…` instead of the commit SHA | Branch names are mutable and deletable, so the URL dies with them and every PR that embedded it breaks at once. A SHA is immutable. A blob URL can't take an arbitrary ref either, so `blob/refs/pr-media/latest/…` never resolves — the ref only keeps the commits reachable. |
| Putting the GIF on a *branch* | Every push raises a "Compare & pull request" banner that is one click from merging all media into `main`. The `refs/pr-media/latest` ref is not a branch. |
| Resetting the ref to a parentless commit | It orphans the older commits, and GIFs in older PR descriptions break once GitHub collects them. `publish-gif.sh` always chains onto the previous tip. |
| Uploading to an external host or a gist | Both render only if world-readable — GitHub's image proxy can't authenticate — which puts unreleased product screens on the public internet. A repo blob stays inside the repo's auth boundary. |
| Committing the GIF to the PR branch | It lands in `main`'s history forever and bloats every clone. |
| Signing in inside the flow | The recorder signs in before capture; a login sequence in the flow burns the first seconds of every GIF on the same form. |
| Reimplementing a login the e2e suite already does | It drifts. Point the config's `auth` at the storage state the setup project writes. |
| A stale storage state | Sessions die with database resets. If the recording lands on the login page, re-run the e2e auth setup. |
| A GIF of a static screen | Reviewers want the *interaction*: the menu opening, the row expanding, the toast landing. If it is one screenshot's worth, attach a PNG instead. |
| Recording against production or a remote database | Never — real user data would end up in a GIF. Local stack with seeded data only. |
