.PHONY: run install test lint format check

# preferred way to run common project commands; see AGENTS.md
run:
	npm start

install:
	npm install

test:
	npm test

lint:
	npm run lint

format:
	npm run format

check:
	npm run lint