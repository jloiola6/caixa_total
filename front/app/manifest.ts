import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Caixa Total',
    short_name: 'CaixaTotal',
    description: 'Sistema de ponto de venda, gestao de estoque e relatorios',
    start_url: '/',
    display: 'standalone',
    background_color: '#0F3EA9',
    theme_color: '#0F3EA9',
    lang: 'pt-BR',
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
