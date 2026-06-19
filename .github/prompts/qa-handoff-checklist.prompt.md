---
name: "QA Handoff Checklist"
description: "Generate a standard QA verification section for a .ai work item, ready for QA review."
argument-hint: "Enter work item ID (e.g. task-003 or bug-002)"
---

Generate a QA handoff section for the provided work item.

Use the workflow in [Taskboard PM QA](../skills/qa/SKILL.md) and the [Pre-Done Auto-Audit Checklist](../../tasks/templates/pre-done-auto-audit-checklist.md).

## Steps

1. Read the target `tasks/` task or bug file.
2. Read the milestone progress log for implementation summary.
3. Run the pre-done auto-audit checklist.
4. Append a `## QA Handoff` section to the work item containing:

### QA Handoff Section Structure

```markdown
## QA Handoff

- **Implementation summary:** <1–2 sentences>
- **Files changed:** <list of touched files>
- **Validation evidence:**
  - `pnpm typecheck`: pass/fail
  - `pnpm lint`: pass/fail
  - Tests / behavior checks: <outcome>
  - Rust build (if applicable): pass/fail
- **Acceptance criteria verification:**
  - [ ] Criterion 1: verified / unverified (reason)
  - [ ] Criterion 2: verified / unverified (reason)
- **Regression checks:** <nearby flows tested and outcomes>
- **Known risks:** <residual risks or "none">
- **Deferred / out-of-scope:** <items or "none">
- **Suggested QA focus:** <where QA should look hardest>
- **Audit outcome:** pass / partial-pass / fail
- **Recommended status:** done / needs-follow-up / blocked
```

Output must be an appended section inside the `tasks/` work-item file, not just chat output.
