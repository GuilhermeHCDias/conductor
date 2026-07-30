#!/usr/bin/env bash
# octo-worktree — one git worktree per spec, keyed by the spec's slug.
#
# The flow this serves, and nothing more:
#   1. octo-specify runs `create <type>/<slug>` and writes the spec at the
#      `spec=` path printed — the spec is born inside its worktree, never in
#      the main tree.
#   2. octo-implement runs `resolve [<slug>]` and works inside the `worktree=`
#      it gets back (via `git -C` / absolute paths — nobody ever cds).
#
# The binding is structural, so nothing is stored and nothing can go stale:
# branch is `<type>/<slug>` (types per octo-specify's
# references/branch-naming.md), tree is <repo>-worktrees/<slug>, spec is
# <tree>/specs/<slug>.md. slug -> tree and tree -> slug are plain git lookups.
#
# Output: KEY=VALUE lines on stdout (`list`: TSV). Chatter on stderr.
# Exit codes: 0 ok, 1 usage, 2 not found, 3 refused (dirty / ambiguous).
#
# Usage:
#   octo-worktree.sh create <type>/<slug> [--base <ref>]
#   octo-worktree.sh resolve [<slug>]
#   octo-worktree.sh list [--todo]
#   octo-worktree.sh remove <slug> [--force] [--delete-branch]
#
# Env: OCTO_WORKTREE_DIR overrides where trees live (default: a sibling
#      <repo>-worktrees/ directory next to the main checkout).

set -euo pipefail

TYPES="feat fix refactor perf test docs build ci chore style revert"

say()  { printf '%s\n' "$*" >&2; }
die()  { printf 'error: %s\n' "$1" >&2; exit "${2:-1}"; }
emit() { printf '%s=%s\n' "$1" "$2"; }

# Main repo root from anywhere: git-common-dir points every linked worktree
# back at the original .git, so this works inside a worktree too.
resolve_repo() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
    || die "not inside a git repository"
  MAIN_ROOT=$(cd "$(git rev-parse --git-common-dir)/.." && pwd)
  WT_HOME="${OCTO_WORKTREE_DIR:-${MAIN_ROOT%/*}/${MAIN_ROOT##*/}-worktrees}"
}

# LC_ALL=C is load-bearing: under most locales [a-z] collates as aAbB… and an
# uppercase slug would slip through — then collide on a case-insensitive
# filesystem while git keeps two distinct branches.
slug_ok() {
  local LC_ALL=C
  case "$1" in ''|*[!a-z0-9-]*|-*|*-) return 1 ;; *) return 0 ;; esac
}

type_ok() { local t; for t in $TYPES; do [ "$1" = "$t" ] && return 0; done; return 1; }

# branch -> slug, iff its prefix is a known type; fails on main and ad-hoc branches
slug_of() {
  local t
  for t in $TYPES; do case "$1" in "$t"/*) printf '%s' "${1#*/}"; return 0 ;; esac; done
  return 1
}

spec_in() { printf '%s/specs/%s.md' "$1" "$2"; }

mtime() { stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || echo 0; }

# `status:` from the header block only, so a mention in prose can't fake it.
spec_status() {
  [ -f "$1" ] || { echo "-"; return; }
  awk 'NR<=20 && sub(/^status:[[:space:]]*/,"") { print; f=1; exit } END { if (!f) print "-" }' "$1"
}

# Checked-out trees whose branch slug matches: "branch<TAB>path" per line.
# Prints 0..n lines and always returns 0 — these run inside $(...), where a die
# would kill only the subshell and the caller would sail on; callers count
# lines instead.
trees_for_slug() {
  local line path="" b s
  while IFS= read -r line; do
    case "$line" in
      'worktree '*) path=${line#worktree } ;;
      'branch '*)
        b=${line#branch refs/heads/}
        if s=$(slug_of "$b") && [ "$s" = "$1" ]; then printf '%s\t%s\n' "$b" "$path"; fi ;;
    esac
  done < <(git -C "$MAIN_ROOT" worktree list --porcelain)
  return 0
}

