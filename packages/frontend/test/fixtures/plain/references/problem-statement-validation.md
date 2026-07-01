# Problem Statement Quality Checklist

The problem statement is the foundation of every architecture document. A weak problem
statement leads to poorly justified decisions, vague trade-offs, and documents that fail
to persuade reviewers. The agent reads this file when writing the problem statement section
and validates its draft against the checklist below.

## Quality Checklist

Every problem statement must satisfy all five criteria:

- [ ] **Business/user language**: Describes the problem in terms of user impact, business
  outcomes, or operational pain — not implementation details or technology names.
- [ ] **No solution language**: Does not mention the proposed solution, specific technologies,
  or architectural patterns. The problem statement frames the *need*, not the *fix*.
- [ ] **Quantified scope**: Includes at least one concrete metric, threshold, or measurable
  impact (e.g., error rates, latency numbers, user counts, revenue figures, SLO breaches).
- [ ] **Explains "why now"**: States a clear trigger — a deadline, a threshold being crossed,
  a compliance date, a scaling inflection point — that makes this decision urgent.
- [ ] **2-5 sentences**: Long enough to convey context, short enough to stay focused. If it
  takes more than 5 sentences, details belong in the Context section instead.

## Before/After Examples

### Example 1: Solution-Focused Language

**Before (bad):**
> We need to migrate to Kafka because our current RabbitMQ setup can't handle the load
> and event-driven architecture is the industry best practice for high-throughput systems.

**What's wrong:** Names both the current technology and the proposed solution (Kafka).
Appeals to "best practice" instead of a concrete problem. Doesn't quantify "the load"
or explain why this is urgent now.

**After (good):**
> Our order ingestion pipeline processes 12,000 events per second at peak, but traffic
> projections for the holiday season show 45,000 events per second. The current message
> broker begins dropping messages above 18,000 events per second, which causes order
> loss and requires manual reconciliation. We need to resolve this before the November
> traffic ramp begins.

**Why it works:** Quantifies current capacity (12k eps), projected need (45k eps), and
failure threshold (18k eps). States the consequence (order loss) and the deadline
(November traffic ramp). No technology names in the problem.

### Example 2: Vague Scope

**Before (bad):**
> Our system is slow and users are complaining. We need to improve performance to
> provide a better user experience.

**What's wrong:** "Slow" and "better" are unmeasurable. No indication of which part of
the system, how many users are affected, or what "good" looks like.

**After (good):**
> The product search API has a p99 latency of 4.2 seconds, which exceeds our 1-second
> SLO and is the top driver of cart abandonment — 23% of users who experience a slow
> search drop off before completing a purchase. Our peak traffic season starts in 8 weeks.

**Why it works:** Pinpoints the specific component (product search API), quantifies the
gap (4.2s actual vs 1s SLO), ties it to business impact (23% cart abandonment), and
states urgency (8 weeks to peak).

### Example 3: Missing Urgency

**Before (bad):**
> Our authentication system uses session-based auth, which doesn't work well for our
> mobile apps. We should probably move to token-based auth at some point since it would
> be more modern and easier to work with.

**What's wrong:** "At some point" and "probably" signal no urgency. "More modern" is
not a business justification. Mentions the solution direction (token-based auth).

**After (good):**
> Our mobile apps must re-authenticate users on every app restart because session cookies
> are not persisted across app launches on iOS and Android. This causes 40% of mobile
> users to log in more than 3 times per day, and our mobile NPS score has dropped from
> 42 to 28 over the past quarter — with "login friction" cited in 65% of negative
> reviews. The mobile team is blocked on shipping the offline mode feature until
> authentication can survive app restarts.

**Why it works:** Describes the user-facing symptom (re-authentication), quantifies impact
(40% of users, NPS drop, review citations), and states what is blocked (offline mode
feature). No mention of token-based auth or any solution.

### Example 4: Too Long / Context Bleed

**Before (bad):**
> Our data pipeline was originally built in 2019 when we had 50 customers. At the time,
> we chose a batch processing approach using cron jobs that run every 6 hours. The team
> that built it has since left the company. Over the years, we've added more data sources
> including Salesforce, HubSpot, and our custom event tracking system. The pipeline now
> processes data from 12 sources and serves 3 internal dashboards plus the customer-facing
> analytics feature we launched last year. Recently, customers have been asking for
> real-time data and our largest enterprise client threatened to churn if we can't deliver
> sub-minute data freshness by Q3. The current 6-hour batch cycle means customers see
> stale data for most of the day. Also, the pipeline fails about twice a week and takes
> 2-4 hours to recover because the original team didn't write documentation.

**What's wrong:** This is 8 sentences mixing historical context, current architecture
details, and the actual problem. The real problem is buried.

**After (good):**
> Our data pipeline delivers analytics with a 6-hour delay, but our largest enterprise
> client requires sub-minute data freshness by Q3 or will churn — representing $2.1M ARR.
> Three other enterprise prospects have the same requirement in their RFPs. The pipeline
> also fails twice weekly with 2-4 hour recovery times, eroding customer trust.

**Why it works:** Four sentences focused on the problem: the gap (6-hour vs sub-minute),
the business consequence ($2.1M churn risk + pipeline prospects), and operational pain
(failure frequency). Historical context and architecture details belong in the Context
section.

## Common Mistakes Reference

| Mistake | How to Spot It | How to Fix It |
|---------|---------------|---------------|
| Solution in disguise | Mentions technology names, patterns, or migration targets | Remove technology names; describe the *pain* not the *cure* |
| Vague scope | Uses words like "slow", "better", "improve", "scalable" without numbers | Add a specific metric and its current vs required value |
| Missing urgency | No deadline, threshold, blocker, or consequence mentioned | Add what happens if nothing changes and when it happens |
| Appeal to best practice | Justifies with "industry standard" or "modern" instead of data | Replace with a measurable business or user impact |
| Context bleed | More than 5 sentences; includes history or architecture details | Move history to Context section; keep only the core problem |
| Assumed audience knowledge | References internal systems or acronyms without explanation | Define terms or explain enough for a new team member to understand |
