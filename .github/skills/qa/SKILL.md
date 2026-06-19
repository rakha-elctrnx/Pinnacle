---
name: qa
description: 'Project manager and QA workflow for planning, supervising, and reviewing delivered code. Use when managing implementation tasks, logging bugs, enforcing acceptance criteria, linking ADRs or workflow reviews, tracking progress in .ai, and validating code quality before delivery.'
argument-hint: 'What task, bug, or delivery needs supervision?'
user-invocable: true
disable-model-invocation: false
---

# Taskboard PM QA

Use this skill when the work needs PM and QA supervision, not just code generation. The skill treats every implementation request, follow-up change, and bug report as a tracked work item in `tasks/`.

## What This Skill Produces

- A task or bug file in `tasks/`
- A clear execution plan with acceptance criteria
- Code review and QA checks before a task is marked done
- An updated task record with status, findings, and next actions
- Links to relevant ADRs or workflow reviews when analysis already exists

## When to Use

- A new feature, refactor, or bug fix needs to be tracked from request to delivery
- You need QA coverage before considering code complete
- You need a lightweight project manager that keeps work visible in files
- You want implementation tasks and bug notes recorded consistently in `tasks/`

## Required Rules

1. Every new work item must be written as a separate Markdown file inside `tasks/`.
2. Use `task-YYYYMMDD-short-title.md` for implementation work.
3. Use `bug-YYYYMMDD-short-title.md` for defects, regressions, or QA findings.
4. Do not mark a task as `done` until implementation evidence and QA evidence are both recorded.
5. If code changes reveal new defects or blockers, create or update a bug file before closing the parent task.
6. Read `docs/decisions/` before creating a task or bug, and link any relevant ADR or workflow review in the work item.
7. Use the canonical status model from `tasks/README.md` for all task and bug files.
8. Enforce the shared Definition Of Done in `tasks/README.md` before setting status to `done`.

## Procedure

1. Classify the incoming request.
   - If the request is new work, create a task file from [task template](./assets/task-template.md).
   - If the request is a defect or failed validation, create a bug file from [bug template](./assets/bug-template.md).
   - If related work already exists in `tasks/`, update that file instead of creating a duplicate.
   - If a relevant ADR or workflow review already exists in `docs/decisions/`, reference it immediately.

2. Define the delivery target.
   - Write the objective in one sentence.
   - Capture scope, constraints, dependencies, and risks.
   - Write concrete acceptance criteria that can be verified.
   - If no relevant ADR exists and the request still needs product or system analysis, create or request one before implementation proceeds.

3. Plan the execution.
   - Break the work into small steps.
   - Set the initial status to `todo` or `in-progress`.
   - Record assumptions that could invalidate the plan.

4. Supervise implementation.
   - Before editing, identify the closest code path that controls the requested behavior.
   - Prefer the smallest change that tests the current hypothesis.
   - Keep the task file updated when scope, blockers, or findings change.

5. Run QA validation.
   - Execute the narrowest test, build, lint, or behavior check that can falsify the change.
   - Record what was validated, what passed, and what remains unverified.
   - If validation fails, update the task status and create or update a bug file when needed.

6. Review for delivery.
   - Confirm acceptance criteria against actual results.
   - Confirm edge cases, regressions, and obvious follow-up risks were considered.
   - Only then set the final status to `done`, `blocked`, or `needs-follow-up`.

## Entry Criteria

- Incoming request can be turned into a specific deliverable or defect statement.
- Acceptance criteria can be drafted or a decision request is triggered when still ambiguous.

## Exit Criteria

- Work item status is accurate and evidence-backed.
- Definition Of Done checks are explicitly satisfied before `done`.
- Follow-up bugs/tasks are linked when needed.

## Ownership Boundaries

- PM/QA owns work-item lifecycle status and completion judgement.
- Dev owns implementation details and validation execution evidence.
- Analyst owns decision artifacts and direction changes.

## Phase Gates

- If acceptance criteria are ambiguous, require analyst decision support before execution proceeds.
- If validation evidence is missing or failing, do not allow `done`.
- If scope is partially delivered with known residuals, use `needs-follow-up`.

## Decision Rules

- Create a new task file when the request introduces distinct deliverable work.
- Update an existing task file when the work is a continuation of the same deliverable.
- Create a bug file when behavior is incorrect, validation fails, or QA finds a regression.
- Link the bug file from the related task file when the bug blocks completion.
- Link the relevant ADR or workflow review from every task or bug when such analysis exists.
- If execution uncovers a missing product or workflow decision, create or request an ADR or workflow review before treating the scope as stable.
- If the request is too vague to define acceptance criteria, stop and ask for the missing outcome before implementation.

## Completion Checklist

- The task or bug is documented in `tasks/`.
- Status reflects the current state honestly.
- Acceptance criteria are specific and testable.
- Relevant ADRs or workflow reviews are referenced when they exist.
- Code changes, if any, are tied to a validation result.
- Open risks, follow-ups, and blockers are written down.
- Nothing is called complete purely because code was written.

## File Handling Guidance

- Read `tasks/` first to avoid duplicate work items.
- Read `docs/decisions/` before planning implementation work.
- Keep task files concise and append updates instead of rewriting history.
- Use timestamps when helpful for QA notes and handoff clarity.
- Preserve a single source of truth per work item.

## References

- [Task template](./assets/task-template.md)
- [Bug template](./assets/bug-template.md)
- [System analyst workflow](../analyst/SKILL.md)
