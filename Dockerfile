# ─────────────────────────────────────────────────────
# Playwright POM Framework — Docker Image
# ─────────────────────────────────────────────────────
# Uses the official Playwright image which includes
# pre-installed browsers and system dependencies.
# ─────────────────────────────────────────────────────

FROM mcr.microsoft.com/playwright:v1.52.0-noble

# Set working directory
WORKDIR /app

# ── 1. Install dependencies (layer-cached) ──────────
COPY package.json package-lock.json ./
RUN npm ci

# ── 2. Install matching Playwright browsers ─────────
# Re-install to ensure browser versions match the
# @playwright/test version in package.json
RUN npx playwright install --with-deps chromium

# ── 3. Copy project files ───────────────────────────
COPY tsconfig.json playwright.config.ts ./
COPY src/ ./src/
COPY tests/ ./tests/
COPY specs/ ./specs/
COPY test-data/ ./test-data/

# Copy all environment files
COPY env.* ./

# ── 4. Create output directories ────────────────────
RUN mkdir -p test-results playwright-report allure-results logs .auth

# ── 5. Environment defaults ─────────────────────────
ENV CI=true
ENV PW_TEST_HTML_REPORT_OPEN=never
ENV TEST_ENV=qe

# ── 6. Default command ──────────────────────────────
CMD ["npx", "playwright", "test"]

