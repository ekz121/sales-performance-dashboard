import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sales Performance | Erafone & More",
  description: "Monitoring target dan performa sales Erafone & More",
  icons: { icon: "/erafone.png", apple: "/erafone.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
