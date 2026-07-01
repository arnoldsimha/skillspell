#!/bin/bash
set -euo pipefail

# Lists all ADRs in a directory with their status, title, and date.
# Usage: list-adrs.sh <adr-directory>
# Output: Formatted table of ADRs sorted by number.
# Exit codes:
#   0 - success
#   1 - invalid arguments or directory not found

if [[ $# -ne 1 ]]; then
  echo "Error: Expected exactly 1 argument: <adr-directory>" >&2
  echo "Usage: list-adrs.sh <adr-directory>" >&2
  exit 1
fi

ADR_DIR="$1"

if [[ ! -d "$ADR_DIR" ]]; then
  echo "Error: Directory not found: $ADR_DIR" >&2
  echo "Hint: Create the directory first or check the path." >&2
  exit 1
fi

# Collect ADR files
adr_files=()
for file in "$ADR_DIR"/[0-9][0-9][0-9][0-9]-*.md; do
  [[ -e "$file" ]] || continue
  adr_files+=("$file")
done

if [[ ${#adr_files[@]} -eq 0 ]]; then
  echo "No ADRs found in $ADR_DIR"
  echo "Hint: ADR files should follow the naming convention NNNN-short-title.md"
  exit 0
fi

# Print header
printf "%-6s | %-12s | %-12s | %s\n" "NUM" "STATUS" "DATE" "TITLE"
printf "%-6s-+-%-12s-+-%-12s-+-%s\n" "------" "------------" "------------" "----------------------------------------"

# Process each ADR file sorted by name
for file in $(printf '%s\n' "${adr_files[@]}" | sort); do
  basename_file=$(basename "$file")
  num="${basename_file:0:4}"

  # Extract title from first H1 heading
  title=$(grep -m1 '^# ' "$file" | sed 's/^# //' | sed "s/^ADR-${num}: *//" || echo "(no title)")

  # Extract status from **Status:** field
  status=$(grep -i '\*\*Status:\*\*' "$file" | head -1 | sed 's/.*\*\*Status:\*\* *//' | sed 's/[[:space:]]*$//' || echo "(unknown)")

  # Extract date from **Date:** field
  date=$(grep -i '\*\*Date:\*\*' "$file" | head -1 | sed 's/.*\*\*Date:\*\* *//' | sed 's/[[:space:]]*$//' || echo "(no date)")

  printf "%-6s | %-12s | %-12s | %s\n" "$num" "$status" "$date" "$title"
done

echo ""
echo "Total: ${#adr_files[@]} ADR(s)"
