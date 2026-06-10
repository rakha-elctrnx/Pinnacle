---
name: analyst
description: 'Analyze a system from business flow, technical flow, user comfort, feature scope, workflow review, and future evolution. Use when defining how a product should work, what should be improved next, and when recording ADRs or workflow reviews in .ai/decisions/.'
argument-hint: 'What system, feature area, or decision needs analysis?'
user-invocable: true
disable-model-invocation: false
---

# System Analyst Decisions

Use this skill when the task is not implementation yet, but structured analysis of how a system should behave for users and for the engineering team.

## What This Skill Produces

- A decision record in `.ai/decisions/`
- A lighter workflow review record when a full ADR would be disproportionate
- A clear statement of the business flow and technical flow being recommended
- Notes on user comfort, risks, tradeoffs, and implementation implications
- A list of feature gaps, follow-up opportunities, and future development directions

## When to Use

- A feature, workflow, or product area needs analysis before coding starts
- You need to define how the user journey should work end to end
- You need to decide how business rules and technical architecture should align
- You need a written recommendation for future features, refactors, or product improvements
- The team needs a durable decision file instead of scattered chat conclusions

## Entry Criteria

- The request still needs product/workflow/system direction.
- Acceptance criteria cannot be finalized safely without analysis.
- Scope boundaries, user journey, or system behavior are still ambiguous.

## Exit Criteria

- Decision question is answered with a recommended target flow.
- Tradeoffs, assumptions, and risks are explicit.
- Decision output is saved in `.ai/decisions/` and ready to drive a task or bug.

## Required Rules

1. Read `.ai/decisions/` first and update an existing decision if the same problem is already being analyzed.
2. Write each new analysis as `adr-YYYYMMDD-short-title.md` in `.ai/decisions/`.
3. Use `workflow-review-YYYYMMDD-short-title.md` in `.ai/decisions/` when the need is a lightweight review rather than a durable architectural or product decision.
4. Distinguish clearly between current-state observations, recommended decisions, and future ideas.
5. Every decision must cover both user impact and technical impact.
6. Do not recommend a flow only because it is technically easy; justify why it is better for users and operations.
7. If essential context is missing, state assumptions explicitly and mark them for confirmation.

## Procedure

1. Define the analysis target.
   - Name the system, module, workflow, or feature area.
   - State the decision question in one sentence.
   - Capture the trigger: user pain, business need, technical constraint, or roadmap planning.

2. Map the current state.
   - Describe the current business flow as users and operators experience it.
   - Describe the current technical flow: entry points, data movement, validations, dependencies, and failure points.
   - Note friction, confusion, duplication, latency, or maintainability issues.

3. Evaluate the user experience.
   - Identify where the flow feels unclear, slow, risky, or cognitively heavy.
   - Call out missing feedback, awkward steps, or unnecessary decisions forced onto the user.
   - Prefer flows that reduce ambiguity, shorten critical paths, and make system status visible.

4. Form the recommendation.
   - Propose the target business flow.
   - Propose the target technical flow needed to support it.
   - Explain why this design is better for usability, correctness, scalability, and supportability.
   - Record tradeoffs and rejected alternatives when they matter.

5. Define feature and roadmap implications.
   - Separate immediate must-haves from later improvements.
   - List missing supporting features, operational tooling, analytics, validation, or safeguards.
   - Identify future development themes such as automation, observability, self-service, or performance.

6. Write the decision record.
   - Use the [decision template](./assets/decision-template.md) for durable ADRs.
   - Use the [workflow review template](./assets/workflow-review-template.md) when a lighter review is enough.
   - Fill in the rationale, consequences, open questions, and next actions.
   - Keep recommendations concrete enough that design or implementation can follow.

7. Connect analysis to execution.
   - When the analysis is likely to drive implementation or bug handling, note the expected related task or bug.
   - When a PM or QA work item already exists, reference that file from the ADR or workflow review.
   - When execution starts later, ensure the task or bug references the relevant ADR or workflow review.

## Decision Rules

- Create a new decision file when the analysis introduces a distinct product or system direction.
- Update an existing decision file when refining the same direction with new evidence.
- Use an ADR when the outcome should survive as a durable product, workflow, or technical decision.
- Use a workflow review when the goal is fast evaluation, lighter recommendations, or a review that may later become an ADR.
- If the issue is purely execution tracking, use the PM/QA workflow skill instead of this one.
- If the issue is a confirmed defect with broken behavior, record it in `.ai/` as a bug and link the related decision if needed.
- If the request is too vague to define a decision question, stop and ask for the target workflow, user group, or system boundary.

## Phase Gates

- Do not proceed to implementation when the requested behavior is still ambiguous.
- Hand off to PM/QA after decision output exists and acceptance intent can be written.
- Re-open analyst work when implementation discovers contradictory requirements or missing policy decisions.

## Quality Checklist

- The decision question is explicit.
- The current business flow and technical flow are both described.
- User comfort and usability concerns are concrete, not generic.
- The recommendation includes rationale and tradeoffs.
- Near-term features and future development ideas are separated.
- Assumptions, risks, and open questions are written down.
- The outcome is saved in `.ai/decisions/`.

## File Handling Guidance

- Keep one decision file per meaningful direction.
- Prefer concise analysis with strong reasoning over long narrative notes.
- Use headings that make the decision easy to scan later.
- Update the same file as the decision evolves so the history stays coherent.

## References

- [Decision template](./assets/decision-template.md)
- [Workflow review template](./assets/workflow-review-template.md)

