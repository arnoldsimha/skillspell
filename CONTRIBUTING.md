# Contributing to SkillSpell

Thank you for your interest in contributing to SkillSpell.

## Getting Started

1. Fork the repository and create a branch from `main`.
2. Run `npm install` at the repo root to install all workspace dependencies.
3. Run `npm run build` to verify the project compiles cleanly.
4. Make your changes with tests where applicable.
5. Open a pull request targeting the `main` branch.

## Development Setup

- Node.js 20+ required
- Backend: `cd packages/backend && npm run start:dev`
- Frontend: `cd packages/frontend && npm run dev`

## Pull Request Guidelines

- Keep PRs focused — one concern per PR.
- Add or update tests for any changed behaviour.
- Ensure `npm run lint` and `npm run build` pass at the repo root before submitting.
- Describe *what* the change does and *why* in the PR description.

## Reporting Issues

Open a GitHub issue with steps to reproduce, expected behaviour, and actual
behaviour. For security vulnerabilities, see [SECURITY.md](./SECURITY.md).

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md).
