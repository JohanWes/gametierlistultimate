import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Ultimate Game Tier List',
  description:
    'Build a personalized S–F tier list of the best games you have played, through quick ranking minigames.',
};

export const viewport: Viewport = {
  themeColor: '#0a0a0e',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-bg text-fg">{children}</body>
    </html>
  );
}
