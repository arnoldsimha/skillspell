---
name: arc
description: "Guides the agent through creating well-structured architectural documents including Architecture Decision Records (ADRs), system design documents, and technical architecture documentation. Use when the user wants to create an ADR, document a system design, write a technical architecture document, record an architecture decision, or structure a design proposal. Also use when the user describes rebuilding or replacing a system, asks whether to switch technologies, discusses scaling challenges, compares architectural approaches, or describes cross-team technical coordination — these are implicit architecture document needs even without explicit keywords. Do not use for general documentation writing, code comments, API reference docs, user-facing product documentation, or runbook/operational playbooks."
---

# Arc

This skill helps the agent produce high-quality architectural documents that communicate
technical decisions clearly. It supports three document types — Architecture Decision Records
(ADRs), system design documents, and technical architecture documents — each with structured
templates enforcing best practices like explicit problem statements, alternatives analysis,
trade-off matrices, and decision rationale.

**Critical principle: The agent's primary job is to PRODUCE the completed document, not to
prepare endlessly. Reference files are aids, not prerequisites. If the user provides enough
context, the agent writes the document directly using the inline guidance below. The agent
only reads reference files when it genuinely lacks knowledge for a specific section.**

## Instructions

### Step 1: Identify Document Type and Gather Context

1. The agent determines which document type the user needs.
   - **ADR** — for recording a single architectural decision with its context and consequences.
   - **System Design Document** — for describing the design of a new system or major feature.
   - **Technical Architecture Document** — for documenting the overall architecture of a system or platform.

