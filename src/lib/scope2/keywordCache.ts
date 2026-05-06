// 키워드 분류용 데이터(wins + participants)를 in-memory 캐시.
// /alerts 페이지가 매번 5,300 row 페이징 + 키워드 분류 재계산하는 걸 방지.
// TTL 1시간. dev hot reload 시 무효화됨.

import { createClient } from "@/lib/supabase/server";
import {
  summarizeByKeywordParticipants,
  type KeywordSummary,
} from "@/lib/analysis/scope2";
import type { PublicParticipant, PublicWin } from "@/types/scope2";

type CacheEntry = {
  keywords: KeywordSummary[];
  expiresAt: number;
};

const TTL_MS = 60 * 60 * 1000; // 1시간

// globalThis에 저장 — Next.js dev mode에서 모듈 재로드되어도 살아있게
const g = globalThis as unknown as { __keywordCache?: CacheEntry };

export async function getKeywordSummaries(): Promise<KeywordSummary[]> {
  const now = Date.now();
  if (g.__keywordCache && g.__keywordCache.expiresAt > now) {
    return g.__keywordCache.keywords;
  }

  const supabase = createClient();
  const [{ data: winsData }, { data: ansanWinIds }] = await Promise.all([
    supabase.from("public_wins").select("*").eq("is_ansan", true).eq("is_bangje", false),
    supabase.from("public_wins").select("bid_ntce_no").eq("is_ansan", true).eq("is_bangje", false),
  ]);
  const wins = (winsData ?? []) as PublicWin[];
  const noticeNos = (ansanWinIds ?? []).map((r) => r.bid_ntce_no);
  const participants: PublicParticipant[] = [];
  if (noticeNos.length > 0) {
    let from = 0;
    while (true) {
      const { data: pData } = await supabase
        .from("public_participants")
        .select("bid_ntce_no, openg_rank, prcbdr_bizno, bidprcrt, is_qualified")
        .in("bid_ntce_no", noticeNos)
        .range(from, from + 999);
      const rows = (pData ?? []) as PublicParticipant[];
      participants.push(...rows);
      if (rows.length < 1000) break;
      from += 1000;
      if (from > 50000) break;
    }
  }

  const keywords = summarizeByKeywordParticipants(wins, participants);
  g.__keywordCache = { keywords, expiresAt: now + TTL_MS };
  return keywords;
}

export function invalidateKeywordCache() {
  delete g.__keywordCache;
}
