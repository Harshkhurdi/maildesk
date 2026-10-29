import type { Metadata } from "next";
import "./globals.css";
import "./office.css";
import "./pdf.css";

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
      <body className="antialiased" data-ui-version="office-workspace-v2">
        {children}
      </body>
    </html>
  );
}
