.PHONY: test test-catalog test-orders up down demo

test: test-catalog test-orders

# Dependencies install inside the image. The host does not run npm or pip.
test-catalog:
	docker run --rm -v "$(CURDIR)/apps/catalog":/app -w /app python:3.12-slim \
		sh -c "pip install -q -r requirements-dev.txt && python -m pytest"

test-orders:
	docker run --rm -v "$(CURDIR)/apps/orders":/app -w /app node:22-alpine \
		sh -c "npm ci && npm test && npm run typecheck"

up:
	docker compose up --build

down:
	docker compose down -v

demo:
	python3 scripts/demo.py
