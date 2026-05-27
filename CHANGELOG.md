# Changelog

All notable changes to this project will be documented in this file.

The format is inspired by Keep a Changelog and this project follows semantic-style release notes.

## [Unreleased]

### Planned
- Add CI pipeline for linting, Docker build validation, and basic smoke tests.
- Add automated test coverage for calculator logic and config API responses.
- Add domain-level health endpoint checks (nginx + Flask) for production monitoring.
- Integrate an exchange-rate API to fetch and cache conversion rates on a schedule.
- Detect user region and auto-select a sensible default display currency based on geolocation.
- Add a manual currency selector so users can override the auto-detected currency anytime.
- Allow users to set and persist a preferred primary currency for all totals and comparisons.
- Show base pricing plus converted values using current rates for the preferred currency.
- Add import and export for saved calculator presets.
- Add Python-powered exportable PDF report generation for calculator results.
- Improve accessibility: keyboard drag support, stronger focus states, and better color contrast checks.
- Add richer metadata in `config.yaml` (film latitude, process notes, expiration notes).
- Add basic analytics-friendly event hooks (privacy-preserving, self-hostable option).

## [2026-05-27] - Production and UX Upgrade

### Added
- Flask backend (`app.py`) to serve static files and expose `/api/config`.
- Server-side YAML parsing with `PyYAML` (`yaml.safe_load`).
- Dockerized runtime with Python slim base image and non-root execution.
- Gunicorn app serving for production container runtime.
- Nginx reverse proxy setup with internal-only app networking.
- API rate limiting for `/api/` endpoints in nginx.
- `.env` and `.env.example` support for deployment configuration.
- `.gitignore` rules for environment files and certificate material.
- Generated runtime nginx config support (`nginx.conf` from template flow).

### Changed
- Frontend now loads runtime config from `/api/config` instead of client-side YAML parsing.
- `config.yaml` is now the primary data source for app settings, film formats, and film brands.
- UI modernized for improved readability, comparison workflow, and responsive behavior.
- README deployment instructions updated to show the live website URL.

### Security
- App container runs as a dedicated non-root user.
- Flask service is not exposed directly to host ports; nginx is the public entrypoint.
- TLS-ready nginx configuration enabled for Let us Encrypt certificate usage.

### Ops
- Added container health checks to improve service readiness and restart behavior.
- Added template-driven nginx startup path for environment-specific domain substitution.

### Credits
- Original project by andikaraditya: https://github.com/andikaraditya/film-calculator
- Fork maintained by MohamedSibaaq: https://github.com/MohamedSibaaq/film-calculator
