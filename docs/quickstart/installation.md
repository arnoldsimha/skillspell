---
title: "Installation"
description: "Clone, install, and set up the database"
---

# Installation

Set up the SkillSpell repository and database.

## Clone the repository

```bash
git clone https://github.com/arnoldsimha/skillspell.git
cd skillspell
npm install
```

## Set up the database

Start PostgreSQL in Docker:

```bash
npm run db:postgres:up
```

This spins up a PostgreSQL container with the default dev credentials. The database is automatically migrated on startup.

**Verify the database is running:**
```bash
docker ps | grep postgres
```

You should see the `skillspell-postgres` container running.

## Next step

Configure your LLM provider in [Environment Setup](/quickstart/environment-setup).
