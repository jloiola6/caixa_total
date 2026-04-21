#!/usr/bin/env bash
# Cria bucket GCS para fotos de produto, IAM (leitura pública + escrita para a SA do runtime),
# CORS para PUT no browser. Opcionalmente corre migração Neon -> GCS.
#
# Pré-requisitos: Google Cloud SDK (gcloud) autenticado e projeto configurado.
#
# Uso:
#   cd back && chmod +x scripts/setup-gcs-product-bucket.sh && ./scripts/setup-gcs-product-bucket.sh
#
# Variáveis opcionais:
#   GCP_PROJECT_ID     — projeto (default: gcloud config get-value project)
#   GCS_BUCKET_NAME    — nome único global (default: ${PROJECT_ID}-caixa-product-images)
#   GCS_REGION         — default: us-central1
#   CLOUD_RUN_SA_EMAIL — SA do backend no Cloud Run (default: PROJECT_NUMBER-compute@developer.gserviceaccount.com)
#   RUN_MIGRATE=1      — corre pnpm migrate:images-gcs (precisa DATABASE_URL em env ou back/.env)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "Erro: gcloud não encontrado. Instale o Google Cloud SDK."
  exit 1
fi

PROJECT="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
if [[ -z "${PROJECT}" || "${PROJECT}" == "(unset)" ]]; then
  echo "Erro: defina GCP_PROJECT_ID ou: gcloud config set project SEU_PROJECT_ID"
  exit 1
fi

REGION="${GCS_REGION:-us-central1}"
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT}" --format='value(projectNumber)')"
DEFAULT_COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
RUNTIME_SA="${CLOUD_RUN_SA_EMAIL:-${DEFAULT_COMPUTE_SA}}"
SERVERLESS_ROBOT_SA="service-${PROJECT_NUMBER}@serverless-robot-prod.iam.gserviceaccount.com"

BUCKET="${GCS_BUCKET_NAME:-${PROJECT}-caixa-product-images}"
PUBLIC_BASE="https://storage.googleapis.com/${BUCKET}"
GS_URI="gs://${BUCKET}"

echo "==> Projeto: ${PROJECT}"
echo "==> Bucket:  ${BUCKET} (${REGION})"
echo "==> SA escrita (Object Admin): ${RUNTIME_SA}"

if gcloud storage buckets describe "${GS_URI}" --project="${PROJECT}" >/dev/null 2>&1; then
  echo "==> Bucket já existe: ${GS_URI}"
else
  echo "==> A criar bucket..."
  gcloud storage buckets create "${GS_URI}" \
    --project="${PROJECT}" \
    --location="${REGION}" \
    --uniform-bucket-level-access
fi

echo "==> IAM: allUsers -> storage.objectViewer (leitura pública)"
set +e
gcloud storage buckets add-iam-policy-binding "${GS_URI}" \
  --member="allUsers" \
  --role="roles/storage.objectViewer" 2>/dev/null
RC=$?
set -e
if [[ "$RC" -ne 0 ]]; then
  echo "    (Aviso: pode já existir a binding ou política da org bloquear allUsers. Verifique no IAM do bucket.)"
fi

echo "==> IAM: ${RUNTIME_SA} -> storage.objectAdmin"
set +e
gcloud storage buckets add-iam-policy-binding "${GS_URI}" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/storage.objectAdmin" 2>/dev/null
RC=$?
set -e
if [[ "$RC" -ne 0 ]]; then
  echo "    (Aviso: binding já existente ou SA incorreta. Defina CLOUD_RUN_SA_EMAIL se o Cloud Run usar outra conta.)"
fi

echo "==> IAM: ${RUNTIME_SA} -> iam.serviceAccountTokenCreator (URL assinada v4)"
set +e
gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA}" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project="${PROJECT}" 2>/dev/null
RC=$?
set -e
if [[ "$RC" -ne 0 ]]; then
  echo "    (Aviso: falhou ao conceder TokenCreator na SA de runtime. Verifique permissões de IAM.)"
fi

echo "==> IAM: ${SERVERLESS_ROBOT_SA} -> iam.serviceAccountTokenCreator em ${RUNTIME_SA} (Cloud Run)"
set +e
gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA}" \
  --member="serviceAccount:${SERVERLESS_ROBOT_SA}" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project="${PROJECT}" 2>/dev/null
RC=$?
set -e
if [[ "$RC" -ne 0 ]]; then
  echo "    (Aviso: falhou ao conceder TokenCreator para o service agent do Cloud Run. Verifique permissões de IAM.)"
fi

CORS_FILE="$(mktemp)"
# Origem * permite PUT desde qualquer host (adequado para testes). Em produção restrinja no console GCS.
cat >"${CORS_FILE}" <<'CORSJSON'
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD", "PUT", "OPTIONS"],
    "responseHeader": ["Content-Type", "Content-Length", "x-goog-resumable"],
    "maxAgeSeconds": 3600
  }
]
CORSJSON

echo "==> CORS (origem * — restrinja em produção no console do bucket)"
gcloud storage buckets update "${GS_URI}" --cors-file="${CORS_FILE}"
rm -f "${CORS_FILE}"

echo ""
echo "-------------------------------------------------------------------"
echo "Defina no Cloud Run e em back/.env:"
echo ""
echo "  GCS_BUCKET_NAME=${BUCKET}"
echo "  GCS_PUBLIC_BASE_URL=${PUBLIC_BASE}"
echo ""
echo "Exemplo Cloud Run:"
echo "  gcloud run services update caixa-total-back --region=${REGION} \\"
echo "    --update-env-vars=GCS_BUCKET_NAME=${BUCKET},GCS_PUBLIC_BASE_URL=${PUBLIC_BASE}"
echo "-------------------------------------------------------------------"

if [[ "${RUN_MIGRATE:-0}" == "1" ]]; then
  echo "==> Migração (RUN_MIGRATE=1)..."
  cd "${BACK_DIR}"
  export GCS_BUCKET_NAME="${BUCKET}"
  export GCS_PUBLIC_BASE_URL="${PUBLIC_BASE}"
  if [[ -z "${DATABASE_URL:-}" && -f .env ]]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
  fi
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "Erro: defina DATABASE_URL ou use back/.env com DATABASE_URL para migrar."
    exit 1
  fi
  pnpm migrate:images-gcs
  echo "==> Migração concluída."
else
  echo ""
  echo "Migração (após envs no Cloud Run ou com DATABASE_URL local):"
  echo "  cd back && export DATABASE_URL='postgresql://...' RUN_MIGRATE=1 \\"
  echo "    GCS_BUCKET_NAME=${BUCKET} GCS_PUBLIC_BASE_URL=${PUBLIC_BASE} \\"
  echo "    ./scripts/setup-gcs-product-bucket.sh"
  echo ""
  echo "Ou só migração:"
  echo "  export DATABASE_URL=... GCS_BUCKET_NAME=${BUCKET} GCS_PUBLIC_BASE_URL=${PUBLIC_BASE}"
  echo "  pnpm migrate:images-gcs"
fi
