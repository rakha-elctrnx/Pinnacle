---
name: dev
description: 'Senior developer execution workflow for implementing high-quality code from analyst decisions and PM/QA work items. Use when coding from docs/decisions guidance, executing task and bug files in .ai, fixing defects, validating changes, and updating progress status with evidence.'
argument-hint: 'What task or bug should be executed from .ai with which decision context?'
user-invocable: true
disable-model-invocation: false
---

# Dev Delivery

Use this skill when the goal is implementation quality and reliable delivery, not analysis-only planning. The skill treats analyst decisions as the source of direction and PM/QA taskboard files as the source of execution scope.

## What This Skill Produces

- Code changes aligned to decision context in `docs/decisions/`
- Concrete implementation updates for task or bug files in `tasks/`
- Validation evidence for build, test, lint, or behavior checks
- Updated work-item status, progress notes, and remaining risks
- Explicit handoff notes for PM/QA when follow-up is needed

## When to Use

- A decision or workflow review already exists and implementation must follow it
- A PM/QA task in `tasks/` needs coding execution
- A PM/QA bug in `tasks/` needs root-cause fix and verification
- Delivery requires both code quality and honest progress tracking
- You need traceable implementation evidence, not only code output

## Required Rules

1. Read relevant decision files in `docs/decisions/` before writing code.
2. Read the target work item in `tasks/` before implementation and update the same file after each small milestone.
3. Keep scope aligned with the decision and acceptance criteria; do not silently expand scope.
4. Use the smallest safe change that satisfies the required behavior.
5. Record validation evidence (what command/check was run and outcome) before marking progress as complete.
6. If implementation uncovers a new defect with the same root cause, update the existing bug file in `tasks/`; create a new bug file only when it is a distinct root cause, then link it from the parent task.
7. If decision context is missing or contradictory, stop implementation and request analyst clarification.
8. Follow the canonical status model in `tasks/README.md` and do not introduce ad-hoc status labels.
9. Treat PM/QA as owner of final lifecycle state changes; Dev updates status only to reflect current implementation truth.

## Procedure

1. Establish execution context.
   - Locate the target task or bug file in `tasks/`.
   - Locate related decision or workflow review in `docs/decisions/`.
   - Extract objective, constraints, acceptance criteria, and non-goals.

2. Plan the implementation path.
   - Identify the primary code path and likely side effects.
   - Break work into small, testable changes.
   - Note assumptions and unknowns in the work-item progress section.

3. Implement incrementally.
   - Apply minimal, high-confidence code changes first.
   - Preserve existing architecture and conventions unless the decision says otherwise.
   - Add targeted comments only where logic is non-obvious.

4. Validate behavior and quality.
   - Run the narrowest useful checks first, then broader checks if needed.
   - Confirm acceptance criteria against observed results.
   - Check for regressions in related code paths.

5. Update taskboard records.
   - Update the `tasks/` task or bug status using the canonical model (`todo`, `in-progress`, `blocked`, `needs-follow-up`, `done`).
   - Record progress updates at each small milestone, not only at the end.
   - Use [Milestone progress log template](../../../tasks/templates/milestone-progress-log-template.md) for consistent update format.
   - Record implementation summary, validation evidence, and known gaps.
   - Add links to any new bug files or follow-up tasks.

6. Prepare handoff.
   - Summarize what changed, what was verified, and what remains.
   - Use [QA Handoff Checklist prompt](../../prompts/qa-handoff-checklist.prompt.md) to produce a standard QA verification section in the `tasks/` work item.
   - Flag residual risks, deferred work, and suggested QA focus points.

## Decision Rules

- If a task and decision both exist, implement according to the decision and task acceptance criteria.
- If a task exists but no decision exists for ambiguous behavior, pause and request analyst decision support.
- If a bug is reproducible, prioritize root cause and fix verification over broad refactoring.
- If a defect matches an existing bug root cause, update that existing bug record instead of creating a duplicate.
- If a fix risks unrelated modules, split into a safe immediate fix and a follow-up task.
- If validation cannot be run, document exactly what is unverified and keep status out of `done`.

## Entry Criteria

- Target task or bug exists in `tasks/`.
- Related decision context exists for ambiguous behavior, or behavior is already unambiguous.
- Acceptance criteria and scope boundaries are present.

## Exit Criteria

- Implementation notes and validation evidence are recorded in the work item.
- Remaining risks and out-of-scope notes are explicit.
- Work item is ready for QA handoff, or marked blocked with clear blocker details.

## Ownership Boundaries

- Dev owns code changes, implementation notes, and validation evidence.
- PM/QA owns completion judgement and final `done` confirmation.
- Analyst owns direction changes when decision context must be revised.

## Phase Gates

- Pause and escalate to Analyst when acceptance intent is contradictory or undefined.
- Do not move to `done` when QA evidence is incomplete.
- Use `needs-follow-up` when primary scope lands but residual items remain.

## Completion Checklist

- Related decision context from `docs/decisions/` was reviewed.
- Target task or bug file in `tasks/` was updated with current status.
- Code changes are scoped to acceptance criteria and constraints.
- Validation evidence is recorded with pass/fail outcomes.
- New defects discovered during implementation are tracked as linked bugs.
- Remaining risks and follow-up actions are explicitly documented.

## File Handling Guidance

- Prefer updating the existing `tasks/` work item over creating duplicates.
- Keep progress notes chronological and concise.
- Write progress notes per small milestone so PM/QA can follow delivery state continuously.
- Treat `tasks/` as the delivery log and source of truth for status.
- Keep code commit-ready by avoiding unrelated edits.

## References

- [System analyst workflow](../analyst/SKILL.md)
- [PM and QA workflow](../qa/SKILL.md)
- [Milestone progress log template](../../../tasks/templates/milestone-progress-log-template.md)
- [QA handoff checklist prompt](../../prompts/qa-handoff-checklist.prompt.md)
