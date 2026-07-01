#!/bin/bash
set -euo pipefail

# Scans a directory for existing ADR files and returns the next sequential number.
# Usage: next-adr-number.sh <adr-directory>
# Output: The next ADR number zero-padded to 4 digits (e.g., "0005")
# Exit codes:
#   0 - success
#   1 - invalid arguments or directory not found

if [[ $# -ne 1 ]]; then
  echo "Error: Expected exactly 1 argument: <adr-directory>" >&2
  echo "Usage: next-adr-number.sh <adr-directory>" >&2
  exit 1
fi

ADR_DIR="$1"

if [[ ! -d "$ADR_DIR" ]]; then
  echo "Error: Directory not found: $ADR_DIR" >&2
  echo "Hint: Create the directory first or check the path." >&2
  exit 1
fi

# Find the highest ADR number by scanning filenames matching NNNN-*.md pattern
max_number=0
for file in "$ADR_DIR"/[0-9][0-9][0-9][0-9]-*.md; do
  # Handle case where glob matches nothing
  [[ -e "$file" ]] || continue
  basename_file=$(basename "$file")
  # Extract the leading 4-digit number
  num_str="${basename_file:0:4}"
  # Remove leading zeros for arithmetic comparison
  num=$((10#$num_str))
  if (( num > max_number )); then
    max_number=$num
  fi
done

next_number=$((max_number + 1))
printf "%04d\n" "$next_number"
