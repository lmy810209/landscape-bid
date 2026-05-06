#!/usr/bin/env node
// data/scope2-scan-5y.json → Supabase 테이블로 적재.
//   · companies: 업체 마스터 (27명 + 첫 등장한 낙찰자들)
//   · public_wins: 각 낙찰 기록 (현재 스캔 완료분)
//
// Upsert 기반이라 여러 번 실행해도 안전 (체크포인트).

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const store = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "scope2-scan-5y.json"), "utf8"));

// ─── 헬퍼 ───
const emptyToNull = (v) => (v == null || v === "" || v === "N/A" ? null : v);
const toNum = (v) => {
  const n = emptyToNull(v);
  if (n == null) return null;
  const x = Number(n);
  return Number.isNaN(x) ? null : x;
};
const toTs = (v) => {
  const s = emptyToNull(v);
  if (!s) return null;
  // "2025-07-23 11:00:00" → ISO
  return s.length === 10 ? s : s.replace(" ", "T") + "+09:00";
};
const toDate = (v) => {
  const s = emptyToNull(v);
  return s && s.length >= 10 ? s.slice(0, 10) : null;
};

// ─── 1. companies upsert ───
const companyRows = Object.entries(store).map(([bizno, v]) => {
  // 가장 최근 item에서 ceo_nm, address, tel 추출
  const latest = v.items
    .slice()
    .sort((a, b) => (b.rgstDt ?? "").localeCompare(a.rgstDt ?? ""))[0];
  return {
    bizno,
    name: v.name,
    ceo_nm: emptyToNull(latest?.bidwinnrCeoNm),
    address: emptyToNull(latest?.bidwinnrAdrs),
    tel: emptyToNull(latest?.bidwinnrTelNo),
    is_self: bizno === "4958603422",
  };
});

console.log(`▶ companies upsert: ${companyRows.length}건`);
const { error: cErr } = await sb
  .from("companies")
  .upsert(companyRows, { onConflict: "bizno" });
if (cErr) { console.error("❌ companies:", cErr); process.exit(1); }
console.log(`✅ companies 저장 완료\n`);

// ─── 2. public_wins upsert ───
const winRows = [];
for (const [bizno, v] of Object.entries(store)) {
  for (const it of v.items) {
    winRows.push({
      bid_ntce_no: it.bidNtceNo,
      bid_ntce_ord: it.bidNtceOrd ?? "000",
      bid_clsfc_no: it.bidClsfcNo ?? "0",
      rbid_no: it.rbidNo ?? "000",
      bid_ntce_nm: it.bidNtceNm,
      ntce_div_cd: emptyToNull(it.ntceDivCd),
      prtcpt_cnum: toNum(it.prtcptCnum),
      rl_openg_dt: toTs(it.rlOpengDt),
      rgst_dt: toTs(it.rgstDt),
      dminstt_cd: emptyToNull(it.dminsttCd),
      dminstt_nm: emptyToNull(it.dminsttNm),
      bidwinnr_bizno: emptyToNull(it.bidwinnrBizno) ?? bizno,
      bidwinnr_nm: emptyToNull(it.bidwinnrNm),
      bidwinnr_ceo_nm: emptyToNull(it.bidwinnrCeoNm),
      bidwinnr_adrs: emptyToNull(it.bidwinnrAdrs),
      bidwinnr_tel_no: emptyToNull(it.bidwinnrTelNo),
      sucsfbid_amt: toNum(it.sucsfbidAmt),
      sucsfbid_rate: toNum(it.sucsfbidRate),
      fnl_sucsf_date: toDate(it.fnlSucsfDate),
      fnl_sucsf_corp_ofcl: emptyToNull(it.fnlSucsfCorpOfcl),
      source: "ScsbidListSttusCnstwkPPSSrch",
      raw: it,
    });
  }
}

console.log(`▶ public_wins upsert: ${winRows.length}건 (배치 50)`);
let inserted = 0;
for (let i = 0; i < winRows.length; i += 50) {
  const batch = winRows.slice(i, i + 50);
  const { error } = await sb
    .from("public_wins")
    .upsert(batch, { onConflict: "bid_ntce_no,bid_ntce_ord,bid_clsfc_no,rbid_no" });
  if (error) { console.error(`❌ batch ${i}:`, error); process.exit(1); }
  inserted += batch.length;
  process.stdout.write(`\r   ${inserted}/${winRows.length}`);
}
console.log(`\n✅ public_wins 저장 완료`);

// ─── 3. 검증 쿼리: 안산 비방제 Top 20 ───
console.log(`\n━━━ 검증: 안산 비방제 3년 Top 20 (DB 기준) ━━━\n`);
const { data: top, error: qErr } = await sb
  .from("public_wins")
  .select("bidwinnr_bizno, bidwinnr_nm")
  .eq("is_ansan", true)
  .eq("is_bangje", false);
if (qErr) { console.error(qErr); process.exit(1); }

const counts = new Map();
for (const r of top) {
  const k = r.bidwinnr_bizno ?? "(unknown)";
  const name = r.bidwinnr_nm ?? "";
  if (!counts.has(k)) counts.set(k, { name, count: 0 });
  counts.get(k).count++;
}
const ranked = [...counts.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 20);

console.log(`순위 | 업체 | 건수 | 연 환산`);
console.log(`-----|------|------|--------`);
ranked.forEach(([bz, v], i) => {
  console.log(`${String(i + 1).padStart(2)} | ${v.name.padEnd(30, " ")} | ${String(v.count).padStart(3)} | ${(v.count / 3).toFixed(1)}건/년`);
});

console.log(`\n총 안산∩비방제 낙찰 (3년): ${top.length}건`);
console.log(`고유 낙찰자: ${counts.size}명`);
