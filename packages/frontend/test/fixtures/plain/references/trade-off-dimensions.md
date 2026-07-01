# Trade-off Dimensions

This reference lists standard dimensions for evaluating architectural alternatives.
The agent selects the dimensions most relevant to the specific decision being documented.

## Core Dimensions

These dimensions apply to most architectural decisions:

| Dimension | What to Evaluate |
|-----------|------------------|
| **Complexity** | Implementation effort, cognitive load, learning curve for the team |
| **Scalability** | Ability to handle growth in users, data, or throughput |
| **Performance** | Latency, throughput, resource utilization under expected load |
| **Reliability** | Fault tolerance, recovery time, data durability |
| **Maintainability** | Ease of debugging, updating, and extending over time |
| **Cost** | Infrastructure costs, licensing, development time, operational overhead |
| **Security** | Attack surface, data protection, compliance alignment |
| **Team familiarity** | Existing team expertise and hiring availability |

## Situational Dimensions

The agent includes these when they are relevant to the specific context:

| Dimension | When to Include |
|-----------|-----------------|
| **Time to market** | When there is a hard deadline or competitive pressure |
| **Vendor lock-in** | When evaluating managed services or proprietary solutions |
| **Interoperability** | When the system must integrate with existing or third-party systems |
| **Observability** | When operational visibility is a stated concern |
| **Data consistency** | When the decision affects how data is stored, replicated, or synchronized |
| **Reversibility** | When the cost of changing the decision later is a factor |
| **Regulatory compliance** | When legal or industry regulations constrain the options |
| **Developer experience** | When tooling, debugging, or local development workflow matters |
| **Testability** | When the architecture must support automated testing at multiple levels |

## Rating Scale

| Rating | Meaning |
|--------|---------|
| **High** | Strong advantage — this option excels on this dimension |
| **Medium** | Adequate — meets requirements but is not a differentiator |
| **Low** | Weak — this option has notable limitations on this dimension |
| **N/A** | Not applicable — this dimension does not meaningfully apply |

Each rating must include a one-line justification.
