#!/usr/bin/env bash
#
# Deploy film-calculator to an Ubuntu server: installs Docker and Caddy if
# missing, starts the app container (bound to 127.0.0.1 only), and wires
# this repo's Caddyfile into a shared host Caddyfile at /etc/caddy/Caddyfile
# via `import /opt/*/Caddyfile` so Caddy can front this app plus any others.
#
# Usage (run from the deployed repo directory, e.g. /opt/film-calculator):
#   sudo ./deploy.sh
#
# Idempotent: safe to re-run for updates (git pull && ./deploy.sh).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

CADDY_CONF_DIR="/etc/caddy"
CADDYFILE="$CADDY_CONF_DIR/Caddyfile"
CADDY_OVERRIDE_DIR="/etc/systemd/system/caddy.service.d"
IMPORT_LINE="import /opt/*/Caddyfile"

log()  { echo -e "\033[1;32m==>\033[0m $*"; }
warn() { echo -e "\033[1;33m==> WARNING:\033[0m $*"; }
die()  { echo -e "\033[1;31m==> ERROR:\033[0m $*" >&2; exit 1; }

# ── Preflight ─────────────────────────────────────────────────────────────

[[ "$(id -u)" -eq 0 ]] || die "Run this script with sudo: sudo ./deploy.sh"

command -v apt-get >/dev/null 2>&1 || die "This script targets Ubuntu/Debian (apt-get not found)."

if [[ ! -f .env ]]; then
    [[ -f .env.example ]] || die ".env.example not found — run this from the film-calculator repo root."
    cp .env.example .env
    warn "Created .env from .env.example — edit DOMAIN before re-running, then run this script again."
    exit 1
fi

# shellcheck disable=SC1091
set -a; source .env; set +a

: "${DOMAIN:?DOMAIN must be set in .env}"
: "${PORT:=5000}"

if [[ "$DOMAIN" == "yourdomain.com" ]]; then
    die "DOMAIN in .env is still the placeholder 'yourdomain.com' — set your real domain first."
fi

log "Deploying film-calculator for DOMAIN=$DOMAIN PORT=$PORT"

# The Caddyfile's `import /opt/*/Caddyfile` glob (below) only ever picks up
# an app whose repo lives directly under /opt/<name>/. Deploying anywhere
# else means this app's Caddyfile snippet silently never gets imported.
case "$SCRIPT_DIR" in
    /opt/*/*) die "Unexpected nesting: $SCRIPT_DIR is more than one level under /opt — the /opt/*/Caddyfile import glob won't match it." ;;
    /opt/*) ;;
    *) warn "$SCRIPT_DIR is not directly under /opt/ — the host Caddyfile's 'import /opt/*/Caddyfile' glob won't pick up this app's Caddyfile. Deploy to /opt/film-calculator/ or adjust the import glob in $CADDYFILE." ;;
esac

# ── Base tools ────────────────────────────────────────────────────────────
# Needed below regardless of whether Docker/Caddy are already installed
# (e.g. a minimal cloud image with Docker preinstalled but no curl).

if ! command -v curl >/dev/null 2>&1; then
    apt-get update -qq
    apt-get install -y -qq curl
fi

# ── Docker ────────────────────────────────────────────────────────────────

if ! command -v docker >/dev/null 2>&1; then
    log "Docker not found — installing Docker Engine from Docker's official apt repo..."
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    ARCH="$(dpkg --print-architecture)"
    CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
    echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable --now docker
else
    log "Docker already installed, skipping."
fi

# ── Caddy ─────────────────────────────────────────────────────────────────

if ! command -v caddy >/dev/null 2>&1; then
    log "Caddy not found — installing from Caddy's official apt repo..."
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl gnupg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
        | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
        > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y -qq caddy
else
    log "Caddy already installed, skipping package install."
fi

# The stock apt package has no third-party modules. This Caddyfile's
# rate_limit directive needs caddy-ratelimit, so fetch a custom static
# build via Caddy's own build API and swap it into the package-managed
# binary path — this keeps apt's systemd unit, dedicated user, and
# CAP_NET_BIND_SERVICE grant intact; only the executable itself changes.
CADDY_BIN="$(command -v caddy)"
if "$CADDY_BIN" list-modules 2>/dev/null | grep -q '^http.handlers.rate_limit'; then
    log "Caddy binary already has the rate_limit module, skipping rebuild."
