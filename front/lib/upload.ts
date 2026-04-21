import { getApiUrl, getAuthHeaders } from "./api"

export type SignProductImageResponse = {
  uploadUrl: string
  publicUrl: string
  objectName: string
}

export async function signProductImageUpload(params: {
  storeId: string
  contentType: string
  fileSize: number
}): Promise<SignProductImageResponse> {
  const res = await fetch(getApiUrl("/uploads/product-image/sign"), {
    method: "POST",
    headers: getAuthHeaders(true),
    body: JSON.stringify({
      storeId: params.storeId,
      contentType: params.contentType,
      fileSize: params.fileSize,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string } & Partial<SignProductImageResponse>
  if (!res.ok) {
    throw new Error(data.error ?? `Falha ao preparar upload (${res.status})`)
  }
  if (!data.uploadUrl || !data.publicUrl) {
    throw new Error("Resposta inválida do servidor")
  }
  return data as SignProductImageResponse
}
