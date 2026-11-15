import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CampusMatch — find your people",
  description: "A more human way to find your people on campus.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
