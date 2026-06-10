---
name: "Create ADR From Feature Idea"
description: "Turn a feature idea into an ADR. Use when you want a fast invocation for system analysis, business flow, technical flow, user impact, and roadmap implications."
argument-hint: "What feature idea should be turned into an ADR?"
agent: "agent"
model: "GPT-5 (copilot)"
---

Turn the provided feature idea into a decision record.

Use the workflow in [System Analyst Decisions](../skills/analyst/SKILL.md).

Requirements:
- Analyze the current or implied business flow.
- Analyze the technical flow needed to support the idea.
- Evaluate user comfort, friction, and clarity.
- Recommend the best target flow and explain the tradeoffs.
- Separate immediate implications from later roadmap ideas.
- Save the result in `.ai/decisions/` as `adr-YYYYMMDD-short-title.md`.
- Start from [ADR template](../skills/analyst/assets/decision-template.md).
- If the idea is too vague, state the missing assumptions clearly before finalizing the ADR.
- Keep output strictly in decision scope; do not assign or change task/bug status in `.ai/`.
- If execution implications are identified, reference the canonical status model in `.ai/README.md` as guidance for downstream task/bug lifecycle (`todo`, `in-progress`, `blocked`, `needs-follow-up`, `done`).

Output should be a concrete ADR file, not just chat analysis.
