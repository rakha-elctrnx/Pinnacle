# ==============================================================================
# Pinnacle – Data Explorer for Developers
# ==============================================================================
.PHONY: help dev dev-fe build build-fe build-be check lint format typecheck clean

# Default target
.DEFAULT_GOAL := help

# ── Variables ─────────────────────────────────────────────────────────────────
TAURI_CMD := npm run tauri --
CARGO_MANIFEST := backend/Cargo.toml

# ── Help ──────────────────────────────────────────────────────────────────────
help: ## Show this help message
	@echo ""
	@echo "  Pinnacle – available commands"
	@echo "  ────────────────────────────────────────"
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ── Development ───────────────────────────────────────────────────────────────
dev: ## Run the full Tauri app in dev mode (frontend + backend)
	npm run tauri:dev

dev-fe: ## Run only the Vite frontend dev server
	npm run dev

dev-be: ## Run only the Rust backend (cargo watch)
	cd backend && cargo watch -x run

# ── Build ─────────────────────────────────────────────────────────────────────
build: ## Build the full Tauri app for production
	npm run tauri:build

build-fe: ## Build only the frontend (tsc + vite)
	npm run build

build-be: ## Build only the Rust backend
	cd backend && cargo build --release

# ── Quality ───────────────────────────────────────────────────────────────────
check: lint typecheck ## Run lint + typecheck together

lint: ## Run ESLint
	npm run lint

typecheck: ## Run TypeScript type checking
	npm run typecheck

format: ## Format code with Prettier
	npm run format

clippy: ## Run Rust linter (clippy)
	cd backend && cargo clippy --manifest-path $(CARGO_MANIFEST) -- -D warnings

test-be: ## Run Rust tests
	cd backend && cargo test --manifest-path $(CARGO_MANIFEST)

# ── Cleanup ───────────────────────────────────────────────────────────────────
clean: ## Remove build artifacts (frontend dist + cargo target)
	rm -rf dist
	cd backend && cargo clean

clean-fe: ## Remove only frontend build output
	rm -rf dist node_modules/.vite

clean-be: ## Remove only Rust build output
	cd backend && cargo clean

# ── Misc ──────────────────────────────────────────────────────────────────────
install: ## Install frontend dependencies
	npm install

deps-update: ## Update Rust dependencies
	cd backend && cargo update

preview: ## Preview the built frontend locally
	npm run preview
