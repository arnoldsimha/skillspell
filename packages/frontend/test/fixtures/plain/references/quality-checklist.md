# Architecture Document Quality Checklist

The agent validates every architecture document against this checklist before delivering
it to the user. Every item must pass.

## Problem Statement

- [ ] States the problem in business or user terms, not solution terms
- [ ] Explains why the problem needs to be solved now
- [ ] Is 2-5 sentences — not longer
- [ ] Does not mention the proposed solution

## Context

- [ ] Describes the current state of the system
- [ ] Lists relevant constraints (technical, organizational, regulatory)
- [ ] Identifies stakeholders affected by the decision
- [ ] Notes any relevant prior decisions or ADRs

## Alternatives

- [ ] At least 2 alternatives are listed
- [ ] No more than 5 alternatives are listed
- [ ] Each alternative has a clear name and summary
- [ ] A "status quo" option is included when applicable
- [ ] No straw-man alternatives (each must be genuinely viable)

## Trade-off Analysis

- [ ] Uses a comparison matrix (Markdown table)
- [ ] Dimensions are relevant to the specific decision
- [ ] Every cell has both a rating and a one-line justification
- [ ] At least 4 dimensions are evaluated
- [ ] No dimension is evaluated for only one alternative

## Decision

- [ ] The recommended option is stated explicitly
- [ ] Rationale references specific trade-off results
- [ ] Decision triggers for revisiting are documented
- [ ] For ADRs: status is one of Proposed, Accepted, Deprecated, Superseded

## Consequences

- [ ] Positive consequences are listed
- [ ] Negative consequences are listed
- [ ] Each consequence is concrete and specific (not vague)
- [ ] No consequence contradicts the trade-off analysis

## Diagrams (System Design and Tech Architecture only)

- [ ] At least one diagram is included
- [ ] Diagrams use Mermaid syntax
- [ ] Each diagram has a title and brief description
- [ ] Diagrams are relevant to the decision or design being documented

## Writing Quality

- [ ] Terminology is consistent throughout the document
- [ ] No placeholder text (TODO, TBD, TBC) remains
- [ ] Sections follow the template structure
- [ ] The document is readable by someone not present in the original discussion
- [ ] Acronyms are defined on first use

## Implementation Roadmap (Accepted ADRs only)

- [ ] Migration or build phases are ordered and have clear deliverables
- [ ] Dependencies and blockers are identified with mitigations
- [ ] Effort estimates use t-shirt sizes with rationale
- [ ] Success metrics are measurable and concrete (current value, target value, method)
- [ ] Rollback plan is documented with trigger, procedure, and estimated time
