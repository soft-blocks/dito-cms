#!/usr/bin/env bash
#
# Headless admin + API-key bootstrap for Dito CMS.
#
# Creates the first admin account (or signs in to an existing one) and mints an
# API key — entirely over HTTP, with no browser and no admin UI. This is what
# lets an AI agent become a first-class customer of its own CMS.
#
# It encodes two Better Auth gotchas that are easy to get wrong by hand:
#   1. State-changing auth calls require an `Origin` header that matches the
#      base URL, or they fail with `MISSING_OR_NULL_ORIGIN`.
#   2. The session cookie is HttpOnly; you must persist and replay it with a
#      curl cookie jar between sign-in and api-key/create.
#
# Usage:
#   bootstrap-admin.sh <base-url>
#     <base-url>  e.g. http://localhost:5173  or  https://dito-cms.<sub>.workers.dev
#                 (defaults to http://localhost:5173)
#
# Optional environment variables:
#   DITO_ADMIN_EMAIL     Fresh setup: defaults to agent-<rand>@dito.local.
#                        Existing instance: REQUIRED (to sign in).
#   DITO_ADMIN_PASSWORD  Fresh setup: defaults to a generated value (printed).
#                        Existing instance: REQUIRED (to sign in).
#   DITO_ADMIN_NAME      Display name for a new admin. Default "Admin".
#   DITO_KEY_NAME        Name for the created API key. Default "agent".
#
# On success it prints the API key and writes ./.dito-credentials (gitignored).
#
set -euo pipefail

BASE="${1:-http://localhost:5173}"
BASE="${BASE%/}"
ADMIN_NAME="${DITO_ADMIN_NAME:-Admin}"
KEY_NAME="${DITO_KEY_NAME:-agent}"
COOKIE_JAR="$(mktemp -t dito-cookies.XXXXXX)"
trap 'rm -f "$COOKIE_JAR"' EXIT

