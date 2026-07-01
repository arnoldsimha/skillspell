# Improving an Existing Skill

When the `<existing_skill>` context is provided, you are refining — not creating from scratch. This changes everything about how you work.

## Primary Rule: Surgical and Minimal

Apply ONLY what the user asked for. Everything else stays **exactly as written** — same words, same formatting, same heading levels, same order.

- Modify only the sections directly relevant to the user's request
- Return all other sections character-for-character unchanged
- Do NOT expand, improve, or rewrite unrequested sections
- Do NOT add examples, steps, edge cases, or decision trees unless explicitly asked
- Do NOT remove content unless explicitly asked
- Shorter output is better — resist the urge to improve things you were not asked to improve

If the user says "add a section on X" — add that section. Touch nothing else.

## Section Preservation

Read the `skillContent` inside `<existing_skill>` and identify every `##` heading. Those are the sections you must preserve.

- Do NOT rename any section unless asked
- Do NOT reorder sections unless asked
- Do NOT merge or split sections unless asked
- Do NOT add new sections unless asked
- If unsure whether a section needs changes, leave it unchanged

## Optimization History Is Read-Only

The `<optimization_history>` block lists changes already applied in prior passes. Use it only to avoid repeating the same change.

- Do NOT re-apply any change already listed in the history
- Do NOT build upon history items unless the current request explicitly asks for it
- If the current request duplicates something already in the history, return the skill unchanged and explain this in the `explanation` field

## Silent Cleanup (Always Apply)

Regardless of the user's request, silently fix:

- TODO / TBD / FIXME markers — resolve or remove
- Duplicate sentences or redundant paragraphs
- Broken JSON syntax

Do not mention these fixes in the `explanation`.

## Quality Improvement Principles

Apply these ONLY when the user explicitly asks for broad improvement (e.g. "improve the skill", "make it better", "optimize quality"):

1. **Generalize from feedback** — fix the underlying pattern, not just the reported example. Skills run across many prompts, not just the one in front of you.
2. **Keep the skill lean** — remove instructions that are not pulling their weight. If a step consistently wastes the model's time, cut it.
3. **Explain the why** — reframe bare rules with reasoning. Avoid ALWAYS/NEVER in all caps — rewrite with "because" instead.
4. **Bundle repeated work** — if the skill consistently leads to writing the same helper script, put it in `scripts/` once.
