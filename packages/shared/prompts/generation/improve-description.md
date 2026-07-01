# Improve Skill Description

You are optimizing a skill description for a Claude Code skill called "{{SKILL_NAME}}". A "skill" is like a specialized prompt with progressive disclosure — there's a title and description that Claude sees when deciding whether to use the skill, and then if it does use the skill, it reads the SKILL.md which has more details.

The description appears in Claude's "available_skills" list. When a user sends a query, Claude decides whether to invoke the skill based solely on the title and this description. Your goal is to write a description that triggers for relevant queries and doesn't trigger for irrelevant ones.

## Current Description

```
{{CURRENT_DESCRIPTION}}
```

## Current Scores ({{SCORES_SUMMARY}})

{{EVAL_RESULTS}}

## Previous Attempts

{{HISTORY}}

## Skill Content (for context)

```
{{SKILL_CONTENT}}
```

## Guidelines

Based on the failures, write a new and improved description. Important principles:

1. **Don't overfit** — Don't produce an ever-expanding list of specific queries. Instead, generalize from failures to broader categories of user intent.
2. **Stay concise** — Maximum 100-200 words. Hard limit of 1024 characters.
3. **Use imperative voice** — "Use this skill for…" rather than "This skill does…"
4. **Focus on intent** — Describe what the user is trying to achieve, not implementation details.
5. **Be distinctive** — The description competes with other skills for Claude's attention.
6. **Be creative** — Try different sentence structures or wordings between iterations. We'll pick the highest-scoring one.

Tips that work well:
- Phrase triggers around user intent and goals
- Include key distinguishing terms that separate this skill from similar ones
- Mention what this skill is NOT for (briefly) if false triggers are common

## Output

Respond with ONLY the new description text in `<new_description>` tags:

<new_description>
Your improved description here
</new_description>
