import os
from flask import Flask, jsonify, send_from_directory, abort, request
import yaml

app = Flask(__name__)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.yaml")

# ── Security configuration ────────────────────────────────────────────────────

# Only these top-level config.yaml keys are forwarded to the client.
# Any future sensitive keys (credentials, internal flags, etc.) are never exposed.
# OWASP A03: Prevents data over-exposure / excessive data exposure.
_CONFIG_ALLOWLIST = frozenset({"app", "film_formats", "film_brands"})

# Origins permitted to make cross-origin requests to /api/.
# OWASP A01: Broken Access Control — reject unknown origins.
_DOMAIN = os.environ.get("DOMAIN", "localhost")
_ALLOWED_ORIGINS = {
    f"https://{_DOMAIN}",
    f"http://{_DOMAIN}",
    "http://localhost:5000",   # local development only
}


# ── Security headers ──────────────────────────────────────────────────────────

@app.after_request
def set_security_headers(response):
    """Attach OWASP-recommended security headers to every response.

    nginx already sets several of these for production traffic, but applying
    them here too ensures they are present even in local development and
    provides defence-in-depth (NIST SP 800-53 SC-8, OWASP A05).
    """
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault(
        "Permissions-Policy", "geolocation=(), microphone=(), camera=()"
    )
    response.headers.setdefault("X-Permitted-Cross-Domain-Policies", "none")

    if request.path.startswith("/api/"):
        # Prevent caching of API responses — no stale config data in proxies/browsers.
        response.headers["Cache-Control"] = "no-store"
        # Tell search engines and crawlers not to index the API endpoint.
        response.headers["X-Robots-Tag"] = "noindex, nofollow"

    return response


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/api/config")
def get_config():
    """Return only the allowlisted subset of config.yaml as JSON.

    Security controls applied:
    - Cross-origin requests from unlisted origins are rejected with 403
      (OWASP A01 — Broken Access Control).
    - Only allowlisted top-level keys are returned; internal config keys
      such as 'site' metadata are stripped before the response is sent
      (OWASP A03 — Sensitive Data Exposure / excessive data exposure).
    - File read and YAML parse errors are caught and converted to a generic
      500 without leaking internal paths or exception details to the caller
      (OWASP A09 — Security Logging and Monitoring Failures).
    """
    origin = request.headers.get("Origin", "")

    # Reject cross-origin requests from unlisted origins.
    if origin and origin not in _ALLOWED_ORIGINS:
        abort(403)

    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            raw = yaml.safe_load(f)
    except (OSError, yaml.YAMLError):
        # Do not leak file path or parse details to the caller.
        abort(500)

    if not isinstance(raw, dict):
        abort(500)

    # Apply allowlist — never forward keys outside _CONFIG_ALLOWLIST.
    data = {k: raw[k] for k in _CONFIG_ALLOWLIST if k in raw}

    response = jsonify(data)

    # Set CORS headers only for recognised origins.
    if origin in _ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
    response.headers["Access-Control-Allow-Methods"] = "GET"

    return response


@app.route("/", defaults={"path": "index.html"})
@app.route("/<path:path>")
def static_files(path):
    """Serve static files from the project root.

    Flask's send_from_directory prevents directory traversal attacks by
    resolving the path relative to BASE_DIR and rejecting paths that
    escape it (OWASP A01 — Path Traversal).
    """
    return send_from_directory(BASE_DIR, path)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
