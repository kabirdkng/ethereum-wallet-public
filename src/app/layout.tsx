import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KASH Wallet",
  description:
    "Secure self-custody wallet for Ethereum stablecoins with recovery and compliance-ready workflows.",
};

// Root layout with html/body tags - required by Next.js
// The [locale] layout will handle internationalization for pages
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning>
      <body
        className="min-h-screen bg-surface font-sans text-foreground antialiased transition-colors"
      >
        {children}
      </body>
    </html>
  );
}
