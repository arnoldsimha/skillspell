## Implementation Roadmap

### Current State Assessment

[Describe the existing system state that will change as a result of this decision.
Include relevant components, data flows, and integration points that are affected.]

### Migration Phases

#### Phase 1: [Phase Name]

- **Objective:** [What this phase achieves]
- **Deliverable:** [Concrete output — deployed service, migrated data, updated API]
- **Effort:** [S / M / L / XL] — [One-sentence rationale for the estimate]
- **Steps:**
  1. [Step 1]
  2. [Step 2]
  3. [Step 3]

#### Phase 2: [Phase Name]

- **Objective:** [What this phase achieves]
- **Deliverable:** [Concrete output]
- **Effort:** [S / M / L / XL] — [Rationale]
- **Steps:**
  1. [Step 1]
  2. [Step 2]
  3. [Step 3]

#### Phase 3: [Phase Name] (if applicable)

- **Objective:** [What this phase achieves]
- **Deliverable:** [Concrete output]
- **Effort:** [S / M / L / XL] — [Rationale]
- **Steps:**
  1. [Step 1]
  2. [Step 2]

### Dependencies and Blockers

| Dependency | Type | Owner | Status | Mitigation if Blocked |
|-----------|------|-------|--------|-----------------------|
| [Dependency 1] | Technical / Team / External | [Team or person] | [Ready / In Progress / Blocked] | [What to do if this is not available] |
| [Dependency 2] | Technical / Team / External | [Team or person] | [Status] | [Mitigation] |

## Success Metrics

| Metric | Current Value | Target Value | Measurement Method |
|--------|--------------|-------------|--------------------|
| [Metric 1, e.g., p99 latency] | [Current, e.g., 850ms] | [Target, e.g., < 200ms] | [How measured, e.g., Datadog APM dashboard] |
| [Metric 2, e.g., deployment frequency] | [Current] | [Target] | [Method] |
| [Metric 3, e.g., error rate] | [Current] | [Target] | [Method] |

## Rollback Plan

- **Trigger:** [Condition that activates rollback, e.g., error rate exceeds 5% for 10 minutes]
- **Procedure:**
  1. [Rollback step 1, e.g., revert feature flag to OFF]
  2. [Rollback step 2, e.g., switch DNS back to old service]
  3. [Rollback step 3, e.g., verify traffic is flowing to old system]
- **Data considerations:** [How to handle data written during the failed migration, e.g., dual-write reconciliation]
- **Estimated rollback time:** [Duration, e.g., < 15 minutes]
