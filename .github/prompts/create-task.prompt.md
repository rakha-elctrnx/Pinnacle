---
name: "Create Task"
description: "Create a new .ai task or bug from a feature request, bug report, or attached ADR file."
argument-hint: "Describe a new feature/bug, or provide ADR path/attachment to derive the work item"
agent: "agent"
model: "GPT-5 (copilot)"
---

Create a new work item in `.ai/` from the provided input.

Use the workflow in [Taskboard PM QA](../skills/qa/SKILL.md).

Accepted input:
- Plain description of a new feature or improvement.
- Plain description of a new bug, regression, or failed behavior.
- An ADR reference (path or attached file), then derive the implementation work item from that ADR.

Classification rules:
- If input describes incorrect behavior, failure, regression, or defect, create a bug file.
- Otherwise create a task file.
- If ADR is provided:
	- Create a task by default from ADR implementation scope.
	- Create a bug only when the ADR explicitly addresses a defect/regression.

File naming and ID rules:
- Follow `.ai/README.md` canonical naming:
	- `task-NNN-short-title.md`
	- `bug-NNN-short-title.md`
- Determine the next `NNN` by scanning existing `.ai/task-*.md` or `.ai/bug-*.md` and incrementing the highest existing 3-digit number.
- Do not reuse an existing ID.

De-duplication rules:
- Read existing `.ai/task-*.md` and `.ai/bug-*.md` before creating a new file.
- If an existing work item already matches the same scope/root cause, update that file instead of creating a duplicate.

Content requirements:
- Start from canonical templates:
	- [Task template](../skills/qa/assets/task-template.md)
	- [Bug template](../skills/qa/assets/bug-template.md)
- Enforce canonical status labels from `.ai/README.md` only: `todo`, `in-progress`, `blocked`, `needs-follow-up`, `done`.
- Fill objective/summary, scope or impact, acceptance criteria or reproduction, risks/dependencies, and next action.
- Link relevant ADR/workflow review under related decisions section when available.
- If input is too vague to produce testable acceptance criteria or reproducible bug steps, ask for missing details before finalizing.

Output expectations:
- Produce or update the actual `.ai/task-*.md` or `.ai/bug-*.md` file, not analysis-only chat.
- Keep the work item QA-ready and aligned with Definition Of Done in `.ai/README.md`.
