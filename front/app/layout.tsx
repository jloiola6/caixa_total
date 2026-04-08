import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/theme-provider'
import { AuthProvider } from '@/contexts/auth-context'
import { LayoutWrapper } from '@/components/layout-wrapper'
import { PushNotificationsBootstrap } from '@/components/push-notifications-bootstrap'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'CaixaTotal - Sistema PDV',
  description: 'Sistema de ponto de venda, gestao de estoque e relatorios',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        sizes: '32x32',
        type: 'image/png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        sizes: '32x32',
        type: 'image/png',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    apple: [
      {
        url: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AuthProvider>
            <PushNotificationsBootstrap />
            <LayoutWrapper>{children}</LayoutWrapper>
            <Toaster richColors position="top-right" />
            <Analytics />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
