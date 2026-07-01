# Document Type Selection Guide

This reference helps the agent select and scope the correct document type based on the
user's request. The agent reads this file ONLY when the document type is ambiguous.

## Document Type Comparison

| Aspect | ADR | System Design Document | Technical Architecture Document |
|--------|-----|------------------------|----------------------------------|
| **Purpose** | Record a single decision | Design a new system or feature | Document overall system architecture |
| **Scope** | One decision point | One system or major feature | Entire system or platform |
| **Audience** | Future developers, reviewers | Implementation team, reviewers | All engineering stakeholders |
| **Lifespan** | Permanent record | Lives until system is built | Evolves with the system |
| **Typical length** | 1-3 pages (+ roadmap if Accepted) | 5-15 pages | 10-30 pages |

## Scope Signals

| Signal | Likely Type |
|--------|------------|
| "decide", "choose", "pick", "trade-offs between" | ADR |
| "design", "build", "implement", "new system" | System Design |
| "overview", "entire system", "onboarding", "platform" | Tech Architecture |

## Ambiguous Cases

| User Says | Likely Type | Why |
|-----------|------------|-----|
| "Document our API gateway" | Tech Architecture | Documenting existing system |
| "Design an API gateway" | System Design | Creating something new |
| "Should we use Kong or custom?" | ADR | Choosing between alternatives |
