# Diagram Selection and Mermaid Syntax Guide

The agent reads this file ONLY when it needs Mermaid syntax for a specific diagram type.

## Diagram Selection by Document Type

| Document Type | Required | Recommended |
|--------------|----------|-------------|
| ADR | None | Before/after if decision changes interactions |
| System Design | System overview | Sequence diagrams, deployment diagram |
| Tech Architecture | Context + overview | Data flow, deployment, interaction flows |

## Common Patterns

### Context Diagram
```mermaid
graph TD
    Users["Users"] --> System["Our System"]
    System --> ExtAPI["External API"]
    OtherSvc["Other Service"] --> System
```

### Sequence Diagram
```mermaid
sequenceDiagram
    participant U as User
    participant A as Service A
    participant B as Service B
    U->>A: Request
    A->>B: Process
    B-->>A: Response
    A-->>U: Result
```

### Deployment Diagram
```mermaid
graph LR
    LB[Load Balancer] --> S1[Server 1]
    LB --> S2[Server 2]
    S1 --> DB[(Database)]
    S2 --> DB
```

## Rules
- Title every diagram with a heading and one-sentence description
- Label arrows with protocols or actions
- Keep to 7-12 nodes; split if more complex
- Node names must match terminology in the text
