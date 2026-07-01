import { extractSections, extractSectionHeadings } from './skill-section-parser.js';

describe('skill-section-parser', () => {
  describe('extractSections', () => {
    it('should extract ATX headings at various depths', () => {
      const content = `# Title
## Prerequisites
### Step 1
#### Detail
## Error Handling`;

      const sections = extractSections(content);
      expect(sections).toEqual([
        { heading: 'Title', depth: 1 },
        { heading: 'Prerequisites', depth: 2 },
        { heading: 'Step 1', depth: 3 },
        { heading: 'Detail', depth: 4 },
        { heading: 'Error Handling', depth: 2 },
      ]);
    });

    it('should strip YAML frontmatter before parsing', () => {
      const content = `---
name: my-skill
description: A test skill
---
## Overview
## Steps`;

      const sections = extractSections(content);
      expect(sections).toEqual([
        { heading: 'Overview', depth: 2 },
        { heading: 'Steps', depth: 2 },
      ]);
    });

    it('should ignore # characters inside fenced code blocks', () => {
      const content = `## Real Heading

\`\`\`python
# This is a Python comment, not a heading
## Also not a heading
def main():
    pass
\`\`\`

## Another Real Heading

\`\`\`bash
# bash comment
echo "hello"
\`\`\``;

      const sections = extractSections(content);
      expect(sections).toEqual([
        { heading: 'Real Heading', depth: 2 },
        { heading: 'Another Real Heading', depth: 2 },
      ]);
    });

    it('should return empty array for content with no headings', () => {
      const content = `Just some text without any headings.

More text here.

- A list item
- Another list item`;

      const sections = extractSections(content);
      expect(sections).toEqual([]);
    });

    it('should return empty array for empty string', () => {
      expect(extractSections('')).toEqual([]);
    });

    it('should return empty array for undefined/null input', () => {
      expect(extractSections(undefined as unknown as string)).toEqual([]);
      expect(extractSections(null as unknown as string)).toEqual([]);
    });

    it('should return empty array for content with only frontmatter', () => {
      const content = `---
name: my-skill
description: A test skill
---`;

      const sections = extractSections(content);
      expect(sections).toEqual([]);
    });

    it('should handle frontmatter with no trailing newline', () => {
      const content = `---
name: test
---
## Section One`;

      const sections = extractSections(content);
      expect(sections).toEqual([
        { heading: 'Section One', depth: 2 },
      ]);
    });

    it('should handle complex YAML frontmatter with special characters', () => {
      const content = `---
name: my-skill
description: "A skill with # hash and --- dashes"
tags:
  - skill
  - test
---
## Overview
### Details`;

      const sections = extractSections(content);
      expect(sections).toEqual([
        { heading: 'Overview', depth: 2 },
        { heading: 'Details', depth: 3 },
      ]);
    });

    it('should handle headings with inline formatting', () => {
      const content = `## **Bold Heading**
### _Italic Heading_
## \`Code Heading\``;

      const sections = extractSections(content);
      expect(sections).toHaveLength(3);
      // marked preserves inline formatting as text
      expect(sections[0].depth).toBe(2);
      expect(sections[1].depth).toBe(3);
      expect(sections[2].depth).toBe(2);
    });

    it('should handle multiple code blocks with different languages', () => {
      const content = `## Setup

\`\`\`javascript
// # Not a heading
const x = 1;
\`\`\`

## Configuration

\`\`\`yaml
# Also not a heading
key: value
\`\`\`

## Usage`;

      const sections = extractSections(content);
      expect(sections).toEqual([
        { heading: 'Setup', depth: 2 },
        { heading: 'Configuration', depth: 2 },
        { heading: 'Usage', depth: 2 },
      ]);
    });

    it('should extract headings correctly when content has markdown tables', () => {
      const content = `## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| timeout | number | 30 | Request timeout |
| retries | number | 3 | Max retry count |

## Error Codes

| Code | Meaning |
|------|---------|
| 404 | Not found |
| 500 | Server error |

## Recovery Steps`;

      const sections = extractSections(content);
      expect(sections).toEqual([
        { heading: 'Configuration', depth: 2 },
        { heading: 'Error Codes', depth: 2 },
        { heading: 'Recovery Steps', depth: 2 },
      ]);
    });

    it('should extract headings correctly when content has markdown lists', () => {
      const content = `## Prerequisites

- Node.js 18+
- TypeScript 5.x
- npm or yarn

## Steps

1. Install dependencies
2. Configure environment
3. Run the build

### Nested Lists

- Top level
  - Sub item A
  - Sub item B
    - Deep item
- Another top level

## Output`;

      const sections = extractSections(content);
      expect(sections).toEqual([
        { heading: 'Prerequisites', depth: 2 },
        { heading: 'Steps', depth: 2 },
        { heading: 'Nested Lists', depth: 3 },
        { heading: 'Output', depth: 2 },
      ]);
    });

    it('should handle YAML code blocks (not frontmatter) without confusion', () => {
      const content = `## Configuration

Here is a sample YAML config:

\`\`\`yaml
# Database configuration
database:
  host: localhost
  port: 5432
  ## This is NOT a heading
  name: mydb
\`\`\`

## Deployment

\`\`\`yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  # Not a heading either
  name: my-app
\`\`\`

## Monitoring`;

      const sections = extractSections(content);
      expect(sections).toEqual([
        { heading: 'Configuration', depth: 2 },
        { heading: 'Deployment', depth: 2 },
        { heading: 'Monitoring', depth: 2 },
      ]);
    });

    it('should handle a realistic SKILL.md with mixed complex content', () => {
      const content = `---
name: api-error-handler
description: Handles API errors with retry logic
version: 3
---

# API Error Handler

## Overview

This skill teaches the AI to implement proper API error handling with:

- Exponential backoff
- Circuit breaker pattern
- Structured error responses

## Prerequisites

| Requirement | Version |
|------------|---------|
| Node.js | 18+ |
| TypeScript | 5.x |

## Implementation

### Error Types

Define your error hierarchy:

\`\`\`typescript
// # This is a comment, not a heading
abstract class AppError extends Error {
  abstract readonly statusCode: number;
  ## also not a heading
}
\`\`\`

### Retry Logic

1. Start with 100ms delay
2. Double on each retry
3. Cap at 30 seconds
4. Add jitter: ±10%

\`\`\`python
# Not a heading
def retry(fn, max_retries=3):
    ## Also not a heading
    pass
\`\`\`

### Circuit Breaker

The circuit breaker has three states:

| State | Description | Next State |
|-------|-------------|------------|
| Closed | Normal operation | Open (on failure) |
| Open | Reject all requests | Half-Open (after timeout) |
| Half-Open | Allow one test request | Closed or Open |

## Testing

Run tests with:

\`\`\`bash
# Run all tests
npm test
\`\`\`

## Output Format

Return errors as JSON:

\`\`\`json
{
  "error": true,
  "code": "NOT_FOUND",
  "message": "Resource not found"
}
\`\`\``;

      const sections = extractSections(content);
      expect(sections).toEqual([
        { heading: 'API Error Handler', depth: 1 },
        { heading: 'Overview', depth: 2 },
        { heading: 'Prerequisites', depth: 2 },
        { heading: 'Implementation', depth: 2 },
        { heading: 'Error Types', depth: 3 },
        { heading: 'Retry Logic', depth: 3 },
        { heading: 'Circuit Breaker', depth: 3 },
        { heading: 'Testing', depth: 2 },
        { heading: 'Output Format', depth: 2 },
      ]);
    });
  });

  describe('extractSectionHeadings', () => {
    it('should return formatted heading strings with # prefix', () => {
      const content = `# Title
## Prerequisites
### Step 1`;

      const headings = extractSectionHeadings(content);
      expect(headings).toEqual([
        '# Title',
        '## Prerequisites',
        '### Step 1',
      ]);
    });

    it('should return empty array for content with no headings', () => {
      expect(extractSectionHeadings('Just text')).toEqual([]);
    });

    it('should handle full SKILL.md content with frontmatter and code blocks', () => {
      const content = `---
name: api-error-handler
description: Handle API errors gracefully
---

# API Error Handler

## Overview

This skill teaches proper error handling.

## Prerequisites

- Node.js 18+
- TypeScript

## Implementation

### Error Types

\`\`\`typescript
// # This should NOT appear as a heading
enum ErrorType {
  NotFound = 404,
}
\`\`\`

### Error Handler

\`\`\`typescript
## This should also NOT appear
function handleError(err: Error) {
  console.error(err);
}
\`\`\`

## Testing

Run the tests.

## Output Format

Return JSON.`;

      const headings = extractSectionHeadings(content);
      expect(headings).toEqual([
        '# API Error Handler',
        '## Overview',
        '## Prerequisites',
        '## Implementation',
        '### Error Types',
        '### Error Handler',
        '## Testing',
        '## Output Format',
      ]);
    });
  });
});
