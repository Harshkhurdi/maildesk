import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MailDesk — your productivity workspace",
  description: "Word, Excel, PowerPoint, Outlook, and Free AI Studio.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
