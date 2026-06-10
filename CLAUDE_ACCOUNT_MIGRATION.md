# Claude Code — account migration / setup guide

**How to use this file:** Open Claude Code in the new account and say:
> "Read `CLAUDE_ACCOUNT_MIGRATION.md` and set everything up."

Claude should work through the checklist below. Most items are commands to run or a
file to write. Steps marked 🔐 require a human login and can't be automated.

---

## ⚠️ Important context

Almost nothing here is tied to the Claude **account**. Settings, plugins, skills, and
memory live in folders on the PC (`~/.claude/` and inside the repo), not in the login.

- **Same PC, new email:** settings/plugins/skills/memory stay as-is. Only the
  **claude.ai connectors** (Section 5) need re-authorizing. Skip Sections 1–4 unless something is missing.
- **New PC / clean rebuild:** do every section.

---

## 1. Plugins + marketplaces

```
/plugin marketplace add obra/superpowers-marketplace
/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
/plugin marketplace add affaan-m/everything-claude-code
/plugin marketplace add anthropics/claude-plugins-official

/plugin install superpowers@superpowers-marketplace
/plugin install ui-ux-pro-max@ui-ux-pro-max-skill
```

- ✅ **superpowers** (was v5.0.7) — enabled
- ✅ **ui-ux-pro-max** (was v2.5.0) — enabled
- ⚪ **everything-claude-code** (v1.10.0) — marketplace registered but plugin **disabled**. Only install if wanted.

## 2. Standalone skill — Remotion

Not a plugin; installed via the `skills` CLI (run in the terminal at the repo root):

```
npx skills add remotion-dev/skills
```

Installs `remotion-best-practices`. In this repo it ends up symlinked under
`.claude/skills/` from `.agents/skills/`.

## 3. Global settings — write to `~/.claude/settings.json`

(Windows path: `C:\Users\<you>\.claude\settings.json`.) Key personalizations:
a "Claude finished" desktop notification + sound, notif prefs, extra working
directories, and the plugin/marketplace registration.

```json
{
  "preferredNotifChannel": "auto",
  "inputNeededNotifEnabled": true,
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "shell": "powershell",
            "async": true,
            "timeout": 15,
            "command": "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $n=New-Object System.Windows.Forms.NotifyIcon; $n.Icon=[System.Drawing.SystemIcons]::Information; $n.Visible=$true; $n.ShowBalloonTip(6000,'Claude Code','Claude finished - your turn','Info'); [System.Media.SystemSounds]::Asterisk.Play(); Start-Sleep -Seconds 6; $n.Dispose()"
          }
        ]
      }
    ]
  },
  "permissions": {
    "allow": [],
    "additionalDirectories": [
      "C:\\Users\\Rom\\AppData\\Local\\Temp",
      "\\tmp"
    ]
  },
  "enabledPlugins": {
    "superpowers@superpowers-marketplace": true,
    "everything-claude-code@everything-claude-code": false,
    "ui-ux-pro-max@ui-ux-pro-max-skill": true
  },
  "extraKnownMarketplaces": {
    "superpowers-marketplace": { "source": { "source": "git", "url": "https://github.com/obra/superpowers-marketplace.git" } },
    "everything-claude-code": { "source": { "source": "git", "url": "https://github.com/affaan-m/everything-claude-code.git" } },
    "ui-ux-pro-max-skill": { "source": { "source": "git", "url": "https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git" } },
    "claude-plugins-official": { "source": { "source": "git", "url": "https://github.com/anthropics/claude-plugins-official.git" } }
  }
}
```

> **`permissions.allow` is intentionally empty.** The original held ~70 auto-accumulated,
> project-specific one-off commands (grep/sed/PowerShell strings). They rebuild themselves
> as you approve commands — not worth restoring.

## 4. Local MCP servers

```
claude mcp add --scope user pipedream-google-sheets --transport http https://mcp.pipedream.net/v2
```

- **pipedream-google-sheets** — keep.
- **chrome-devtools** — was installed but is **BANNED by preference** (browser-driven UI
  debugging is too slow; diagnose UI by reading source instead). **Do NOT re-add it.**

## 5. 🔐 claude.ai connectors (re-authorize — cannot be scripted)

Account-bound; the new email starts with none. Reconnect whichever you actually use via
the connectors UI / `/mcp` (each needs its own OAuth login). Previously available:

> Context7, Microsoft Learn, Shopify, Spotify, Gmail, Google Calendar, Google Drive,
> Notion, Figma, Canva, Vercel, Zoom, Microsoft 365, Hugging Face, Adobe (Creativity),
> Consensus, Expedia, PubMed.

## 6. Project files (already in this repo — nothing to do)

Travel with git: `CLAUDE.md` (working rules), `.Storage/docs/` (system docs),
`.claude/settings.json` + `.claude/settings.local.json` (project permissions), and the
`..._Remotion` demo project.

## 7. Cross-session memory (copy the folder if changing machines)

89 memory files (~452 KB) of bug-fix history, gotchas, and preferences — **not
account-bound**. If moving to a new PC, copy the whole folder:

```
C:\Users\Rom\.claude\projects\c--Users-Rom-Documents-GitHub-Football-Channel\memory\
```

to the same relative path under the new machine's `~/.claude\projects\...\memory\`.
(The folder name encodes the repo path; keep the repo at the same location, or update
the folder name to match the new path.)

---

## Quick checklist
- [ ] Write `~/.claude/settings.json` (Section 3)
- [ ] Add marketplaces + install superpowers & ui-ux-pro-max (Section 1)
- [ ] `npx skills add remotion-dev/skills` (Section 2)
- [ ] Add pipedream MCP; skip chrome-devtools (Section 4)
- [ ] 🔐 Re-authorize claude.ai connectors you use (Section 5)
- [ ] Ensure repo + `memory/` folder present (Sections 6–7)
