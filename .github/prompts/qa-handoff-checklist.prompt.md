---
name: "QA Handoff Checklist"
description: "Prepare a QA-ready handoff from task or bug execution. Use when implementation is complete per milestone and you need structured QA verification checks, evidence, risks, and follow-up notes."
argument-hint: "Which .ai task or bug file should be prepared for QA handoff?"
agent: "agent"
model: "GPT-5 (copilot)"
---

Prepare a QA handoff package for the specified work item in `.ai/`.

Use these references:
- [Dev Delivery](../skills/dev/SKILL.md)
- [Milestone Progress Log Template](../../.ai/templates/milestone-progress-log-template.md)
- [Pre-Done Auto Audit Checklist](../../.ai/templates/pre-done-auto-audit-checklist.md)
- [Taskboard PM QA](../skills/qa/SKILL.md)
- [Canonical Status Model and Definition Of Done](../../.ai/README.md)

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
- Update the same `.ai/` work item with a dedicated "QA Handoff" section.

Output must be an updated `.ai/` file ready for QA execution, not only a chat summary.
