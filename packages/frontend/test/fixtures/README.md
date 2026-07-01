# Zip Upload Test Fixtures

Place real skill zip exports here for integration testing.  
Each `.zip` file is automatically discovered and tested by `/zipParser.test.ts`.

## Expected directory

```
fixtures/
├── README.md                    ← this file
├── claude/                      ← exports from Claude (Claude Code)
│   └── my-skill.zip             ← standard structure: .claude/skills/<name>/SKILL.md
├── cursor/                      ← exports from Cursor IDE
│   └── my-rule.zip              ← flat format: .cursor/rules/<name>.md
├── windsurf/                    ← exports from Windsurf
│   └── rules.zip                ← flat format: .windsurfrules
├── copilot/                     ← exports from GitHub Copilot
│   └── instructions.zip         ← flat format: .github/copilot-instructions.md
├── roo/                         ← exports from Roo Code
│   └── my-skill.zip             ← standard or custom layout with SKILL.md
└── plain/                       ← hand-crafted plain exports
    └── my-skill.zip             ← flat: SKILL.md + scripts/ + references/
```

## What the test does

For every `.zip` file found here, the test:

1. Loads the file as a `File` blob
2. Calls `parseSkillZip(file)`
3. Asserts the result is a success (`result.success === true`)
4. Asserts the extracted skill has a non-empty `skillContent`
5. Logs the skill name, description length, file counts, and any warnings

This serves as a smoke test — **you don't need to write assertions manually**.  
Just drop `.zip` files exported from each tool and run the tests.

## How to run

```bash
cd packages/frontend
npx vitest run --reporter=verbose
```
