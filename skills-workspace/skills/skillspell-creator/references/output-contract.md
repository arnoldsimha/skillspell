# Output Contract

The SkillSpell backend expects skill generation output as a single JSON object matching this exact schema.

## Schema

```json
{
  "name": "skill-name",
  "description": "string",
  "skillContent": "string",
  "scripts": [{"name": "string", "content": "string"}],
  "references": [{"name": "string", "content": "string"}],
  "assets": [{"name": "string", "content": "string"}],
  "explanation": "string"
}
```

No extra fields allowed. No text outside the JSON object.

## Field Rules

### name
- 1–64 chars, lowercase letters/numbers/hyphens
- Must start with a letter, no consecutive hyphens
- Kebab-case: `my-skill-name`

### description
- Max 2048 chars (JSON field)
- This value is also written into the YAML frontmatter where it is hard-limited to 1024 chars — keep it under 1024 to avoid truncation
- Trigger-optimized: clearly state WHEN to use and WHEN NOT to use
- Slightly "pushy" to combat undertriggering
- Focus on user intent, not implementation details

### skillContent
- Full SKILL.md content including YAML frontmatter
- Production-ready, well-structured, complete
- Under 500 lines
- Single escaped JSON string

**Escaping (CRITICAL — follow exactly):**
- newline → `\n`
- `"` → `\"`
- `\` → `\\`
- No raw newlines or unescaped quotes
- NEVER use `\'` — single quotes do NOT need escaping in JSON
- The ONLY valid JSON escape sequences are: `\"`, `\\`, `\/`, `\b`, `\f`, `\n`, `\r`, `\t`, `\uXXXX`
- Any other backslash sequence (e.g., `\'`) will cause a parse error

**Must include:**
- YAML frontmatter with `name` and `description`
- Title heading
- Opening role sentence: "You are a [role] who [core capability]."
- Step-by-step instructions (imperative form)
- Output format (if applicable)
- Error handling
- Examples where helpful

### scripts / references / assets
- Always arrays (use `[]` if none)
- Each item: `{"name": "filename.ext", "content": "file content..."}`
- **Scripts**: executable code for deterministic/repetitive tasks
- **References**: supplementary docs, schemas, specs
- **Assets**: templates, static files used in output
- Scripts should be self-contained with error handling

### explanation
- Use bullet points (one per line, each starting with `• `)
- Each bullet = one distinct aspect of what was done
- What changed/generated + why, grouped logically
- Concise, not repetitive

## Validation Checklist

Before returning, verify:

1. Valid JSON — starts with `{`, ends with `}`
2. No extra text outside JSON
3. All fields present, no extras
4. Correct escaping (no raw newlines, no unescaped quotes)
5. `name` matches regex `^[a-z][a-z0-9-]*$`
6. `description` includes WHEN + WHEN NOT triggers
7. `skillContent` complete and < 500 lines
8. `scripts`/`references`/`assets` are arrays

If ANY check fails → fix before output.
NEVER output partial JSON. NEVER truncate content. NEVER add commentary outside JSON.

## Frontmatter Validation

The `skillContent` YAML frontmatter must pass these checks:
- Only allowed keys: `name`, `description`, `license`, `allowed-tools`, `metadata`, `compatibility`
- `name`: kebab-case, 1–64 chars
- `description`: ≤ 1024 chars, no angle brackets (`<` or `>`)
- `compatibility`: ≤ 500 chars (if present)