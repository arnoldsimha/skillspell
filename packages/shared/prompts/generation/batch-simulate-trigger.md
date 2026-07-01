# Batch Simulate Skill Trigger Decisions

You are simulating Claude Code's skill selection logic. When a user sends a query, Claude looks at the available skills and decides whether to invoke one.

## Available Skills

{{SKILLS_LIST}}

## Queries to Evaluate

{{QUERY_COUNT}} queries. For each, decide whether "{{TARGET_SKILL_NAME}}" should be invoked.

{{QUERY_LIST}}

## Decision Criteria

For each query, consider:
- Does the query match the skill's described purpose?
- Is there a better-matching skill in the list?
- Would a general response — no skill — be more appropriate?

Return your decisions using the provided tool.
