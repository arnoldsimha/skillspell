# Simulate Skill Trigger Decision

You are simulating Claude's skill selection logic. When a user sends a query, Claude looks at the available skills and decides whether to invoke one.

## Available Skills

{{SKILLS_LIST}}

## User Query

"{{QUERY}}"

## Task

Would you invoke the "{{TARGET_SKILL_NAME}}" skill for this query?

Consider:
- Does the query match the skill's described purpose?
- Is there a better-matching skill in the list?
- Would a general response (no skill) be more appropriate?

Answer ONLY "yes" or "no".
