# Footbal channel

Dual-site football quiz workspace with two independent web runners:

- `Main Runner - Career Path`
- `Main Runner - Lineups`

## Project policy
- Keep both sites runnable independently.
- Do not create runtime imports between the two site folders.
- If a shared improvement applies to both, implement it in both folders.
- Preserve 100% existing UI and behavior unless explicitly requested otherwise.

## Run either site
From PowerShell:

```powershell
& "c:\Users\Rom\Desktop\Footbal channel\Main Runner - Career Path\run_site.bat" --no-browser
& "c:\Users\Rom\Desktop\Footbal channel\Main Runner - Lineups\run_site.bat" --no-browser
```

Then open the printed local URL in the browser.

## Structure
- `Main Runner - Career Path/`: career-path quiz runner.
- `Main Runner - Lineups/`: lineup/national-team quiz runner.
- Shared external data expected at `../data` from each site runtime context.

## Agent context files
- `.cursor/rules/`: always-apply rules for independence + zero-regression.
- `.cursor/skills/main-runner-maintainer/SKILL.md`: maintenance playbook for agents.
- `ARCHITECTURE.md` inside each site: runtime dependency map and safe-edit boundaries.