# Branches (checked out or not) whose slug matches — for reattaching a branch
# whose tree was removed.
branches_for_slug() {
  local b s
  while IFS= read -r b; do
    if s=$(slug_of "$b") && [ "$s" = "$1" ]; then printf '%s\n' "$b"; fi
  done < <(git -C "$MAIN_ROOT" for-each-ref --format='%(refname:short)' refs/heads)
  return 0
}

# Every spec across every octo tree: "mtime slug status branch path" TSV.
scan() {
  local line path="" b s
  while IFS= read -r line; do
    case "$line" in
      'worktree '*) path=${line#worktree } ;;
      'branch '*)
        b=${line#branch refs/heads/}
        if s=$(slug_of "$b"); then
          printf '%s\t%s\t%s\t%s\t%s\n' "$(mtime "$(spec_in "$path" "$s")")" \
            "$s" "$(spec_status "$(spec_in "$path" "$s")")" "$b" "$path"
        fi ;;
    esac
  done < <(git -C "$MAIN_ROOT" worktree list --porcelain)
  return 0
}

count() { printf '%s' "$1" | grep -c . || true; }

emit_target() { # slug branch dir
  local spec; spec=$(spec_in "$3" "$1")
  emit slug "$1"; emit branch "$2"; emit worktree "$3"
  emit spec "$spec"; emit status "$(spec_status "$spec")"
}

cmd_create() {
  local arg="" base=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --base) base="${2:-}"; shift 2 ;;
      -*)     die "unknown flag: $1" ;;
      *)      [ -n "$arg" ] && die "unexpected argument: $1"; arg="$1"; shift ;;
    esac
  done
  case "$arg" in
    */*/*) die "keep branches flat: <type>/<slug>" ;;
    */*)   ;;
    *)     die "usage: create <type>/<slug> — types: $TYPES" ;;
  esac
  local type=${arg%%/*} slug=${arg#*/}
  type_ok "$type" || die "'$type' isn't a branch type ($TYPES)"
  slug_ok "$slug" || die "slug must be lowercase kebab-case [a-z0-9-]: got '$slug'"

  resolve_repo
  local branch="$type/$slug" dir="$WT_HOME/$slug" found n
  found=$(trees_for_slug "$slug"); n=$(count "$found")
  [ "$n" -gt 1 ] && die "'$slug' is checked out under more than one type — remove one first" 3
  if [ "$n" = 1 ]; then
    # Idempotent: specify re-run on the same spec reuses the tree, never makes a second one.
    IFS=$'\t' read -r branch dir <<< "$found"
    mkdir -p "$dir/specs"
    emit_target "$slug" "$branch" "$dir"; emit created no
    say "worktree already exists — reusing it"
    return 0
  fi

  [ -e "$dir" ] && die "$dir exists but no octo branch is checked out there — move it or pick another slug" 3
  [ -n "$base" ] || base=$(git -C "$MAIN_ROOT" symbolic-ref --quiet --short HEAD || git -C "$MAIN_ROOT" rev-parse HEAD)
  git -C "$MAIN_ROOT" rev-parse --verify --quiet "$base^{commit}" >/dev/null \
    || die "base ref '$base' doesn't resolve to a commit" 3
  mkdir -p "$WT_HOME"

  found=$(branches_for_slug "$slug"); n=$(count "$found")
  [ "$n" -gt 1 ] && die "several branches match '$slug' ($(printf '%s ' $found)) — delete the ones you don't want" 3
  if [ "$n" = 1 ]; then
    # The tree was removed but its branch survived: reattach, so committed
    # work — the spec included — comes back instead of being orphaned.
    [ "$found" = "$branch" ] || say "note: reusing existing branch $found (asked for $branch)"
    branch=$found
    git -C "$MAIN_ROOT" worktree add "$dir" "$branch" >&2
  else
    git -C "$MAIN_ROOT" worktree add -b "$branch" "$dir" "$base" >&2
  fi
  mkdir -p "$dir/specs"
  emit_target "$slug" "$branch" "$dir"; emit base "$base"; emit created yes
}

