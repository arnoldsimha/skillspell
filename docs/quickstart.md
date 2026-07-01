---
title: "Quick Start"
description: "Get SkillSpell running locally in 5 minutes"
---

# Quick Start

Get SkillSpell running on your machine in minutes.

## Prerequisites

- **Node.js 20+** — Download from [nodejs.org](https://nodejs.org)
- **Docker & Docker Compose** — For PostgreSQL. [Install here](https://www.docker.com/products/docker-desktop)
- **Git** — Clone the repository

## 1. Clone the repository

```bash
git clone https://github.com/arnoldsimha/skillspell.git
cd skillspell
npm install
```

## 2. Set up the database

Start PostgreSQL in Docker:

```bash
npm run db:postgres:up
```

This spins up a PostgreSQL container with the default dev credentials. The database is automatically migrated on startup.

## 3. Configure environment variables

Create a `.env` file in the root (or set them in your shell):

```bash
# Backend (NestJS)
DATABASE_URL=postgresql://skillspell:skillspell@localhost:5432/skillspell
NODE_ENV=development

# LLM Provider (choose one)
LLM_PROVIDER=anthropic  # or: azure, openai, google, bedrock
ANTHROPIC_API_KEY=your_api_key_here
```

For Azure, OpenAI, Google, or Bedrock, see the [README](https://github.com/arnoldsimha/skillspell#environment-setup) for credential setup.

## 4. Start the development servers

In separate terminals:

**Backend (NestJS + API):**
```bash
npm run backend:dev
```
Runs on `http://api.skillspell.localhost:1355`

**Frontend (React):**
```bash
npm run frontend:dev
```
Runs on `http://skillspell.localhost:1355`

## 5. Access SkillSpell

Open your browser to **`http://skillspell.localhost:1355`**.

On first access, you'll see a **registration and onboarding flow**. Complete the signup process to create your account and organization. You can use any email and password for local development.

You're now running SkillSpell locally! 🎉

## Next steps

- **[CLI Guide](/cli-guide)** — Install and manage skills from your terminal
- **[Skill Tests](/skill-tests-wiki)** — Create test cases and optimize skills
- **[Self-Hosting](/postgres-guide)** — Deploy SkillSpell to production

## Troubleshooting

**Can't access the local development URL?**

- Ensure both dev servers are running (`npm run backend:dev` and `npm run frontend:dev` in separate terminals)
- The port may vary if 1355 is in use — check the terminal output for the actual port
- Try clearing your browser cache or opening in an incognito window

**Database connection error?**
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# View logs
docker logs skillspell-postgres

# Reset the database
npm run db:postgres:down && npm run db:postgres:up
```

**Missing dependencies?**
```bash
npm install
npm run build
```

Need help? Open an issue on [GitHub](https://github.com/arnoldsimha/skillspell/issues).
