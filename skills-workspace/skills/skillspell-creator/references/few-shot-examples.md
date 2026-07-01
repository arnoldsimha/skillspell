# Few-Shot Examples

Study these to understand the expected output quality. Example 1 is a complete reference — match its structure, density, and quality. Examples 2–4 show only the key fields that differ for each scenario.

---

## Example 1 — Clear prompt, simple skill (complete reference)

**User prompt**: `Skill name: text-summarizer — create a skill that summarizes long text into bullet points`

```json
{
  "name": "text-summarizer",
  "description": "Use this skill when a user wants to condense a long piece of text into key points. Activates for requests like 'summarize this', 'give me the highlights', or 'TL;DR this'. Do NOT use for rewriting, paraphrasing, or translating text — only for distilling it into bullets.",
  "skillContent": "---\nname: text-summarizer\ndescription: Use this skill when a user wants to condense a long piece of text into key points. Activates for requests like 'summarize this', 'give me the highlights', or 'TL;DR this'. Do NOT use for rewriting, paraphrasing, or translating text — only for distilling it into bullets.\n---\n\n# Text Summarizer\n\nYou are a concise analyst who distills long text into the points that actually matter. Your job is not to compress every sentence — it is to identify the 3–7 ideas a reader needs to walk away with.\n\n## How to Summarize\n\nRead the full text before writing anything, because the most important point is often buried. Then:\n\n1. Identify the central claim or purpose — what is this text fundamentally about?\n2. Extract supporting points that are distinct (not restatements of each other)\n3. Note any concrete data, decisions, or actions mentioned — these are usually the most useful\n4. Discard background, filler, and repetition\n\nWrite each bullet in plain language. If the source uses jargon, translate it. Bullets should be self-contained — a reader should understand each one without reading the others.\n\n## Output Format\n\nReturn bullets only — no preamble, no conclusion, no \"Here is a summary of...\":\n\n- [Most important point first]\n- [Next most important]\n- ...\n\nFor texts over 1000 words, group bullets under short headings if the content has clear sections.\n\n**Example:**\n\nInput: A 500-word product announcement covering new features, pricing changes, and a deprecation notice.\n\nOutput:\n- Pricing increases 15% starting March 1 for all paid tiers\n- New bulk export feature added — supports CSV, JSON, and PDF\n- Legacy API v1 deprecated; v2 migration required by June 30\n- Free tier unchanged\n\n## Edge Cases\n\n- **No clear structure**: Summarize in order of importance, not document order\n- **Very short text** (under 100 words): Return 1–2 bullets or note that the text is already concise\n- **Technical content**: Keep domain terms; do not simplify to the point of inaccuracy",
  "scripts": [],
  "references": [],
  "assets": [],
  "explanation": "• Bullets ordered by importance rather than document order because readers typically want the most actionable information first\n• Output format strips preamble because 'Here is a summary of...' adds no value and clutters the result\n• 3–7 bullet range chosen as a default — enough to be useful, few enough to stay scannable; refine if your content is consistently longer or shorter\n• Suggested test: paste a real meeting notes doc or article and check whether the bullets match what a human would pull out"
}
```

---

## Example 2 — Vague prompt (show: description, references, explanation)

Demonstrates handling ambiguity and using a reference file. `skillContent` structure follows the same pattern as Example 1.

**User prompt**: `Skill name: data-formatter — help with data formatting`

**Key fields:**

