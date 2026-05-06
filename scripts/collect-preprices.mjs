#!/usr/bin/env node
// 안산∩비방제 199 공고의 복수예비가격 15개 + 추첨횟수 수집.
// API: getOpengResultListInfoCnstwkPreparPcDetail
// 1 공고 = 15 row (예비가격 15개 + drwt_yn/drwt_num)
//
// 추첨번호 적중률 분석에 필요. 각 행의 drwt_num이 가장 큰 4개가 실제 추첨된 번호.

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
const BASE = "https://apis.data.go.kr/1230000/as/ScsbidInfoService/getOpengResultListInfoCnstwkPreparPcDetail";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const numOrNull = (v) => { if (v == null || v === "" || v === "N/A") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const strOrNull = (v) => (v == null || v === "" || v === "N/A" ? null : String(v).trim());
const toTs = (v) => { const s = strOrNull(v); return s ? (s.length === 10 ? s : s.replace(" ", "T") + "+09:00") : null; };

async function fetchPreprices(bidNtceNo, retry = 0) {
  const qs = new URLSearchParams({
    ServiceKey: API_KEY, type: "json", inqryDiv: "2",
    bidNtceNo, pageNo: "1", numOfRows: "30",
  });
  const res = await fetch(`${BASE}?${qs.toString()}`);
  if (res.status === 429) {
    if (retry < 5) { await sleep(3000 * (retry + 1)); return fetchPreprices(bidNtceNo, retry + 1); }
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
  const { data: wins } = await sb
    .from("public_wins")
    .select("bid_ntce_no, bid_ntce_ord, bid_clsfc_no, rbid_no")
    .eq("is_ansan", true).eq("is_bangje", false);
  console.log(`📋 대상: ${wins.length}건 (안산∩비방제)`);

  const { data: existing } = await sb
    .from("public_preprices")
    .select("bid_ntce_no, bid_ntce_ord, bid_clsfc_no, rbid_no");
  const existingKeys = new Set(
    (existing ?? []).map((e) => `${e.bid_ntce_no}|${e.bid_ntce_ord}|${e.bid_clsfc_no}|${e.rbid_no}`),
  );
  const todo = wins.filter(
    (w) => !existingKeys.has(`${w.bid_ntce_no}|${w.bid_ntce_ord}|${w.bid_clsfc_no}|${w.rbid_no}`),
  );
  console.log(`이미 수집: ${wins.length - todo.length}, 신규: ${todo.length}\n`);

  let ok = 0, fail = 0;
  for (let i = 0; i < todo.length; i++) {
    const w = todo[i];
    process.stdout.write(`[${i + 1}/${todo.length}] ${w.bid_ntce_no} ... `);
    try {
      const items = await fetchPreprices(w.bid_ntce_no);
      if (items.length === 0) { console.log(`(0건)`); continue; }
      const seen = new Set();
      const rows = [];
      for (const it of items) {
        const sno = numOrNull(it.compnoRsrvtnPrceSno);
        if (sno == null) continue;
        const key = `${w.bid_ntce_no}|${w.bid_ntce_ord}|${w.bid_clsfc_no}|${w.rbid_no}|${sno}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          bid_ntce_no: strOrNull(it.bidNtceNo) ?? w.bid_ntce_no,
          bid_ntce_ord: strOrNull(it.bidNtceOrd) ?? "000",
          bid_clsfc_no: strOrNull(it.bidClsfcNo) ?? "0",
          rbid_no: strOrNull(it.rbidNo) ?? "000",
          compno_rsrvtn_prce_sno: sno,
          bsis_plnprc: numOrNull(it.bsisPlnprc) ?? 0,
          drwt_yn: strOrNull(it.drwtYn) === "Y",
          drwt_num: numOrNull(it.drwtNum) ?? 0,
          plnprc: numOrNull(it.plnprc),
          bssamt: numOrNull(it.bssamt),
          tot_rsrvtn_prce_num: numOrNull(it.totRsrvtnPrceNum),
          bssamt_bss_up_num: numOrNull(it.bssamtBssUpNum),
          compno_rsrvtn_prce_mkng_dt: toTs(it.compnoRsrvtnPrceMkngDt),
          rl_openg_dt: toTs(it.rlOpengDt),
          raw: it,
        });
      }
      const { error } = await sb.from("public_preprices").upsert(rows, {
        onConflict: "bid_ntce_no,bid_ntce_ord,bid_clsfc_no,rbid_no,compno_rsrvtn_prce_sno",
      });
      if (error) throw error;
      console.log(`✅ ${rows.length}건`);
      ok++;
    } catch (e) {
      console.log(`❌ ${e.message}`);
      fail++;
    }
    await sleep(200);
  }

  console.log(`\n완료: ${ok} 성공 / ${fail} 실패`);
  const { count } = await sb.from("public_preprices").select("*", { count: "exact", head: true });
  console.log(`총 적재: ${count}행`);
}

main().catch((e) => { console.error(e); process.exit(1); });
