.PHONY: run test lint fmt format

run:
	npm start

test:
	npm test

lint:
	@echo "no project linter configured; run npm test"

fmt format:
	@echo "no formatter configured"
