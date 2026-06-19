import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppHeader from "@/components/AppHeader";
import SummaryBar from "@/components/SummaryBar";
import { ThemeProvider } from "@/lib/ThemeProvider";
import { AuthProvider } from "@/lib/useAuth";
import { NotificationProvider } from "@/lib/NotificationContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DARI SIR — NEPSE Live Market",
  description:
    "Live Nepal Stock Exchange market watch, floorsheet, charts and portfolio tracking.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background">
        <ThemeProvider>
          <AuthProvider>
            <NotificationProvider>
              <AppHeader />
              <SummaryBar />
              <main className="w-full flex-1 px-4 py-4">{children}</main>
            </NotificationProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