say()  { printf '%s\n' "$*" >&2; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*" >&2; }

command -v curl >/dev/null || die "curl is required."

# Escape a string for safe embedding inside a JSON double-quoted value.
json_escape() { printf '%s' "${1:-}" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

# Extract a top-level string field from a JSON blob without requiring jq.
json_str() { sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p" <<<"${2:-}" | head -n1; }

# --- 1. Is this a fresh instance? ------------------------------------------------
say "→ Checking $BASE …"
STATUS_JSON="$(curl -fsS "$BASE/api/setup/status")" \
  || die "Could not reach $BASE/api/setup/status. Is the server up and the URL right?"

if grep -q '"initialized":false' <<<"$STATUS_JSON"; then
  FRESH=1
  EMAIL="${DITO_ADMIN_EMAIL:-agent-$(openssl rand -hex 4 2>/dev/null || echo $RANDOM)@dito.local}"
  if [ -n "${DITO_ADMIN_PASSWORD:-}" ]; then
    PASSWORD="$DITO_ADMIN_PASSWORD"; PW_GENERATED=0
  else
    PASSWORD="$(openssl rand -hex 24 2>/dev/null || echo "dito-$RANDOM-$RANDOM-pw")"; PW_GENERATED=1
  fi
  say "  fresh instance — will create the first admin"
else
  FRESH=0
  EMAIL="${DITO_ADMIN_EMAIL:-}"
  PASSWORD="${DITO_ADMIN_PASSWORD:-}"
  [ -n "$EMAIL" ] && [ -n "$PASSWORD" ] || die \
    "This instance is already initialized. Set DITO_ADMIN_EMAIL and DITO_ADMIN_PASSWORD to sign in and mint a key (or create the key in Settings → API keys)."
  say "  already initialized — will sign in as $EMAIL"
fi

# --- 2. Create the admin (fresh) or sign in (existing) ---------------------------
if [ "$FRESH" = 1 ]; then
  BODY="{\"name\":\"$(json_escape "$ADMIN_NAME")\",\"email\":\"$(json_escape "$EMAIL")\",\"password\":\"$(json_escape "$PASSWORD")\"}"
  RESP="$(curl -sS -c "$COOKIE_JAR" -X POST "$BASE/api/auth/sign-up/email" \
    -H 'content-type: application/json' -H "Origin: $BASE" -d "$BODY" \
    -w $'\n%{http_code}')"
  CODE="${RESP##*$'\n'}"; RESP="${RESP%$'\n'*}"
  [ "$CODE" = 200 ] || die "Sign-up failed (HTTP $CODE): $RESP"
  ok "Created admin $EMAIL"
fi

# Sign in to obtain a fresh session cookie (works for both paths).
BODY="{\"email\":\"$(json_escape "$EMAIL")\",\"password\":\"$(json_escape "$PASSWORD")\"}"
RESP="$(curl -sS -c "$COOKIE_JAR" -X POST "$BASE/api/auth/sign-in/email" \
  -H 'content-type: application/json' -H "Origin: $BASE" -d "$BODY" \
  -w $'\n%{http_code}')"
CODE="${RESP##*$'\n'}"; RESP="${RESP%$'\n'*}"
[ "$CODE" = 200 ] || die "Sign-in failed (HTTP $CODE): $RESP"
grep -qi 'session_token' "$COOKIE_JAR" || die "No session cookie was set on sign-in."
ok "Signed in (session established)"

# --- 3. Mint an API key (needs the cookie jar AND the Origin header) -------------
BODY="{\"name\":\"$(json_escape "$KEY_NAME")\"}"
RESP="$(curl -sS -b "$COOKIE_JAR" -X POST "$BASE/api/auth/api-key/create" \
  -H 'content-type: application/json' -H "Origin: $BASE" -d "$BODY" \
  -w $'\n%{http_code}')"
CODE="${RESP##*$'\n'}"; RESP="${RESP%$'\n'*}"
[ "$CODE" = 200 ] || die "API key creation failed (HTTP $CODE): $RESP"
KEY="$(json_str key "$RESP")"
[ -n "$KEY" ] || die "Could not parse the API key from the response: $RESP"
ok "Created API key \"$KEY_NAME\""

# --- 4. Prove the key works as a Bearer token on the admin API -------------------
ME="$(curl -fsS -H "Authorization: Bearer $KEY" "$BASE/api/admin/me")" \
  || die "The new key failed to authenticate against /api/admin/me."
grep -q '"via":"apikey"' <<<"$ME" || die "Unexpected /api/admin/me response: $ME"
ok "Key authenticates the API ($ME)"

# --- 5. Persist + report ---------------------------------------------------------
CRED_FILE=".dito-credentials"
{
  echo "# Dito CMS credentials — generated by bootstrap-admin.sh. DO NOT COMMIT."
  echo "DITO_URL=$BASE"
  echo "DITO_ADMIN_EMAIL=$EMAIL"
  [ "${PW_GENERATED:-0}" = 1 ] && echo "DITO_ADMIN_PASSWORD=$PASSWORD"
  echo "DITO_API_KEY=$KEY"
} > "$CRED_FILE"
chmod 600 "$CRED_FILE" 2>/dev/null || true

say ""
ok "Done. Wrote $CRED_FILE (gitignored)."
say ""
say "  Base URL : $BASE"
say "  Admin    : $EMAIL"
[ "${PW_GENERATED:-0}" = 1 ] && say "  Password : $PASSWORD   (generated — save it; first run only)"
say "  API key  : $KEY"
say ""
if [ "$FRESH" = 1 ]; then
  say "HOW YOU LOG IN LATER:"
  say "  • Open $BASE/login"
  say "  • Email: $EMAIL"
  [ "${PW_GENERATED:-0}" = 1 ] && say "  • Password: the generated one above (also in $CRED_FILE)"
  say "  • Then change your password under the user menu. There is NO email-based reset"
  say "    (no mail provider), so these credentials are your only way in until you do."
  say ""
fi
say "Next steps:"
say "  • Register the MCP server with Claude Code:"
say "      claude mcp add --transport http dito $BASE/mcp --header \"Authorization: Bearer $KEY\""
say "  • Seed a demo content model:"
say "      DITO_API_KEY=$KEY DITO_URL=$BASE bun run seed"

# Emit the key on stdout so callers can capture it: KEY=$(bootstrap-admin.sh ...)
printf '%s\n' "$KEY"