```json
{
  "description": "Use this skill when a user needs to clean, restructure, or convert tabular data — CSV, JSON, or plain text tables. Activates for requests like 'clean up this data', 'convert this to JSON', 'fix the column names', or 'reformat this table'. Do NOT use for data analysis, charting, or generating new data — only for reshaping existing data.",
  "references": [
    {
      "name": "format-patterns.md",
      "content": "# Format Conversion Patterns\n\n## CSV to JSON\nTreat the first row as keys. Each subsequent row becomes an object.\n\n## JSON to CSV\nFlatten one level deep only. Nested objects become a JSON string in a single cell.\n\n## Markdown Table to CSV\nStrip pipe characters and whitespace. Discard separator row.\n\n## Common Cleaning Operations\n- Normalize column names: lowercase, underscores, strip special chars\n- Trim whitespace on all values\n- Normalize booleans only if user requests type normalization\n- Deduplicate only if user explicitly requests it"
    }
  ],
  "explanation": "• Prompt said 'help with data formatting' with no specifics — assumed tabular data (CSV/JSON/tables) as the most common case; refine the description if you need XML, fixed-width, or other formats\n• Reference file holds format conversion rules to keep the skill body lean — loaded only when a conversion is needed\n• Output rule 'return data directly' is deliberate — users pasting data want the result, not a paragraph explaining what was done\n• Suggested tests: (1) paste a messy CSV with inconsistent columns; (2) ask to convert JSON to CSV; (3) paste a table with missing values"
}
```

---

## Example 3 — Skill with a bundled script (show: scripts, explanation)

Demonstrates when and how to bundle deterministic code. `skillContent` references the script; structure follows Example 1.

**User prompt**: `Skill name: changelog-generator — generate a changelog from git commit messages`

**Key fields:**

```json
{
  "scripts": [
    {
      "name": "parse-commits.js",
      "content": "// Parses conventional commit messages and groups by type.\n// Input: array of raw commit strings\n// Output: { new: [], improved: [], fixed: [], removed: [], uncategorized: [] }\n\nfunction parseCommits(rawCommits) {\n  const CONVENTIONAL = /^(feat|fix|docs|style|refactor|perf|test|chore|revert|build|ci)(\\(([^)]+)\\))?!?:\\s*(.+)$/i;\n  const TYPE_MAP = { feat:'new', fix:'fixed', perf:'improved', refactor:'improved', docs:'improved', style:'improved', revert:'removed', chore:null, test:null, build:null, ci:null };\n  const results = { new:[], improved:[], fixed:[], removed:[], uncategorized:[] };\n  for (const raw of rawCommits) {\n    const trimmed = raw.trim();\n    if (!trimmed || trimmed.startsWith('Merge')) continue;\n    const match = trimmed.match(CONVENTIONAL);\n    if (match) {\n      const bucket = TYPE_MAP[match[1].toLowerCase()];\n      if (bucket) results[bucket].push({ scope: match[3]||null, message: match[4] });\n    } else {\n      results.uncategorized.push({ scope:null, message:trimmed });\n    }\n  }\n  return results;\n}\nmodule.exports = { parseCommits };"
    }
  ],
  "explanation": "• Bundled parse-commits.js because commit parsing is deterministic and identical across every use — writing it inline each time wastes tokens and risks inconsistency\n• Script maps conventional commit types to user-friendly buckets (New/Improved/Fixed/Removed) so the skill body focuses on rewriting and formatting\n• Merge commits skipped by default — refine if your workflow uses meaningful merge messages"
}
```

---

## Example 4 — Improving an existing skill (show: prompt format, changes, explanation)

Demonstrates the refinement flow. Input is an existing skill + feedback; output is the updated skill.

**User prompt**: `Skill name: text-summarizer — the summaries are too long and always start with "Here is a summary"`

**What changed in `skillContent`** (only the Output Format section was rewritten):

Before:
```
## Output Format
Return a summary of the key points:
- Here is a summary of the main points:
- [Point 1]
```

After:
```
## Output Format
Return bullets only — no preamble, no conclusion, no filler opener. Start directly with the first bullet:
- [Most important point first]
- [Next most important]

Maximum 5 bullets for texts under 500 words. Maximum 7 for longer texts.
```

**Key fields:**

```json
{
  "explanation": "• Removed the 'Here is a summary' opener — preamble adds no value and feedback confirmed it appeared consistently\n• Added explicit bullet count caps (5 short, 7 long) to address 'too long' — gives Claude a concrete constraint rather than vague 'be concise'\n• Generalized the fix: rewrote output format to prohibit all filler openers, not just the specific bad phrase\n• Description unchanged — trigger logic was not part of the reported issue"
}
```