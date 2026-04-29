#!/usr/bin/env bash
# Cria/configura um bucket publico para instaladores e metadata do Caixa Total Desktop.
#
# Uso:
#   GCP_PROJECT_ID=seu-projeto GCS_DESKTOP_BUCKET=seu-bucket ./scripts/setup-gcs-desktop-bucket.sh

set -euo pipefail

if ! command -v gcloud >/dev/null 2>&1; then
  echo "Erro: gcloud nao encontrado. Instale o Google Cloud SDK."
  exit 1
fi

PROJECT="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
if [[ -z "${PROJECT}" || "${PROJECT}" == "(unset)" ]]; then
  echo "Erro: defina GCP_PROJECT_ID ou rode: gcloud config set project SEU_PROJECT_ID"
  exit 1
fi

REGION="${GCS_DESKTOP_REGION:-us-central1}"
BUCKET="${GCS_DESKTOP_BUCKET:-${PROJECT}-caixa-total-desktop}"
GS_URI="gs://${BUCKET}"

echo "==> Projeto: ${PROJECT}"
echo "==> Bucket:  ${BUCKET} (${REGION})"

if gcloud storage buckets describe "${GS_URI}" --project="${PROJECT}" >/dev/null 2>&1; then
  echo "==> Bucket ja existe: ${GS_URI}"
else
  echo "==> Criando bucket..."
  gcloud storage buckets create "${GS_URI}" \
    --project="${PROJECT}" \
    --location="${REGION}" \
    --uniform-bucket-level-access
fi

echo "==> IAM: allUsers -> storage.objectViewer"
set +e
gcloud storage buckets add-iam-policy-binding "${GS_URI}" \
  --member="allUsers" \
  --role="roles/storage.objectViewer" >/dev/null
RC=$?
set -e
if [[ "${RC}" -ne 0 ]]; then
  echo "    Aviso: nao foi possivel aplicar leitura publica. Verifique politica da organizacao."
fi

CORS_FILE="$(mktemp)"
cat >"${CORS_FILE}" <<'CORSJSON'
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD", "OPTIONS"],
    "responseHeader": ["Content-Type", "Content-Length", "Cache-Control"],
    "maxAgeSeconds": 3600
  }
]
CORSJSON

echo "==> CORS: GET/HEAD publico"
gcloud storage buckets update "${GS_URI}" --cors-file="${CORS_FILE}" >/dev/null
rm -f "${CORS_FILE}"

echo ""
echo "Bucket pronto:"
echo "  GCS_DESKTOP_BUCKET=${BUCKET}"
echo "  DESKTOP_UPDATE_BASE_URL=https://storage.googleapis.com/${BUCKET}"
echo "  NEXT_PUBLIC_DESKTOP_INSTALLER_URL=https://storage.googleapis.com/${BUCKET}/downloads/caixa-total-windows-x64.exe"
