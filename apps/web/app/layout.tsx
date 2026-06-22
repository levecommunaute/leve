import type { Metadata } from "next";
import { DM_Mono } from "next/font/google";
import "./globals.css";
import { AuthSessionGuard } from "../components/AuthSessionGuard";
import { BetaBugButton } from "../components/beta-bug-button";

const dmMono = DM_Mono({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "LEVE",
  description: "LEVE web application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <html lang="en">
      <body className={dmMono.variable}>
        <AuthSessionGuard />
        {children}
        <BetaBugButton />
      </body>
    </html>
  );
}
