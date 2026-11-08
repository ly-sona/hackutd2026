import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'AEGIS | Incident Response', description: 'Independent cyber incident response coordination', referrer: 'no-referrer' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="dark"><body>{children}</body></html>;
}
