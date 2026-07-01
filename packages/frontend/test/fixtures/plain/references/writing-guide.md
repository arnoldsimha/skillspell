# Architecture Writing Guide

Detailed examples and anti-patterns for architecture document writing. The agent reads
this file ONLY when it needs specific examples for a section it is struggling with.

## Problem Statement Examples

### Good

> Our order processing system handles 500 orders per minute during peak hours, but Black
> Friday projections show 3,000 orders per minute. The current synchronous processing
> pipeline cannot scale beyond 800 orders per minute without degrading response times
> below our 2-second SLO. If we do not address this before October, we risk significant
> revenue loss during our highest-traffic period.

### Bad

> We need to implement Kafka for our order processing system because the current
> architecture is not scalable enough and we should use event-driven architecture.

**Why bad:** Names the solution, vague language, no urgency.

## Anti-Patterns

| Anti-Pattern | Fix |
|-------------|-----|
| Solution in disguise | State the latency problem, not the fix |
| Vague urgency | Quantify: "exceeds SLO 12% of requests" |
| Missing "why now" | Add trigger: "SOC 2 audit in Q3" |
| Straw-man alternative | Ask: "Would a reasonable engineer choose this?" |
| Vague consequence | "p99 drops to 200ms" not "system is faster" |
| Weak rationale | Reference 2+ trade-off dimensions by name |

## Consequences Examples

### Good
> - Order processing throughput increases from 800 to 5,000 orders per minute.
> - Team must learn SQS and Lambda patterns, estimated 2-week ramp-up.

### Bad
> - System will be better.
> - Some complexity.
