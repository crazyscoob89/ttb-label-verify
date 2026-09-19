import type { Metadata } from 'next';
import './globals.css';
import './review.css';

export const metadata: Metadata = {
  title: 'Label Review · Foundation',
  description: 'Local synthetic label/application preparation. No analysis or regulatory approval.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
