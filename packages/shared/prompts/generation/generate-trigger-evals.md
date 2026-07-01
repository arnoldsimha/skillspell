# Generate Trigger Eval Queries

You are generating test queries to evaluate how well a skill description triggers Claude's skill selection logic.

## Context

A "skill" in Claude Code has a **name** and a **description** that appear in Claude's `available_skills` list. When a user sends a query, Claude decides whether to invoke the skill based solely on this name and description. The full skill content (SKILL.md) is only read after triggering.

Your job is to generate diverse test queries — some that SHOULD trigger the skill, and some near-miss queries that SHOULD NOT.

## Skill Under Test

**Name**: {{SKILL_NAME}}

**Description**:
```
{{SKILL_DESCRIPTION}}
```

**Skill Content** (for understanding what the skill does):
```
{{SKILL_CONTENT}}
```

## Instructions

Generate exactly {{COUNT}} trigger eval queries as a JSON array. Follow these rules:

1. **Balance**: Roughly 60% should_trigger=true, 40% should_trigger=false
2. **Diversity**: Cover different phrasings, intent levels, and edge cases
3. **Near-misses**: The should_trigger=false queries should be plausible but clearly outside the skill's scope — not trivially different
4. **Realistic**: Queries should look like real user messages to Claude Code
5. **Edge cases**: Include at least 2-3 ambiguous/borderline queries on each side
6. **Varying length**: Mix short commands ("fix the bug") with longer requests ("I need help restructuring my authentication module to use JWT tokens")

## Output Format

Respond with ONLY a JSON array, no other text:

```json
[
  { "query": "...", "shouldTrigger": true },
  { "query": "...", "shouldTrigger": false },
  ...
]
```
