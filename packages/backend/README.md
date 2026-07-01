<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Multi-Provider LLM Support

All LLM calls go through `LlmService` (`src/generation/llm/llm.service.ts`), the
single provider-agnostic facade every feature injects. It delegates to the runtime
adapter bound to the `LLM_TRANSPORT` token (the `LlmTransport` port); today that
adapter is `StrandsTransport` (`src/generation/llm/transports/strands/`), backed by
the **Strands Agent framework**. The provider is chosen entirely via environment
variables — there is no provider-specific code at any call site, so switching
providers never requires a code change. `StrandsConfigService` owns provider/model
selection.

### Supported providers

| `LLM_PROVIDER` | Models | Required env |
|----------------|--------|--------------|
| `anthropic` (default) | Claude (direct API) | `AI_API_KEY`, `AI_MODEL` |
| `azure` | Claude via Azure AI Foundry | `AI_API_KEY`, `AI_MODEL`, `AI_API_BASE_URL` |
| `bedrock` | Claude via AWS Bedrock | AWS credential chain, `AWS_REGION`, `AI_MODEL`/`BEDROCK_MODEL` |
| `openai` | GPT | `OPENAI_API_KEY`, `OPENAI_MODEL`/`AI_MODEL` |
| `google` | Gemini | `GOOGLE_API_KEY`, `GOOGLE_MODEL`/`AI_MODEL` |

`AI_MODEL_LIGHT` (or the per-provider `*_MODEL_LIGHT`) selects a cheaper model for
lightweight calls (suggestions, diagrams, grading); it falls back to the main model.

### How it works

- **anthropic / azure** speak the Anthropic Messages API, so structured calls use
  native `tool_use` and prompt caching is preserved (cost-optimized).
- **bedrock / openai / google** run through the Strands `Model` abstraction with
  **Zod structured output**, so the same eval/suggestion/grading features work
  unchanged across providers.
- Azure is auto-detected when `AI_API_BASE_URL` contains `azure` (or set
  `LLM_PROVIDER=azure` explicitly).

### Example: switch to Azure AI Foundry

```bash
LLM_PROVIDER=azure
AI_API_BASE_URL=https://your-resource.services.ai.azure.com/anthropic
AI_API_KEY=your-azure-key
AI_MODEL=claude-sonnet-4-6
AI_MODEL_LIGHT=claude-haiku-4-5
```

### Custom providers

Additional providers (Ollama, LiteLLM, etc.) can be added via the Strands SDK's
custom model interface in `StrandsConfigService.getModel()`. To swap the runtime
framework entirely, write a new adapter implementing `LlmTransport` and rebind the
`LLM_TRANSPORT` token in `LlmModule` — no consumer code changes.

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
