import { Suspense } from 'react';
import { Bricolage_Grotesque, Figtree } from 'next/font/google';
import Header from '../components/Header';
import './globals.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['600', '800'], variable: '--font-display' });
const body = Figtree({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--font-body' });

export const metadata = {
  title: { default: 'Kadai Market', template: '%s · Kadai Market' },
  description: 'Pickles, spices and tea from Kerala home kitchens.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body style={{ '--display': 'var(--font-display), system-ui, sans-serif', '--body': 'var(--font-body), system-ui, sans-serif' }}>
        <Suspense fallback={<header className="top" />}>
          <Header />
        </Suspense>
        <main>{children}</main>
      </body>
    </html>
  );
}
