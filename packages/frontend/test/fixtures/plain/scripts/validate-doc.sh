#!/bin/bash
set -euo pipefail

# Validates an architecture document for common structural issues.
# Usage: validate-doc.sh <document-path> <document-type>
#   document-type: adr | system-design | tech-architecture
# Output: List of issues found, or "PASS: No issues found." if valid.
# Exit codes:
#   0 - validation passed (no issues)
#   1 - invalid arguments
#   2 - validation failed (issues found)

if [[ $# -ne 2 ]]; then
  echo "Error: Expected 2 arguments: <document-path> <document-type>" >&2
  echo "Usage: validate-doc.sh <document-path> <document-type>" >&2
  echo "  document-type: adr | system-design | tech-architecture" >&2
  exit 1
fi

DOC_PATH="$1"
DOC_TYPE="$2"

if [[ ! -f "$DOC_PATH" ]]; then
  echo "Error: File not found: $DOC_PATH" >&2
  exit 1
fi

if [[ "$DOC_TYPE" != "adr" && "$DOC_TYPE" != "system-design" && "$DOC_TYPE" != "tech-architecture" ]]; then
  echo "Error: Invalid document type '$DOC_TYPE'. Must be one of: adr, system-design, tech-architecture" >&2
  exit 1
fi

issues=()
content=$(cat "$DOC_PATH")

# --- Check for placeholder text ---
for placeholder in "TODO" "TBD" "TBC" "FIXME" "XXX" "\[description\]" "\[Name\]" "\[name\]"; do
  if grep -qiE "$placeholder" "$DOC_PATH"; then
    issues+=("PLACEHOLDER: Found '$placeholder' — replace with actual content.")
  fi
done

# --- Check for required sections (all types) ---
required_sections=("Problem Statement" "Alternatives" "Trade-off" "Decision" "Consequences")
for section in "${required_sections[@]}"; do
  if ! grep -qi "$section" "$DOC_PATH"; then
    issues+=("MISSING SECTION: '$section' section not found.")
  fi
done

# --- Check for trade-off table ---
if ! grep -qE '^\|.*\|.*\|' "$DOC_PATH"; then
  issues+=("MISSING TABLE: No Markdown table found — trade-off analysis requires a comparison matrix.")
fi

# --- Check for empty sections (heading followed by another heading or end of file) ---
while IFS= read -r line_num; do
  issues+=("EMPTY SECTION: Section at line $line_num appears to have no content.")
done < <(awk '
  /^##/ {
    if (prev_heading_line > 0 && content_lines == 0) {
      print prev_heading_line
    }
    prev_heading_line = NR
    content_lines = 0
    next
  }
  /^[[:space:]]*$/ { next }
  { content_lines++ }
  END {
    if (prev_heading_line > 0 && content_lines == 0) {
      print prev_heading_line
    }
  }
' "$DOC_PATH")

# --- Check for Mermaid diagrams (system-design and tech-architecture only) ---
if [[ "$DOC_TYPE" == "system-design" || "$DOC_TYPE" == "tech-architecture" ]]; then
  if ! grep -q '```mermaid' "$DOC_PATH"; then
    issues+=("MISSING DIAGRAM: No Mermaid diagram found — system design and tech architecture documents require at least one diagram.")
  fi
fi

# --- ADR-specific checks ---
if [[ "$DOC_TYPE" == "adr" ]]; then
  if ! grep -qiE '\*\*Status:\*\*' "$DOC_PATH"; then
    issues+=("MISSING FIELD: ADR is missing a '**Status:**' field.")
  fi
  if ! grep -qiE '\*\*Date:\*\*' "$DOC_PATH"; then
    issues+=("MISSING FIELD: ADR is missing a '**Date:**' field.")
  fi
  # Check for implementation roadmap if status is Accepted
  if grep -qi '\*\*Status:\*\* *Accepted' "$DOC_PATH"; then
    if ! grep -qi 'Implementation Roadmap' "$DOC_PATH"; then
      issues+=("MISSING SECTION: Accepted ADR is missing an 'Implementation Roadmap' section.")
    fi
    if ! grep -qi 'Success Metrics' "$DOC_PATH"; then
      issues+=("MISSING SECTION: Accepted ADR is missing a 'Success Metrics' section.")
    fi
    if ! grep -qi 'Rollback Plan' "$DOC_PATH"; then
      issues+=("MISSING SECTION: Accepted ADR is missing a 'Rollback Plan' section.")
    fi
  fi
fi

# --- Report results ---
if [[ ${#issues[@]} -eq 0 ]]; then
  echo "PASS: No issues found."
  exit 0
else
  echo "FAIL: Found ${#issues[@]} issue(s):"
  for issue in "${issues[@]}"; do
    echo "  - $issue"
  done
  exit 2
fi
