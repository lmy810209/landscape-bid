// 안산∩비방제 시장 사정율 median — 윈도우별 (6개월/12개월/5년).
// BidPriceGuide의 트렌드 보정에 사용. 하드코드 대신 매 요청 시 DB에서 계산.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type WindowStats = {
  label: "최근 6개월" | "최근 12개월" | "5년 전체";
  days: number;
  median: number | null;
  n: number;
};

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function fetchAllRates(): Promise<Array<{ sucsfbid_rate: number; rl_openg_dt: string | null }>> {
  const supabase = createClient();
  const all: Array<{ sucsfbid_rate: number; rl_openg_dt: string | null }> = [];
  const PAGE = 1000;
  for (let from = 0; from < 10000; from += PAGE) {
    const { data } = await supabase
      .from("public_wins")
      .select("sucsfbid_rate,rl_openg_dt")
      .eq("is_ansan", true)
      .eq("is_bangje", false)
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.sucsfbid_rate != null) {
        all.push({ sucsfbid_rate: Number(r.sucsfbid_rate), rl_openg_dt: r.rl_openg_dt });
      }
    }
    if (data.length < PAGE) break;
  }
  return all;
}

export async function GET() {
  const all = await fetchAllRates();
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  function inWindow(days: number): number[] {
    if (days === Infinity) return all.map((w) => w.sucsfbid_rate);
    const since = now - days * DAY;
    return all
      .filter((w) => w.rl_openg_dt && new Date(w.rl_openg_dt).getTime() >= since)
      .map((w) => w.sucsfbid_rate);
  }

  const win6 = inWindow(180);
  const win12 = inWindow(365);
  const winAll = inWindow(Infinity);

  const recent6m: WindowStats = { label: "최근 6개월", days: 180, median: median(win6), n: win6.length };
  const recent12m: WindowStats = { label: "최근 12개월", days: 365, median: median(win12), n: win12.length };
  const all5y: WindowStats = { label: "5년 전체", days: 365 * 5, median: median(winAll), n: winAll.length };

  // Fallback 선택: 6m이 최소 30건이면 사용, 아니면 12m (최소 60), 아니면 5y
  const MIN_FOR_RECENT = 30;
  const MIN_FOR_YEAR = 60;
  let primary: WindowStats;
  if (recent6m.n >= MIN_FOR_RECENT) primary = recent6m;
  else if (recent12m.n >= MIN_FOR_YEAR) primary = recent12m;
  else primary = all5y;

  return NextResponse.json({
    primary,
    recent_6m: recent6m,
    recent_12m: recent12m,
    all_5y: all5y,
    computed_at: new Date().toISOString(),
  });
}
