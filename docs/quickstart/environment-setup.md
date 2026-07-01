---
title: "Environment Setup"
description: "Configure your LLM provider and API credentials"
---

# Environment Setup

Configure SkillSpell to use your preferred LLM provider.

## Create the `.env` file

In the project root, create a `.env` file:

```bash
# Backend (NestJS)
DATABASE_URL=postgresql://skillspell:skillspell@localhost:5432/skillspell
NODE_ENV=development

# LLM Provider (choose one below)
LLM_PROVIDER=anthropic  # or: azure, openai, google, bedrock
```

## Choose your LLM provider

### Anthropic (recommended)

```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

Get your API key from [console.anthropic.com](https://console.anthropic.com/account/keys).

### Azure

```bash
LLM_PROVIDER=azure
AZURE_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_API_KEY=your-key-here
AZURE_DEPLOYMENT_ID=your-deployment-id
```

See [Azure OpenAI documentation](https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/create-resource) for setup.

### OpenAI

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

Get your API key from [platform.openai.com](https://platform.openai.com/account/api-keys).

### Google

```bash
LLM_PROVIDER=google
GOOGLE_API_KEY=your-key-here
```

Get your API key from [ai.google.dev](https://ai.google.dev/gemini-api).

### Bedrock (AWS)

```bash
LLM_PROVIDER=bedrock
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key-id
AWS_SECRET_ACCESS_KEY=your-secret-key
```

See [AWS Bedrock documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-bedrock.html) for setup.

## Verify your setup

Test your configuration by starting the backend:

```bash
npm run backend:dev
```

If the connection is successful, you'll see the backend running without errors.

## Next step

Start the development servers in [First Access](/quickstart/first-access).
