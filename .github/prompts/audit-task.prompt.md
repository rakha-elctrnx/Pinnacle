---
name: "Audit Task"
description: "Run QA handoff checklist, pre-done auto audit, DoD verification, and final status decision for an existing .ai task/bug by ID."
argument-hint: "Enter work item ID only, for example: task-003 or bug-002"
agent: "agent"
model: "GPT-5 (copilot)"
---

Run QA finalization workflow for the provided work item ID.

Use these references:
- [Dev Delivery](../skills/dev/SKILL.md)
- [Milestone Progress Log Template](../../tasks/templates/milestone-progress-log-template.md)
- [Pre-Done Auto Audit Checklist](../../tasks/templates/pre-done-auto-audit-checklist.md)
- [Taskboard PM QA](../skills/qa/SKILL.md)
- [Canonical Status Model and Definition Of Done](../../tasks/README.md)

Input format:
- The input is a short ID only, such as `task-003` or `bug-002`.

Resolution rules:
- Resolve the ID to exactly one file in `tasks/` with filename prefix match:
  - `task-003` -> `tasks/task-003-*.md`
  - `bug-002` -> `tasks/bug-002-*.md`
- If more than one file matches, stop and ask which file to use.
- If no file matches, stop and report that the work item was not found.

Requirements:
- Read the target task or bug file and summarize the latest implementation state.
- Verify milestone updates exist and follow the template fields.
- Generate a QA checklist with clear pass/fail checks mapped to acceptance criteria.
- Include regression checks for nearby impacted flows.
- Include evidence summary: commands/checks run and outcomes.
- Include known risks, deferred items, and explicit out-of-scope notes.
- If validation is incomplete, mark handoff as partial and list what is still unverified.
- Enforce canonical status labels only: `todo`, `in-progress`, `blocked`, `needs-follow-up`, `done`.
- Run the pre-done auto-audit checklist and include the checklist outcome in the handoff section.
- If any audit check fails, recommend `blocked` or `needs-follow-up` instead of `done`.
- Update the same `tasks/` work item with a dedicated "QA Handoff" section.

Output must be an updated `tasks/` file ready for QA execution, not only a chat summary.