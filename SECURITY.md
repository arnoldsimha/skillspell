# Security Policy

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report privately using GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability):

1. Open the **Security** tab of this repository.
2. Click **Report a vulnerability**.
3. Include a description, reproduction steps, affected version/commit, and an impact assessment.

We aim to acknowledge reports within 5 business days and will keep you updated as we
investigate and ship a fix. Once a fix is released, we're happy to credit reporters who
wish to be acknowledged.

## Supported Versions

Security fixes are applied to the latest released version on the default branch. There is
no guarantee of backported fixes for older versions.

## Handling Secrets

SkillSpell never commits real credentials. All `.env` files are git-ignored; only
`.env.example` templates with placeholder values are tracked. If you believe a secret has
been committed, report it via the private channel above rather than opening a public issue.
