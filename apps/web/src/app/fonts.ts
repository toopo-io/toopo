import { JetBrains_Mono } from 'next/font/google';

/**
 * The Minimal design pairs one neutral sans with JetBrains Mono. The sans is the
 * platform system stack (declared as --font-sans in the token sheet — no webfont,
 * no layout shift), so only the mono is loaded here. next/font self-hosts it at
 * build time (no runtime CDN dependency — it stays self-hostable) and exposes it
 * as the --font-jetbrains-mono variable that --font-mono points at.
 */
export const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});
