#!/usr/bin/env bash
# scripts/generate-mock-saml-keys.sh
# Generates a dev-only RSA key pair for the local mock-saml Docker container.
# Run once after cloning, then copy the output values to packages/backend/.env
#
# Usage: bash scripts/generate-mock-saml-keys.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

TMPDIR_KEYS=$(mktemp -d)
trap "rm -rf ${TMPDIR_KEYS}" EXIT

echo "Generating RSA 2048-bit key pair..."

openssl genrsa -out "${TMPDIR_KEYS}/key.pem" 2048 2>/dev/null
openssl req -new -x509 \
  -key "${TMPDIR_KEYS}/key.pem" \
  -out "${TMPDIR_KEYS}/cert.pem" \
  -days 3650 \
  -subj "/CN=MockSAML Dev/O=SkillSpell Dev/C=US" 2>/dev/null

# Write certificate to docker/saml/ so seed-saml-dev.ts can read it
mkdir -p "${REPO_ROOT}/docker/saml"
cp "${TMPDIR_KEYS}/cert.pem" "${REPO_ROOT}/docker/saml/mock-saml.crt"
echo "Certificate written to docker/saml/mock-saml.crt"
echo ""

# Encode for .env — suppress line wrapping (Linux needs -w 0; macOS base64 does not wrap)
if [[ "$(uname)" == "Darwin" ]]; then
  PRIVATE_KEY=$(base64 < "${TMPDIR_KEYS}/key.pem")
  PUBLIC_KEY=$(base64 < "${TMPDIR_KEYS}/cert.pem")
else
  PRIVATE_KEY=$(base64 -w 0 < "${TMPDIR_KEYS}/key.pem")
  PUBLIC_KEY=$(base64 -w 0 < "${TMPDIR_KEYS}/cert.pem")
fi

echo "Add these values to packages/backend/.env:"
echo ""
echo "MOCK_SAML_PUBLIC_KEY=${PUBLIC_KEY}"
echo "MOCK_SAML_PRIVATE_KEY=${PRIVATE_KEY}"
echo ""
echo "Done. Run 'npm run saml:up' to start the mock-saml container."
