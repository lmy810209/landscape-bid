#!/usr/bin/env node
// 적재된 public_wins(199건) 중 안산∩비방제 공고에 대해
// 모든 참여자(public_participants) 수집.
//
// API: getOpengResultListInfoOpengCompt
// 1 공고 = 1 호출 → 199 호출 + rate limit 고려.
// 호출당 250ms 딜레이 + 429시 백오프.
//
// 적재 후: companies upsert (새 등장한 prcbdr_bizno들), public_participants upsert.
// 재실행 시 이미 수집된 공고는 스킵 (체크포인트는 DB의 unique 제약으로).

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);

const API_KEY = env.NARA_API_KEY;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const BASE = "https://apis.data.go.kr/1230000/as/ScsbidInfoService/getOpengResultListInfoOpengCompt";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const numOrNull = (v) => { if (v == null || v === "" || v === "N/A") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const strOrNull = (v) => (v == null || v === "" || v === "N/A" ? null : String(v).trim());
const toTs = (v) => { const s = strOrNull(v); return s ? (s.length === 10 ? s : s.replace(" ", "T") + "+09:00") : null; };

async function fetchOpengCompt(bidNtceNo, retry = 0) {
  const qs = new URLSearchParams({
    ServiceKey: API_KEY, type: "json", inqryDiv: "4",
    bidNtceNo, pageNo: "1", numOfRows: "500",
  });
  const res = await fetch(`${BASE}?${qs.toString()}`);
  if (res.status === 429) {
    if (retry < 5) {
      await sleep(3000 * (retry + 1));
      return fetchOpengCompt(bidNtceNo, retry + 1);
    }
    throw new Error(`HTTP 429 retries exhausted`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const header = json?.response?.header ?? json?.["nkoneps.com.response.ResponseError"]?.header;
  if (header?.resultCode !== "00") throw new Error(`code=${header?.resultCode} ${header?.resultMsg}`);
  const items = json.response.body?.items ?? [];
  return Array.isArray(items) ? items : items?.item ? (Array.isArray(items.item) ? items.item : [items.item]) : [];
}

async function main() {
  // 1. 안산∩비방제 공고 목록 가져오기
  const { data: wins, error } = await sb
    .from("public_wins")
    .select("bid_ntce_no, bid_ntce_ord, bid_clsfc_no, rbid_no")
    .eq("is_ansan", true)
    .eq("is_bangje", false);
  if (error) { console.error(error); process.exit(1); }
  console.log(`📋 대상 공고: ${wins.length}건 (안산∩비방제)`);

  // 2. 이미 수집된 공고 확인 (skip)
  const { data: existing } = await sb
    .from("public_participants")
    .select("bid_ntce_no, bid_ntce_ord, bid_clsfc_no, rbid_no");
  const existingKeys = new Set(
    (existing ?? []).map((e) => `${e.bid_ntce_no}|${e.bid_ntce_ord}|${e.bid_clsfc_no}|${e.rbid_no}`),
  );
  const todo = wins.filter(
    (w) => !existingKeys.has(`${w.bid_ntce_no}|${w.bid_ntce_ord}|${w.bid_clsfc_no}|${w.rbid_no}`),
  );
  console.log(`✅ 이미 수집: ${wins.length - todo.length}건, 신규 수집: ${todo.length}건\n`);

  let okCount = 0;
  let failCount = 0;
  const newCompanies = new Map(); // bizno → name

  for (let i = 0; i < todo.length; i++) {
    const w = todo[i];
    process.stdout.write(`[${i + 1}/${todo.length}] ${w.bid_ntce_no} ... `);
    try {
      const items = await fetchOpengCompt(w.bid_ntce_no);
      if (items.length === 0) {
        console.log(`(0건)`);
        continue;
      }
      // 새 업체 수집
      for (const it of items) {
        const bizno = strOrNull(it.prcbdrBizno);
        const name = strOrNull(it.prcbdrNm);
        if (bizno && name && !newCompanies.has(bizno)) {
          newCompanies.set(bizno, { name, ceo_nm: strOrNull(it.prcbdrCeoNm) });
        }
      }
      // participants 행 생성 + 복합키로 dedup (API가 같은 행 중복 반환하는 경우 대비)
      const rowsRaw = items.map((it) => ({
        bid_ntce_no: strOrNull(it.bidNtceNo) ?? w.bid_ntce_no,
        bid_ntce_ord: strOrNull(it.bidNtceOrd) ?? "000",
        bid_clsfc_no: strOrNull(it.bidClsfcNo) ?? "0",
        rbid_no: strOrNull(it.rbidNo) ?? "000",
        openg_rank: numOrNull(it.opengRank),
        prcbdr_bizno: strOrNull(it.prcbdrBizno),
        prcbdr_nm: strOrNull(it.prcbdrNm),
        prcbdr_ceo_nm: strOrNull(it.prcbdrCeoNm),
        bidprc_amt: numOrNull(it.bidprcAmt),
        bidprcrt: numOrNull(it.bidprcrt),
        rmrk: strOrNull(it.rmrk),
        drwt_no_1: strOrNull(it.drwtNo1),
        drwt_no_2: strOrNull(it.drwtNo2),
        bidprc_dt: toTs(it.bidprcDt),
        bidprce_evl_val: numOrNull(it.bidPrceEvlVal),
        tech_evl_val: numOrNull(it.techEvlVal),
        total_evl_amt_val: numOrNull(it.totalEvlAmtVal),
        tech_evl_natur_val: numOrNull(it.techEvlNaturVal),
        raw: it,
      }));
      // openg_rank null인 행은 제외 (의미 없는 row), 중복 키 dedup
      const seen = new Set();
      const rows = [];
      for (const r of rowsRaw) {
        if (r.openg_rank == null) continue;
        const k = `${r.bid_ntce_no}|${r.bid_ntce_ord}|${r.bid_clsfc_no}|${r.rbid_no}|${r.openg_rank}`;
        if (seen.has(k)) continue;
        seen.add(k);
        rows.push(r);
      }
      if (rows.length === 0) {
        console.log(`(유효 row 0)`);
        continue;
      }

      // 새 업체 먼저 upsert (FK constraint 충족)
      const newBiznosThisBatch = [...new Set(rows.map((r) => r.prcbdr_bizno).filter(Boolean))];
      if (newBiznosThisBatch.length > 0) {
        const companyRows = newBiznosThisBatch.map((bz) => ({
          bizno: bz,
          name: newCompanies.get(bz)?.name ?? bz,
          ceo_nm: newCompanies.get(bz)?.ceo_nm ?? null,
        }));
        await sb.from("companies").upsert(companyRows, { onConflict: "bizno" });
      }

      const { error: insertErr } = await sb
        .from("public_participants")
        .upsert(rows, { onConflict: "bid_ntce_no,bid_ntce_ord,bid_clsfc_no,rbid_no,openg_rank" });
      if (insertErr) throw insertErr;
      console.log(`✅ ${items.length}명`);
      okCount++;
    } catch (e) {
      console.log(`❌ ${e.message}`);
      failCount++;
    }
    await sleep(250);
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`완료: 성공 ${okCount} / 실패 ${failCount}`);

  // 3. 적재된 데이터 요약
  const { data: parts } = await sb
    .from("public_participants")
    .select("bidprcrt, is_qualified, is_under_threshold");
  const total = parts?.length ?? 0;
  const qualified = parts?.filter((p) => p.is_qualified).length ?? 0;
  const under = parts?.filter((p) => p.is_under_threshold).length ?? 0;
  console.log(`총 참여자: ${total}명 (정상 ${qualified} / 미달 ${under} / 기타 ${total - qualified - under})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
