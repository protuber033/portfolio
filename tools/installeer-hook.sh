#!/usr/bin/env bash
# Zet de controle voor het pushen terug. Nodig na een verse clone,
# want git-hooks gaan niet mee in de repository.
#
#   bash tools/installeer-hook.sh
set -euo pipefail

WORTEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="$WORTEL/.git/hooks/pre-push"

cat > "$HOOK" <<'EOF'
#!/bin/sh
echo ""
echo "Controle voor het pushen..."
if ! npm run --silent check; then
  echo ""
  echo "Er staan fouten in. De push is afgebroken."
  echo "Los ze op, of push bewust langs de controle heen met:  git push --no-verify"
  exit 1
fi
exit 0
EOF

chmod +x "$HOOK"
echo "Klaar. Vanaf nu draait 'npm run check' voor elke push."
