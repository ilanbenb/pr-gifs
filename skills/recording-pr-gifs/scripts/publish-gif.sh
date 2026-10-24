#!/usr/bin/env bash
# Commits a GIF to the repo's refs/pr-media/latest ref and prints the Markdown that
# embeds it in a PR description.
#
#   publish-gif.sh <file.gif> [--alt "what the flow shows"] [--repo owner/name]
#
# The repo defaults to the one `gh` sees from the cwd. The GIF lands at
# media/<file name> in a new commit chained onto the ref's previous one, so every
# GIF ever published stays reachable and older PR descriptions keep rendering.
# The ref is not a branch: it raises no "Compare & pull request" banner, and
# `git clone` never fetches it.
set -euo pipefail

usage() { echo "usage: publish-gif.sh <file.gif> [--alt <text>] [--repo owner/name]" >&2; exit 1; }

[ $# -ge 1 ] || usage
gif=$1
shift
alt=""
repo=""
while [ $# -gt 0 ]; do
  case $1 in
    --alt) alt=$2; shift 2 ;;
    --repo) repo=$2; shift 2 ;;
    *) usage ;;
  esac
done

[ -f "$gif" ] || { echo "no such file: $gif" >&2; exit 1; }
repo=${repo:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}
name=$(basename "$gif")
alt=${alt:-${name%.*}}

blob=$({ printf '{"encoding":"base64","content":"'; base64 < "$gif" | tr -d '\n'; printf '"}'; } \
  | gh api -X POST "repos/$repo/git/blobs" --input - --jq .sha)

tree_entry=(-f "tree[][path]=media/$name" -f 'tree[][mode]=100644' -f 'tree[][type]=blob' -f "tree[][sha]=$blob")

if prev=$(gh api "repos/$repo/git/ref/pr-media/latest" --jq .object.sha 2>/dev/null); then
  # base_tree keeps every earlier GIF in the tree; parents[] keeps every earlier
  # commit reachable, so GitHub never garbage-collects one that a PR embeds.
  tree=$(gh api -X POST "repos/$repo/git/trees" -f "base_tree=$prev" "${tree_entry[@]}" --jq .sha)
  commit=$(gh api -X POST "repos/$repo/git/commits" -f "message=PR GIF: $name" \
    -f "tree=$tree" -f "parents[]=$prev" --jq .sha)
  # Not forced: if someone else published in between, this is no longer a
  # fast-forward and fails instead of orphaning their commit. Just re-run.
  gh api -X PATCH "repos/$repo/git/refs/pr-media/latest" -f "sha=$commit" --silent \
    || { echo "the ref moved while publishing — re-run to chain onto the new tip" >&2; exit 1; }
else
  # First GIF in this repo — unless the lookup failed for another reason, in which
  # case creating the ref fails below with that reason.
  tree=$(gh api -X POST "repos/$repo/git/trees" "${tree_entry[@]}" --jq .sha)
  commit=$(gh api -X POST "repos/$repo/git/commits" -f "message=PR GIF: $name" -f "tree=$tree" --jq .sha)
  gh api -X POST "repos/$repo/git/refs" -f ref=refs/pr-media/latest -f "sha=$commit" --silent
fi

# Anchored on the commit SHA: a blob URL takes a branch, tag or commit but not an
# arbitrary ref, and a SHA never moves. `?raw=true` on github.com (not
# raw.githubusercontent.com) is served to anyone who can read the repo, private
# repos included.
echo "![$alt](https://github.com/$repo/blob/$commit/media/$name?raw=true)"
