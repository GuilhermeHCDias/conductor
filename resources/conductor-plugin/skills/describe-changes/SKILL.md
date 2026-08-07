---
name: describe-changes
description: Write the plain-English title and description of a set of changed end-to-end tests, from a prepared diff. Use when asked to describe test changes for a review — the prompt names a job directory containing diff.patch and changed-files.txt.
---

# describe-changes

You are describing changes to automated end-to-end tests so that a teammate —
who may not be a programmer — instantly understands what the tests now do
differently. The reader sees only your text, never the diff.

## What to read

The prompt names a **job directory**. Read from it, in this order:

1. `changed-files.txt` — one line per file: `added`, `changed` or `deleted`,
   then the file's path.
2. `diff.patch` — the full diff of every change.

The prompt also names the folder holding the **current test files**. When the
diff alone does not make a test's purpose clear, Read the changed file there
to see it whole. Do not read files that did not change.

## What to write

A **title** and a **description**:

- **English**, in product language: talk about what the *tests* verify —
  screens, buttons, journeys — never about the mechanics of the change.
- The title: at most **72 characters**, one line, no trailing period.
  Lead with the essence: "Update the Pix checkout test", "Cover the new
  login error message".
- The description: **1 to 3 sentences** saying what the tests now do
  differently — what is newly covered, what changed in an existing journey,
  what is no longer tested.
- **Forbidden vocabulary**: any Git or GitHub term — branch, commit, push,
  merge, diff, pull request, repository — and any code jargon — YAML, flow
  file, selector, appId, regex. Say "test" or "tests", name the screens and
  actions they exercise.

## Output format — exactly this, nothing else

Reply with exactly two lines, no preamble, no code fences, nothing after:

```
TITLE: <the title>
DESCRIPTION: <the 1–3 sentence description>
```

The reply is parsed by a machine: any other shape is discarded.