else
    log "Fetching a Caddy build with the caddy-ratelimit module (this can take a minute)..."
    CADDY_ARCH="$(dpkg --print-architecture)"   # amd64/arm64 — matches Caddy's arch= param
    TMP_CADDY="$(mktemp)"
    curl --fail --silent --show-error -o "$TMP_CADDY" \
        "https://caddyserver.com/api/download?os=linux&arch=${CADDY_ARCH}&p=github.com/mholt/caddy-ratelimit" \
        || { rm -f "$TMP_CADDY"; die "Failed to download the custom Caddy build."; }
    chmod 755 "$TMP_CADDY"
    "$TMP_CADDY" version >/dev/null 2>&1 \
        || { rm -f "$TMP_CADDY"; die "Downloaded Caddy binary won't run — not replacing $CADDY_BIN."; }
    mv "$TMP_CADDY" "$CADDY_BIN"
    log "Installed custom Caddy build with rate_limit support at $CADDY_BIN."
fi

# ── Firewall ──────────────────────────────────────────────────────────────

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
    log "Opening ports 80/443 in ufw..."
    ufw allow 80/tcp >/dev/null
    ufw allow 443/tcp >/dev/null
else
    warn "ufw not active or not installed — make sure ports 80/443 are reachable another way."
fi

# ── App container ─────────────────────────────────────────────────────────

log "Building and starting the film-calculator container..."
docker compose up -d --build

log "Waiting for the app to become healthy..."
for _ in $(seq 1 30); do
    if curl --fail --silent "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
        break
    fi
    sleep 2
done
curl --fail --silent "http://127.0.0.1:${PORT}/" >/dev/null 2>&1 \
    || { docker compose logs --tail=50; die "App container did not become healthy on 127.0.0.1:${PORT}."; }
log "App container is up on 127.0.0.1:${PORT}."

# ── Host Caddyfile ────────────────────────────────────────────────────────

mkdir -p "$CADDY_CONF_DIR"

if [[ ! -f "$CADDYFILE" ]]; then
    log "Creating $CADDYFILE with a global options block and the import glob..."
    cat > "$CADDYFILE" <<EOF
{
    # email you@example.com
}

$IMPORT_LINE
EOF
elif grep -qF "$IMPORT_LINE" "$CADDYFILE"; then
    log "$CADDYFILE already imports $IMPORT_LINE, skipping."
else
    BACKUP="${CADDYFILE}.bak.$(date +%Y%m%d%H%M%S)"
    log "Appending '$IMPORT_LINE' to existing $CADDYFILE (backup saved to $BACKUP)..."
    cp "$CADDYFILE" "$BACKUP"
    printf '\n%s\n' "$IMPORT_LINE" >> "$CADDYFILE"
fi

# ── Caddy environment (app-prefixed, not generic DOMAIN/PORT) ──────────────
#
# Every drop-in file under caddy.service.d/ contributes to ONE shared
# process environment for the single Caddy service. Using generic DOMAIN/
# PORT names here would let a second app's override silently clobber this
# app's values (whichever conf file sorts last wins). Values are baked in
# literally (not via EnvironmentFile) so each app's override is self-
# contained and independent of any other app's .env layout.

mkdir -p "$CADDY_OVERRIDE_DIR"
OVERRIDE_FILE="$CADDY_OVERRIDE_DIR/film-calculator.conf"
log "Writing systemd env override for Caddy at $OVERRIDE_FILE..."
cat > "$OVERRIDE_FILE" <<EOF
[Service]
Environment=FILM_CALCULATOR_DOMAIN=$DOMAIN
Environment=FILM_CALCULATOR_PORT=$PORT
EOF
# Not secret today (just DOMAIN/PORT), but root-only by default anyway —
# so this stays safe if a future app copies the pattern for real secrets.
chmod 600 "$OVERRIDE_FILE"
systemctl daemon-reload

log "Validating Caddy config..."
FILM_CALCULATOR_DOMAIN="$DOMAIN" FILM_CALCULATOR_PORT="$PORT" \
    caddy validate --config "$CADDYFILE" --adapter caddyfile \
    || die "Caddy config validation failed — check $CADDYFILE and $SCRIPT_DIR/Caddyfile."

log "Restarting Caddy..."
systemctl enable caddy
# restart, not reload: a graceful config reload does not pick up new or
# changed environment variables on an already-running process.
systemctl restart caddy

log "Deployment complete. https://${DOMAIN}/ should be live once DNS points at this server"
log "(Caddy obtains its Let's Encrypt certificate automatically on first request)."