# octo-implement's one lookup. With a slug: that spec's tree. Without: the
# newest spec that isn't done, plus candidates=N so the skill knows whether
# "which one?" is worth asking the engineer.
cmd_resolve() {
  local slug="${1:-}" branch dir found n
  resolve_repo
  if [ -n "$slug" ]; then
    slug=${slug#*/}                     # tolerate a full <type>/<slug>
    found=$(trees_for_slug "$slug"); n=$(count "$found")
    [ "$n" = 0 ] && die "no worktree for '$slug' — run: create <type>/$slug" 2
    [ "$n" -gt 1 ] && { say "$found"; die "'$slug' is checked out under more than one type" 3; }
    IFS=$'\t' read -r branch dir <<< "$found"
    [ -d "$dir" ] || die "worktree $dir is gone — run: git worktree prune, then create again" 2
    emit_target "$slug" "$branch" "$dir"
    return 0
  fi

  local rows; rows=$(scan | sort -rn | awk -F'\t' '$3 != "done"')
  [ -n "$rows" ] || die "no open spec in any worktree" 2
  n=$(count "$rows")
  IFS=$'\t' read -r _ slug _ branch dir <<< "$(printf '%s\n' "$rows" | head -1)"
  emit_target "$slug" "$branch" "$dir"; emit candidates "$n"
  if [ "$n" -gt 1 ]; then
    say "$n open specs — resolved to the newest. Others:"
    printf '%s\n' "$rows" | tail -n +2 | awk -F'\t' '{print "  " $2 " (" $3 ")"}' >&2
  fi
  return 0
}

cmd_list() {
  local todo=0; [ "${1:-}" = "--todo" ] && todo=1
  resolve_repo
  scan | sort -rn | while IFS=$'\t' read -r _ slug status branch dir; do
    if [ "$todo" = 1 ] && [ "$status" = done ]; then continue; fi
    printf '%s\t%s\t%s\t%s\t%s\n' "$slug" "$status" "$branch" "$dir" "$(spec_in "$dir" "$slug")"
  done
  return 0
}

cmd_remove() {
  local slug="" force=0 delb=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --force)         force=1; shift ;;
      --delete-branch) delb=1; shift ;;
      -*)              die "unknown flag: $1" ;;
      *)               slug=${1#*/}; shift ;;
    esac
  done
  [ -n "$slug" ] || die "usage: remove <slug> [--force] [--delete-branch]"
  resolve_repo
  local found n branch dir
  found=$(trees_for_slug "$slug"); n=$(count "$found")
  [ "$n" = 0 ] && die "no worktree for '$slug'" 2
  [ "$n" -gt 1 ] && { say "$found"; die "'$slug' matches more than one tree — remove by hand" 3; }
  IFS=$'\t' read -r branch dir <<< "$found"

  # Uncommitted changes may include the spec itself; discarding them is
  # unrecoverable, so it takes an explicit --force.
  if [ "$force" = 0 ] && [ -n "$(git -C "$dir" status --porcelain)" ]; then
    git -C "$dir" status --short >&2
    die "uncommitted changes in $dir — commit them, or pass --force to discard" 3
  fi
  if [ "$force" = 1 ]; then
    git -C "$MAIN_ROOT" worktree remove --force "$dir" >&2
  else
    git -C "$MAIN_ROOT" worktree remove "$dir" >&2
  fi
  emit removed "$dir"
  # The branch keeps the committed spec, so deleting it is never the default.
  if [ "$delb" = 1 ]; then
    git -C "$MAIN_ROOT" branch -D "$branch" >&2; emit branch_deleted "$branch"
  else
    emit branch_kept "$branch"
  fi
}

usage() {
  sed -n '/^# Usage:/,/^$/p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit "${1:-1}"
}

[ $# -gt 0 ] || usage
cmd="$1"; shift
case "$cmd" in
  create)  cmd_create  "$@" ;;
  resolve) cmd_resolve "$@" ;;
  list)    cmd_list    "$@" ;;
  remove)  cmd_remove  "$@" ;;
  -h|--help|help) usage 0 ;;
  *) die "unknown command: $cmd (try --help)" ;;
esac
