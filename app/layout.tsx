import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans, JetBrains_Mono, Saira_Condensed } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';

import { Providers } from '@/components/Providers';

import './globals.css';

const sairaCondensed = Saira_Condensed({
  subsets: ['latin'],
  weight: ['600', '700', '800', '900'],
  variable: '--font-saira-condensed',
  display: 'swap',
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Game Tier List Ultimate',
  description:
    'Build a personalized S–F tier list of the best games you have played, through quick ranking minigames.',
};

export const viewport: Viewport = {
  themeColor: '#11100d',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${sairaCondensed.variable} ${ibmPlexSans.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-dvh bg-bg font-sans text-fg">
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
