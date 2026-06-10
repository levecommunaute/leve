import type { Metadata } from "next";
import "./globals.css";
import { AuthSessionGuard } from "../components/AuthSessionGuard";

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
      <body>
        <AuthSessionGuard />
        {children}
      </body>
    </html>
  );
}
