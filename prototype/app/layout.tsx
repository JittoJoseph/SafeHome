import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SafeHome Prototype",
  description: "Local SafeHome product prototype",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
