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
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 sm:gap-x-5 sm:px-4 sm:py-3">
            <Link href="/" className="text-sm font-semibold sm:text-base">
              조경 입찰
            </Link>
            <Link href="/alerts" className="text-xs text-emerald-700 hover:text-emerald-900 sm:text-sm">
              📋 새 공고
            </Link>
            <Link href="/bids/new" className="text-xs text-slate-600 hover:text-slate-900 sm:text-sm">
              입찰 등록
            </Link>
            <Link href="/safe-zone" className="text-xs text-violet-700 hover:text-violet-900 sm:text-sm">
              🎯 안전권
            </Link>
            <Link href="/bids" className="text-xs text-slate-600 hover:text-slate-900 sm:text-sm">
              내 입찰
            </Link>
            <Link href="/competitors" className="text-xs text-slate-600 hover:text-slate-900 sm:text-sm">
              경쟁사
            </Link>
            <Link href="/backtest" className="text-xs text-slate-600 hover:text-slate-900 sm:text-sm">
              백테스트
            </Link>
            <Link href="/analyze" className="text-xs text-slate-600 hover:text-slate-900 sm:text-sm">
              분석
            </Link>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-6">{children}</main>
      </body>
    </html>
  );
}
