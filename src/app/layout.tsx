import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "조경 입찰 전략 MVP",
  description: "조달청 조경 입찰 데이터 기반 추천 시스템",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="border-b bg-white">
          <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
            <Link href="/" className="font-semibold">
              조경 입찰 전략
            </Link>
            <Link href="/analyze" className="text-sm text-slate-600 hover:text-slate-900">
              공고 분석
            </Link>
            <Link href="/bids" className="text-sm text-slate-600 hover:text-slate-900">
              입찰 목록
            </Link>
            <Link href="/bids/new" className="text-sm text-slate-600 hover:text-slate-900">
              입찰 등록
            </Link>
            <Link href="/backtest" className="text-sm text-slate-600 hover:text-slate-900">
              백테스트
            </Link>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
