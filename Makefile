# SkillSpell — developer convenience targets
# Run `make help` (or just `make`) to list available commands.

.PHONY: help install dev test docker-up docker-down

## help: Show this help message
help:
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

## install: Install all npm dependencies
install:
	npm install

## dev: Start backend + frontend in development mode (hot reload)
dev:
	npm run dev

## test: Run backend unit tests
test:
	npm run test -w packages/backend

## docker-up: Start PostgreSQL and the SkillSpell app via Docker Compose
docker-up:
	npm run docker:up
