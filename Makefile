.PHONY: install dev test typecheck build infra-up infra-down app-up observe-up migrate eval providers local
install:
	pnpm install
dev:
	pnpm dev
test:
	pnpm test
typecheck:
	pnpm typecheck
build:
	pnpm build
infra-up:
	docker compose up -d
infra-down:
	docker compose down
app-up:
	docker compose --profile app up -d --build
observe-up:
	docker compose --profile observability up -d
migrate:
	pnpm db:migrate
eval:
	pnpm eval
providers:
	pnpm providers:verify
local:
	pnpm local:setup