2. **Recognizing implicit requests.** Users often need architectural documents without using
   architecture terminology. The agent watches for these implicit signals and classifies them:

   | Implicit Signal | Likely Document Type | Why |
   |----------------|---------------------|-----|
   | Rebuilding, rewriting, or replacing a system | System Design | User is designing a new system to replace an existing one |
   | "Should we switch to X?" or "X vs Y for our Z" | ADR | User is weighing alternatives — the core of an architectural decision |
   | Scaling concerns ("won't handle 10x traffic") | ADR or System Design | Scaling triggers either a targeted decision or a broader redesign |
   | Cross-team coordination on technical approach | ADR | Multiple teams need a shared, documented decision record |
   | "How should we structure X?" for a new system | System Design | User is asking for design guidance on something being built |
   | "Document how our platform works" | Tech Architecture | User wants to capture existing architecture for onboarding or review |

   **Concrete examples of implicit requests and how the agent responds:**

   - **"We're rebuilding our payment service from scratch."**
     The agent recognizes this as a System Design need. The user is designing a new system.
     Response: "It sounds like you're designing a new payment service. I'll create a system
     design document that covers the problem statement, component design, data model, and
     deployment plan. What problem is the current service failing to solve?"

   - **"Should we switch from PostgreSQL to DynamoDB for our user profiles?"**
     The agent recognizes this as an ADR need. The user is choosing between two alternatives
     for a specific component.
     Response: "This is a classic architecture decision — I'll create an ADR that evaluates
     PostgreSQL vs DynamoDB (and any other options worth considering) with a structured
     trade-off analysis. What's driving the consideration — scale, cost, or something else?"

   - **"Our API gateway won't handle the traffic when we launch in Europe."**
     The agent recognizes this as either an ADR (if the decision is narrow, e.g., which
     gateway to use) or a System Design (if a broader redesign is needed). The agent asks
     a clarifying question to determine scope.
     Response: "Are you looking to decide on a specific scaling approach for the gateway
     (I'd write an ADR), or is this part of a broader redesign of your edge infrastructure
     (I'd write a system design document)?"

   - **"Three teams need to agree on how we handle authentication across all services."**
     The agent recognizes this as an ADR need. Cross-team technical alignment is best
     captured as a formal decision record.
     Response: "Cross-team authentication decisions are exactly what ADRs are for — they
     create a durable record everyone can reference. I'll structure it with the alternatives,
     trade-offs, and consequences so all three teams can review. What authentication
     approaches are on the table?"

   When the agent detects an implicit signal, it confirms the document type with the user
   before proceeding, briefly explaining why that type fits. This avoids surprising the user
   while still being proactive.

3. If the request is ambiguous even after checking implicit signals, the agent reads
   `references/document-type-guide.md` for selection criteria. Otherwise, the agent proceeds directly.

4. The agent extracts from the user's message (asking only for what is missing):
   - **Problem statement**: What problem or need does this architecture address?
   - **Scope**: What parts of the system are affected?
   - **Constraints**: Budget, timeline, team size, technology mandates, compliance.
   - **Stakeholders**: Decision makers and affected parties.
   - **Alternatives**: Options considered or to be evaluated.

5. If the user provides a codebase, the agent examines relevant source files to understand current architecture.

6. If the document is an ADR, the agent runs `scripts/list-adrs.sh <adr-directory>` to survey existing decisions (if a directory exists).

### Step 2: Write the Complete Document

The agent now writes the full document in one pass. The agent does NOT stop to read additional files unless it genuinely needs guidance on a specific section. The agent uses the structural patterns below.

**Writing the Problem Statement:**

The problem statement is the foundation of every architecture document — a weak one undermines
the entire decision. The agent validates every problem statement against the three anti-patterns
below before proceeding. If the draft matches any anti-pattern, the agent rewrites it before
continuing. This validation is mandatory, not optional, because reviewers judge the entire
document by the quality of its problem statement.

#### Anti-Pattern 1: Solution-Focused Language

The problem statement names a technology, pattern, or migration target instead of describing the pain.

**Bad:**
> We need to use Event Sourcing for our order management system because the current CRUD
> approach doesn't capture the full history of state changes and Event Sourcing is the
> industry best practice for audit trails.

**Why it fails:** Names the solution (Event Sourcing), frames the problem around the fix
instead of the user/business impact, and appeals to "best practice" instead of data.

**Good:**
> Our order management system cannot reconstruct how an order reached its current state,
> which forces the support team to spend an average of 45 minutes per escalation manually
> piecing together logs. We receive 120 escalations per week, and our SOC 2 audit in Q3
> requires a complete audit trail for every state transition. Without a reliable history
> mechanism, we risk both audit failure and continued support cost growth.

**Why it works:** Describes the pain (can't reconstruct state), quantifies it (45 min × 120/week),
explains urgency (SOC 2 in Q3), and names no solution.

#### Anti-Pattern 2: Vague Scope

The problem statement uses unmeasurable words like "slow", "better", "improve" without numbers.

**Bad:**
> System is slow and users are complaining. We need to improve performance to provide a
> better user experience.

**Why it fails:** "Slow" and "better" are unmeasurable. No indication of which component,
how many users are affected, or what "good" looks like.

**Good:**
> The product search API has a p99 latency of 4.2 seconds, which exceeds our 1-second
> SLO and is the top driver of cart abandonment — 23% of users who experience a slow
> search drop off before completing a purchase. Our peak traffic season starts in 8 weeks.

**Why it works:** Pinpoints the component (product search API), quantifies the gap
(4.2s vs 1s SLO), ties to business impact (23% cart abandonment), and states urgency (8 weeks).

#### Anti-Pattern 3: Missing Urgency

The problem statement describes a real issue but gives no reason to act now.

**Bad:**
> Data consistency is important for our distributed services. We should probably address
> the eventual consistency issues at some point since they sometimes cause problems.

**Why it fails:** "At some point" and "sometimes" signal no urgency. No deadline, threshold,
or blocker. No quantified impact.

**Good:**
> Our inventory service and order service disagree on stock levels for an average of 47
> seconds after each update, causing 3.2% of orders to oversell — resulting in $180K in
> refunds last quarter. The holiday traffic surge (3x baseline) begins November 1, which
> will amplify the oversell rate proportionally unless we reduce the consistency window
> below 5 seconds.

**Why it works:** Quantifies the gap (47 seconds), the impact (3.2% oversell, $180K refunds),
and the deadline (November 1 traffic surge).

#### Problem Statement Validation Checklist

After drafting, the agent checks every item before proceeding:

- [ ] **Business/user language**: Describes impact in user, business, or operational terms — not implementation details
- [ ] **No solution language**: Does not mention the proposed solution, specific technologies, or architectural patterns
- [ ] **Quantified scope**: Includes at least one concrete metric, threshold, or measurable impact
- [ ] **Explains "why now"**: States a clear trigger — deadline, threshold, compliance date, or scaling inflection point
- [ ] **2-5 sentences**: Long enough to convey context, short enough to stay focused

If any item fails, the agent rewrites the problem statement before moving on. For additional
before/after examples and a detailed common-mistakes reference table, the agent can consult
`references/problem-statement-validation.md`.

#### For ADRs, the agent produces this structure:

```markdown
# ADR-NNNN: [Short Title]

**Status:** [Proposed | Accepted | Deprecated | Superseded]
**Date:** [YYYY-MM-DD]
**Decision makers:** [Names or roles]

## Context
[Current situation, forces at play, why a decision is needed now]

## Problem Statement
[2-5 sentences. Business/user terms. No solution language. Why now.]

## Alternatives Considered
### Option N: [Name]
[Summary, how it addresses the problem, key characteristics]

## Trade-off Analysis
| Dimension | Option 1 | Option 2 | ... |
|-----------|----------|----------|-----|
| [Dim]     | [Rating — justification] | [Rating — justification] | ... |
(At least 4 dimensions. Every cell has rating + justification.)

## Decision
[Chosen option. Why. Reference specific trade-off results.]

## Consequences
### Positive
### Negative
### Neutral
(Each consequence is one concrete sentence.)

## Decision Triggers
[Conditions to revisit this decision.]
```

#### For System Design Documents, the agent reads `assets/system-design-template.md` for the full structure.

#### For Technical Architecture Documents, the agent reads `assets/tech-architecture-template.md` for the full structure.

#### Writing rules (inline — do NOT read writing-guide.md for these):

- **Problem statements**: Business/user terms, not implementation terms. No solution names. 2-5 sentences. Must explain "why now." Validate against the inline anti-patterns and checklist above.
- **Alternatives**: 2-5 options. Every alternative must be genuinely viable (no straw men). Include "status quo" when applicable.
- **Trade-off ratings**: High / Medium / Low / N/A — every rating needs a one-line justification.
- **Consequences**: Concrete and specific. "p99 latency drops from 850ms to 200ms" not "system is faster."
- **Terminology**: One term per concept, consistent throughout. Define acronyms on first use.

For detailed examples of good vs bad writing beyond problem statements, the agent reads `references/writing-guide.md` only if needed.

### Step 3: Add Diagrams

1. For system design and tech architecture documents, the agent includes at least one Mermaid diagram.
2. For ADRs, diagrams are optional but recommended when the decision involves component interactions.
3. The agent uses Mermaid syntax. If unfamiliar with a specific diagram type, the agent reads `references/diagram-guide.md`.
4. Every diagram gets a title heading and brief description.

### Step 4: Add Implementation Roadmap (Accepted ADRs)

This step is MANDATORY for ADRs with status `Accepted`. It bridges the decision to execution.

For ADRs with status `Proposed`, the agent asks: "Would you like an implementation roadmap now, or later when the decision is accepted?"

The agent appends the following sections directly after Decision Triggers in the ADR:

```markdown
## Implementation Roadmap

### Current State Assessment
[Describe the existing system state that will change. Components, data flows,
integration points affected.]

### Migration Phases

#### Phase 1: [Phase Name]
- **Objective:** [What this phase achieves]
- **Deliverable:** [Concrete output]
- **Effort:** [S / M / L / XL] — [Rationale]
- **Steps:**
  1. [Step]
  2. [Step]

#### Phase 2: [Phase Name]
[Same structure as Phase 1]

(Add more phases as needed.)

### Dependencies and Blockers
| Dependency | Type | Owner | Status | Mitigation if Blocked |
|-----------|------|-------|--------|-----------------------|
| [Dep 1]  | Technical / Team / External | [Owner] | [Status] | [Mitigation] |

## Success Metrics
| Metric | Current Value | Target Value | Measurement Method |
|--------|--------------|-------------|--------------------|
| [e.g., p99 latency] | [e.g., 850ms] | [e.g., < 200ms] | [e.g., Datadog APM] |
(3-5 measurable metrics. Concrete numbers, not vague.)

## Rollback Plan
- **Trigger:** [Condition that activates rollback]
- **Procedure:**
  1. [Rollback step]
  2. [Rollback step]
- **Data considerations:** [How to handle data written during failed migration]
- **Estimated rollback time:** [Duration]
```

For the full template with additional examples, the agent reads `assets/implementation-plan-template.md` only if it needs more structure.

Key rules for the roadmap:
- Migration steps must be ordered phases with clear deliverables.
- Dependencies include technical, team, and external with mitigations.
- Effort uses t-shirt sizes (S/M/L/XL) with rationale. No calendar dates unless user provides timeline.
- Success metrics must be measurable: current value, target value, how measured.
- Rollback plan is mandatory — how to revert if implementation fails.
- For greenfield (no existing system), write "Build Phases" instead of "Migration Phases" and skip Current State Assessment.

### Step 5: Validate and Deliver

1. The agent reviews the document against these checks:
   - Problem statement passes the inline validation checklist (no solution language, quantified, explains "why now", 2-5 sentences)
   - At least 2 alternatives listed, each with name and summary
   - Trade-off matrix has 4+ dimensions, every cell has rating + justification
   - Decision names chosen option and references trade-off results
   - Consequences are concrete, not vague
   - No placeholder text (TODO, TBD, TBC, FIXME) remains
   - For Accepted ADRs: Implementation Roadmap, Success Metrics, and Rollback Plan are present and filled in
2. If saving to a file, the agent runs `scripts/validate-doc.sh <path> <type>` for automated checks.
3. If saving an ADR, the agent runs `scripts/next-adr-number.sh <adr-directory>` for the next sequential number.
4. The agent names ADR files using `NNNN-short-title.md` convention.
5. The agent presents the completed document to the user.

## Error Handling

### Insufficient User Input

1. If the user provides only a topic with no context, the agent asks targeted questions:
   - "What problem is this meant to solve?"
   - "What alternatives have you considered?"
   - "Who are the stakeholders?"
2. The agent does not proceed until it has a problem statement and at least two alternatives.
3. If the user asks to skip context gathering, the agent produces the document with callouts: `> **Assumption:** [what was assumed and why]`.

### Ambiguous Document Type

1. The agent presents options and asks the user to choose.
2. Default: system design for new systems, tech architecture for existing systems.

### Contradictory Information

1. The agent flags contradictions explicitly and asks the user to resolve before continuing.
2. If alternatives overlap, the agent asks for distinguishing characteristics.

### Missing Codebase Access

1. The agent asks the user to describe: tech stack, architectural patterns, and relevant pain points.
2. The agent notes the limitation: `> **Note:** Architecture analysis based on user description; codebase not directly examined.`

### Script Execution Failures

1. If `scripts/list-adrs.sh` fails (directory not found), the agent asks user to create it or specify path.
2. If `scripts/validate-doc.sh` fails, the agent falls back to manual validation using Step 5 checks.
3. If `scripts/next-adr-number.sh` fails, the agent scans the directory manually and starts at `0001` if empty.
4. For permission errors, the agent suggests `chmod +x scripts/<script-name>.sh`.

### Superseding Existing ADRs

1. The agent adds `Superseded by` reference to old ADR and sets status to `Superseded`.
2. The agent confirms with user before modifying existing files.

### Incomplete Trade-off Data

1. The agent marks unknown cells as `Unknown — insufficient data to evaluate`.
2. The agent lists gaps and asks user for missing information.
3. Unknown cells do not block delivery, but the agent warns the analysis is incomplete.

### Implementation Roadmap Issues

1. If user cannot provide enough detail, the agent generates a skeleton with `> **Needs Input:** [what is missing]`.
2. For greenfield, the agent writes Build Phases instead of Migration Phases.
3. If timeline constraints conflict with effort (e.g., 2 weeks for XL), the agent flags the mismatch.

## Edge Cases

### Single Alternative

The agent adds "Status Quo / Do Nothing" to ensure at least two alternatives are considered.

### Retroactive Documentation

1. The agent sets status to `Accepted` with original decision date, writes Context in past tense.
2. The agent asks: "When was this decision originally made?" and "Is implementation completed or in progress?"
3. For completed implementations, the roadmap is written in past tense as a record.

### Cross-Team Decisions

The agent adds an "Impact Analysis" section and a "Cross-Team Coordination" subsection in the roadmap.

### Provisional Decisions

The agent sets status to `Proposed`, adds evaluation criteria and review date. No roadmap unless requested.

### Regulated Environments (SOC 2, HIPAA, PCI-DSS, GDPR, FedRAMP)

The agent adds "Compliance Impact" section and "Regulatory compliance" as a mandatory trade-off dimension. In the roadmap, adds "Compliance Milestones" subsection.

### No Clear Winner in Trade-offs

The agent highlights the tie, asks which dimensions to weight, and defaults to lowest reversibility cost.
