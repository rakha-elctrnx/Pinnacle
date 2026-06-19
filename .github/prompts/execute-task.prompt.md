---
name: "Execute Task"
description: "Execute an existing .ai task or bug by ID (for example: task-003 or bug-002) using the dev delivery workflow."
argument-hint: "Enter work item ID only, for example: task-003 or bug-002"
agent: "agent"
model: "GPT-5 (copilot)"
---

Execute implementation for the provided work item ID using the dev workflow.

Use the workflow in [Dev Delivery](../skills/dev/SKILL.md).

Input format:
- The input is a short ID only, such as `task-003` or `bug-002`.

Resolution rules:
- Resolve the ID to exactly one file in `tasks/` with filename prefix match:
  - `task-003` -> `tasks/task-003-*.md`
  - `bug-002` -> `tasks/bug-002-*.md`
- If more than one file matches, stop and ask which file to use.
- If no file matches, stop and report that the work item was not found.

Execution requirements:
- Treat the resolved `tasks/` file as the primary execution scope.
- Read related decision context in `docs/decisions/` before implementation when behavior is ambiguous.
- Implement code changes with minimal safe scope aligned to acceptance criteria.
- Update the same `tasks/` work-item file after each small milestone using canonical status labels from `tasks/README.md` (`todo`, `in-progress`, `blocked`, `needs-follow-up`, `done`).
- Record validation evidence (commands/checks and outcomes) in the work-item file.
- If new defects are found:
  - Update existing linked bug when root cause is the same.
  - Create a new bug only for distinct root cause and link it from the work item.
- Produce QA-ready handoff notes and residual risks before closing execution.

Output expectations:
- Real code and work-item updates, not analysis-only output.
- Keep delivery traceable in `tasks/` with milestone progress and validation evidence.