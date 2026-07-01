# SkillSpell Evaluation Guide

> **Audience**: Anyone using SkillSpell who wants to understand how the evaluation system works — what types of checks are available, how grading works, and how to get meaningful signals from your test results.

---

## Table of Contents

1. [What Is an Evaluation?](#what-is-an-evaluation)
2. [Test Cases](#test-cases)
3. [Assertion Types](#assertion-types)
   - [Text Match — contains](#text-match--contains)
   - [Text Absence — not contains](#text-absence--not-contains)
   - [Pattern Match — regex](#pattern-match--regex)
   - [Meaning Check — semantic](#meaning-check--semantic)
   - [Custom Criteria — custom](#custom-criteria--custom)
4. [Running Evaluations](#running-evaluations)
   - [Running a Single Case](#running-a-single-case)
   - [Running All Cases at Once](#running-all-cases-at-once)
   - [Running Multiple Times Per Case](#running-multiple-times-per-case)
   - [Baseline Comparison](#baseline-comparison)
   - [Testing Against an Older Version](#testing-against-an-older-version)
5. [How Grading Works](#how-grading-works)
6. [What a Graded Run Shows You](#what-a-graded-run-shows-you)
   - [Result and Score](#result-and-score)
   - [Extracted Claims](#extracted-claims)
   - [Assertion Feedback (Self-Critique)](#assertion-feedback-self-critique)
7. [Benchmarks](#benchmarks)
   - [Summary Statistics](#summary-statistics)
   - [Per-Assertion Breakdown](#per-assertion-breakdown)
   - [Discrimination Analysis](#discrimination-analysis)
   - [Variance and Consistency](#variance-and-consistency)
   - [Iteration History](#iteration-history)
8. [Failure Explanations](#failure-explanations)
   - [Synthesized Explanation](#synthesized-explanation)
   - [AI-Explained](#ai-explained)
9. [Automated Optimization](#automated-optimization)
   - [How the Loop Works](#how-the-loop-works)
   - [Train and Test Split](#train-and-test-split)
   - [Regression Guard](#regression-guard)
10. [AI-Powered Suggestions](#ai-powered-suggestions)
11. [Limits at a Glance](#limits-at-a-glance)

---

## What Is an Evaluation?

An evaluation is a repeatable test: you describe a scenario, define what "good output" looks like, and let the system grade every response Claude produces. Run the same evaluations after each skill change and you can see — concretely — whether the skill got better, stayed the same, or regressed.

Every evaluation produces a **result** (pass, partial, or fail), a **score** from 0 to 100, and a breakdown of which specific criteria passed or failed. Results are saved so you can compare them over time.

---

## Test Cases

A test case captures one scenario. It has four parts:

**Name** — a short label that identifies the scenario, like "Asks for a recommendation" or "Input with no context".

**Prompt** — the user message you want to send to Claude through the skill. This is the actual input the skill will receive. Prompts can be up to 10,000 characters.

**Context** (optional) — background notes you can store alongside the case (up to 10,000 characters) to describe the environment, persona, or prior conversation state the scenario assumes. Note: context is saved with the test case for your reference and for AI suggestion features, but it is **not** currently prepended to the prompt at run time — only the **prompt** field is sent to Claude as the user message. To exercise a specific setup, include it directly in the prompt.

**Assertions** — the criteria that the response must satisfy. These are what actually get graded. You can have between one and three assertions per case (one to three is recommended; more can dilute the signal).

You can also supply an **expected output** — a reference answer that appears alongside the actual response in the comparison view, making it easier to spot differences at a glance. Expected output is not graded directly; it is for human review.

A skill can have up to **50 test cases**.

---

## Assertion Types

Assertions are the heart of the evaluation system. Each assertion checks one thing about the response. There are five types, split into two groups: **deterministic** (instant, free) and **AI-powered** (uses Claude to grade).

---

### Text Match — contains

**Group:** deterministic

Passes when the response includes a specific word or phrase. The check ignores upper/lower case.

**Example use:** You have a skill that produces meeting summaries. You add a *contains* assertion for the phrase "action items" to make sure every summary includes that section header.

**When to use:** Whenever a specific word, phrase, or label should always appear in the output.

---

### Text Absence — not contains

**Group:** deterministic

Passes when the response does *not* include the specified phrase. Also case-insensitive.

**Example use:** You want to make sure a customer-facing writing skill never produces the phrase "I cannot help with that". Add a *not contains* assertion for that phrase.

**When to use:** Guarding against refusal language, banned phrases, internal jargon that should never surface to end users, or debugging artifacts.

---

### Pattern Match — regex

**Group:** deterministic

Passes when the response matches a regular expression pattern. Useful for structural checks that are more flexible than a fixed phrase but still fully mechanical.

**Example use:** A skill that produces structured reports should always start with a heading. A regex assertion checks that the first line looks like a markdown heading without needing to know the exact heading text.

**When to use:** Checking format, structure, or the presence of typed values (dates, numbers, URLs) where the exact content varies but the shape is fixed.

---

### Meaning Check — semantic

**Group:** AI-powered

Passes when Claude, acting as a grader, judges that the response satisfies a criterion written in plain English. The grader reads your criterion, reads the response, and decides: does the response meet this standard?

**Example use:** "The response directly answers the user's question without unnecessary hedging or qualifications." Claude will read both the question and the answer and decide whether that standard is met — something a text match could never do.

**When to use:** Quality dimensions that can't be expressed as patterns — completeness, relevance, accuracy, appropriate tone, absence of hallucination.

---

### Custom Criteria — custom

**Group:** AI-powered

The most flexible assertion type. You write any criterion you want — including multi-part conditions, style rules, or domain-specific standards — and Claude grades the response against it.

**Example use:** "Uses active voice throughout. Avoids technical jargon. Ends with a concrete next step that the reader can take today." That is one assertion with three sub-conditions. Claude evaluates all three together.

**When to use:** When your quality bar is nuanced, involves multiple conditions at once, or reflects standards from a style guide or domain that are hard to break into separate assertions.

---

## Running Evaluations

### Running a Single Case

Select a test case and click **Run**. The skill is sent to Claude as the system prompt, your test prompt is sent as the user message, Claude generates a response, and the response is graded immediately. The whole cycle takes a few seconds for deterministic assertions and 5–10 seconds when AI assertions are involved.

### Running All Cases at Once

Use **Run All** to evaluate every test case in one batch. Cases run up to three at a time in the background. Results appear as they complete.

### Running Multiple Times Per Case

Set a **runs per case** number (up to 5) to run the same case multiple times in one batch. Claude is not deterministic — the same prompt can produce different responses on different runs. Running multiple times surfaces that variance and gives you a more reliable pass rate per case.

### Baseline Comparison

Enable **compare to baseline** to run each case a second time *without* the skill active — just the raw model with no system prompt. The baseline result appears side-by-side with the skill result so you can see exactly how much the skill changes the output. Baseline data also powers the [discrimination analysis](#discrimination-analysis) in the benchmark view.

### Testing Against an Older Version

Choose a specific **version** to run your test cases against a previous snapshot of the skill. Use this to confirm that an older version was better on a specific dimension, or to verify that a regression you spotted in the benchmark actually started with a particular version change.

---

## How Grading Works

When a run completes, grading happens in two passes:

**Deterministic pass** — contains, not contains, and regex assertions are evaluated instantly against the response text. No AI is involved; these assertions always produce the same result for the same input.

**AI pass** — semantic and custom assertions are batched into a single request to Claude. Claude reads the skill, the prompt, the response, and all AI assertions together and grades each one. The grader always uses temperature 0 so its verdicts are as consistent as possible. All AI assertions for one run are graded in one call, not one call per assertion.

Results from both passes are merged into a single grading result for the run.

---

## What a Graded Run Shows You

### Result and Score

Every run gets one of four overall results:

| Result | What it means |
|---|---|
| **Pass** | Every assertion passed |
| **Partial** | Some assertions passed, some failed |
| **Fail** | Every assertion failed |
| **Error** | The run itself failed (timeout, API error) — not a skill quality issue |

The score (0–100) is the weighted fraction of assertions that passed. A run where 2 of 3 assertions pass scores roughly 67.

### Extracted Claims

The AI grader automatically extracts up to ten **verifiable claims** from the response — specific statements that could, in principle, be checked for accuracy. Claims fall into three categories:

- **Factual claims** — statements about the world ("Paris is the capital of France", "this function runs in O(n) time")
- **Process claims** — statements about what the response does or how it works ("the steps are listed in order", "the example covers the edge case")
- **Quality claims** — judgments about the response itself ("the explanation is clear", "no jargon was used")

Each claim comes with a confidence score. Reviewing extracted claims is a fast way to spot hallucinations or factual errors without needing to write an assertion for every possible thing the model might say.

### Assertion Feedback (Self-Critique)

For runs where the skill is active, the grader also evaluates the **assertions themselves**. It surfaces:

- Per-assertion critiques — for example, "this criterion is too vague to grade consistently" or "the assertion would be clearer if the expected output specified the format"
- General gaps — edge cases the test suite doesn't cover, types of outputs that have no assertions

This feedback is not about whether the skill failed — it is about whether your test suite is well-designed. Use it to improve your assertions so that future grades are more meaningful.

---

## Benchmarks

The benchmark view aggregates all runs across all test cases for a skill into a single dashboard.

### Summary Statistics

The top of the benchmark shows the overall pass rate (what percentage of all runs passed all assertions), the mean score across runs, and how both have trended over time.

### Per-Assertion Breakdown

Each assertion gets its own row showing its historical pass rate, mean score contribution, and variance across multiple runs. Assertions that consistently fail are easy to spot here. Assertions with high variance are candidates for [replacement suggestions](#ai-powered-suggestions).

### Discrimination Analysis

When you have run evaluations with baseline comparison enabled, each assertion gets a **discrimination label** that tells you what role the skill is actually playing for that criterion:

| Label | What it means |
|---|---|
| **Skill adds value** | The skill's pass rate is more than 10 points higher than the baseline on this criterion. The skill is helping. |
| **Skill hurts** | The baseline pass rate is more than 10 points higher. The skill is making the output *worse* on this criterion — worth investigating. |
| **Non-discriminating** | The criterion passes ≥95% of the time both with and without the skill. The assertion may be too easy to be informative. |
| **Broken** | The criterion passes ≤5% of the time in both configurations. It may be too strict or incorrectly written. |
| **Inconclusive** | No baseline data, or the with-skill and baseline pass rates are within 10 points of each other (and not both near the top or bottom). Run more cases with baseline comparison enabled to classify it. |

Discrimination analysis is the most actionable part of the benchmark. A "skill hurts" label is a direct signal that something in the skill is interfering with a quality dimension you care about.

### Variance and Consistency

When cases are run more than once, the benchmark tracks the spread of scores across those runs. High variance on a deterministic assertion is impossible — those always return the same verdict. High variance on a semantic or custom assertion means the grader's verdict is unstable, which usually means the criterion is ambiguous. The benchmark flags runs that score more than two standard deviations from the mean as outliers.

### Iteration History

Each batch of eval runs is stamped with an iteration number (every "Run All" execution gets the next number in sequence), and the benchmark groups the saved runs by that number to build a timeline. For each iteration it shows the pass rate, the mean score, the delta versus the previous iteration (a win/loss/tie), and which skill version the runs were executed against. This makes it easy to identify which iteration produced a breakthrough and to roll back to the version that produced it if a later change undid the improvement.

Note: the automated optimizer reports its own per-iteration progress live while it runs (over its streaming connection), but those in-loop eval runs are executed in memory and are not persisted, so they do not appear in this saved timeline — only runs you execute through "Run" / "Run All" do.

---

## Failure Explanations

When a test case fails you need to know *why*, not just that it failed. The system picks one of two modes automatically based on how complex the failure is — you don't choose between them. A failure with **one or two** failed assertions that each have evidence is synthesized locally; anything more complex (three or more failed assertions, or missing evidence) is escalated to an AI explanation.

### Synthesized Explanation

For simple failures, the explanation is built directly from the existing grading data — no extra LLM call. It aggregates the per-assertion failure reasons into a structured summary and pulls suggestions from the grader's self-critique (falling back to generic, assertion-type-specific advice when none are present).

For example: a run failed the "contains: action items" assertion, and the evidence shows the response jumped straight from the summary to the closing without a dedicated section — suggesting the skill doesn't explicitly instruct Claude to include one.

This mode is instant and free.

### AI-Explained

For more complex failures, the failed run is sent to Claude (using the lightweight model) for root-cause analysis. It returns an explanation of what likely caused the failure, which part of the skill (or the test prompt itself) is the probable source, and a suggested fix.

---

## Automated Optimization

The optimization loop automates the revise-and-test cycle. Instead of editing the skill manually and re-running tests, you trigger the optimizer and it iterates on the skill draft until the eval scores reach a target — or until the iteration budget is exhausted.

### How the Loop Works

The optimizer runs in cycles. In each cycle it:

1. Runs the training test cases against the current draft and collects the failure signals
2. Clusters the failures by theme and sends the top cluster, the current draft, and the list of currently-passing assertions to Claude, which proposes a revised draft
3. Runs the held-out test cases against the new draft to check whether it actually improved
4. If the test score is a new high, it records the iteration as the new best draft and continues
5. If the test score is *strictly lower* than the best so far, it reverts the working draft to that best draft before continuing. A score that stays flat is kept (not reverted) but does not become the new best

The loop stops when the target pass rate is reached **and confirmed stable** (the optimizer runs one extra iteration after hitting the target rather than stopping immediately), when the iteration budget runs out, or when the score plateaus — defined as no improvement across a window of the last three iterations (requires at least three completed iterations).

If you enable "include feedback" and there is **negative or neutral** feedback (or historical failed/partial runs) on the current version, the optimizer runs at least two iterations so it can incorporate that signal — iteration 1 applies the feedback and iteration 2 evaluates the result. Positive (thumbs-up) feedback is not used as an improvement signal.

### Train and Test Split

Before optimization starts, your test cases are divided into two groups: a **training set** (60%) and a **test set** (40%). The split is deterministic — cases are sorted by ID and the first 60% become the training set — so the same cases land in the same group on every run. The optimizer only sees failure signals from the training set when generating revisions. The test set is used only to validate the revised draft. This prevents the optimizer from simply writing a skill that memorises your training cases without actually getting better at the underlying task.

### Regression Guard

Before carrying a draft into the next iteration, the optimizer compares the new draft's test-set score to the best score it has achieved so far. If the new score is strictly lower, the working draft is reverted to the best draft (and a `regression-detected` event is emitted) before the next iteration begins. The best draft is always preserved, so the optimizer can never finish worse than its best iteration. Separately, a proposed revision that fails structural validation (for example, it drops a large fraction of the skill's section headings or removes all files in a category) is rejected outright, keeping the current draft.

---

## AI-Powered Suggestions

**Test case generation** — SkillSpell can look at your skill's description and existing test cases and suggest new ones you haven't written yet. Suggestions come with a prompt, recommended assertions, and a brief explanation of what scenario they cover. You can request up to **50** cases in one generation (large requests are produced in batches of 20, with earlier batches' names fed forward to avoid duplicates), and SkillSpell can also recommend an ideal count for you (clamped to between 3 and 30). Generation runs a skill-analysis pre-pass and aims for a spread of happy-path scenarios, edge cases, and adversarial inputs. There is a separate inline **prompt suggestion** helper that returns up to 5 prompt ideas while you are authoring a single case.

**Assertion replacement** — For **non-discriminating** assertions (ones that pass at nearly the same rate with and without the skill, surfaced by the discrimination analysis), you can request a replacement suggestion. The suggestion engine looks at the assertion and its with-skill vs. baseline pass rates and produces a more precisely specified or more discriminating alternative.

---

## Limits at a Glance

| What | Limit |
|---|---|
| Test cases per skill | 50 |
| Assertions per case (recommended) | 1–3 |
| Prompt length | 10,000 characters |
| Context length | 10,000 characters |
| Expected output length | 50,000 characters |
| Response considered for grading | First 15,000 characters |
| Runs per case in one batch | Up to 5 |
| Cases running at the same time (manual) | 3 |
| Cases running at the same time (optimization) | 5 |
| Extracted claims per run | Up to 10 |
| Bulk test case creation | Up to 50 at once |
