import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CertiFlow - Certificate Issuance Platform',
  description: 'Certificate issuance platform for a fictional skills programme',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-50 min-h-screen text-slate-900">
        {children}
      </body>
    </html>
  );
}
