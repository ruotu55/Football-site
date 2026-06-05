# Football Channel — working rules for Claude

## THE DOCUMENTATION RULE (always apply)

There is a living system documentation set at **`.Storage/docs/`**. It describes where everything lives and how each subsystem works.

**Before starting any task:**
1. Open [`.Storage/docs/INDEX.md`](.Storage/docs/INDEX.md) — it maps every topic to its doc file.
2. Read the topic file(s) relevant to the task **before** searching the code. The docs tell you which files/functions to touch and where data is stored, so you work faster and in the right place.

**After working on anything:**
3. If you changed, discovered, or fixed something that is **new or not already in the docs**, update the relevant topic file in `.Storage/docs/` (and add a line to `INDEX.md` if it's a brand-new topic). One subsystem = one doc file.
4. If you find the docs are **wrong or stale**, fix them — they must stay trustworthy. Prefer file paths + function names + concepts over line numbers (line numbers drift).

This rule is not optional. The docs only stay useful if every task both **reads** them first and **writes back** what's new.

## Other standing rules (from the user)

- **Respect the requested runner folder.** Only edit the runner the user names; do not mirror edits across the other runners unless asked.
- **`.bat` files must be CRLF.** The Write tool emits LF; cmd.exe fails silently inside `if (...)` blocks. Convert to CRLF after any `.bat` write/edit.
- **No fabricated channel content** in generated copy — only reference series/playlists that actually exist (the real quiz runners).
- **Do not use the Chrome DevTools MCP** — diagnose UI by reading source files instead.
- Dev server has live-reload; prefer **one `Write` per file** over many small edits to avoid stalling the page. Bump `?v=` tokens when JS/CSS edits don't appear (see the cache-busting note in the runner-architecture doc).

## Note on the two knowledge stores

- **`.Storage/docs/`** = shared, repo-committed system documentation (this rule). Architecture, locations, how things work.
- Claude's private cross-session **memory** (`MEMORY.md` + memory files) = bug-fix history, user preferences, and gotchas. Keep using it for those; use `.Storage/docs/` for the durable system map.
