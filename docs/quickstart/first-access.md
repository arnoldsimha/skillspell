---
title: "First Access"
description: "Start the dev servers and sign up"
---

# First Access

Start SkillSpell and create your first account.

## Start the development servers

You'll need two terminal windows.

**Terminal 1: Backend (NestJS + API)**
```bash
npm run backend:dev
```

Runs on `http://api.skillspell.localhost:1355`

**Terminal 2: Frontend (React)**
```bash
npm run frontend:dev
```

Runs on `http://skillspell.localhost:1355`

Wait for both servers to start before proceeding.

## Sign up

Open your browser to **`http://skillspell.localhost:1355`**.

You'll see a **registration and onboarding flow**. Complete the signup process to:
- Create your account with any email and password
- Create your organization
- Set up your workspace

You're now running SkillSpell locally! 🎉

## What's next?

- **[CLI Guide](/cli-guide)** — Install and manage skills from your terminal
- **[Skill Tests](/skill-tests-wiki)** — Create test cases and optimize skills
- **[Self-Hosting](/postgres-guide)** — Deploy SkillSpell to production

## Troubleshooting

### Can't access the local development URL?

- Ensure both dev servers are running in separate terminals
- The port may vary if 1355 is in use — check the terminal output for the actual port
- Try clearing your browser cache or opening in an incognito window

### Backend fails to start

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# View database logs
docker logs skillspell-postgres

# Reset the database
npm run db:postgres:down && npm run db:postgres:up
```

### Missing dependencies?

```bash
npm install
npm run build
```

### Frontend won't load

- Ensure the backend is running first (it takes a few seconds to start)
- Check browser console for errors (F12)
- Restart both dev servers

Need help? Open an issue on [GitHub](https://github.com/arnoldsimha/skillspell/issues).
