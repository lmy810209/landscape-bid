#!/usr/bin/env node
// 매일 1회 실행해서 어제 등록된 안산 비방제 신규 공고를 요약 → Slack/콘솔로 알림.
//
// 운영:
//   crontab -e 후 추가: 0 8 * * *  cd /Users/lee/Desktop/웹개발/조경\ 조달청\ 입찰 && /usr/local/bin/node scripts/daily-notice-alert.mjs
//   (매일 아침 8시)
//
// 환경변수:
//   NARA_API_KEY (.env.local)
//   SLACK_WEBHOOK_URL (.env.local, 선택) — 있으면 Slack 전송, 없으면 콘솔만
//
// 본인 이미 등록한 공고는 자동 제외 (Supabase bids + public_participants 매칭).

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
const SLACK_WEBHOOK_URL = env.SLACK_WEBHOOK_URL;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const ANSAN = /안산/;
const BANGJE = /(방제|병해충|살균|살충|소독|약제살포)/;
const MY_BIZNO = "4958603422";
const INDUSTRY_KW = ["조경식재", "조경시설물", "유지보수", "유지관리"];

function fmt(d, suffix) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}${suffix}`;
}

async function fetchYesterdayCnstwk() {
  // 어제 0시 ~ 어제 23:59
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const begin = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0);
  const end = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59);

  const all = [];
  let page = 1;
  while (page <= 10) {
    const qs = new URLSearchParams({
      ServiceKey: API_KEY,
      type: "json",
      inqryDiv: "1",
      inqryBgnDt: fmt(begin, "0000"),
      inqryEndDt: fmt(end, "2359"),
      pageNo: String(page),
      numOfRows: "300",
    });
    const res = await fetch(
      `https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoCnstwk?${qs}`,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const header = json?.response?.header ?? json?.["nkoneps.com.response.ResponseError"]?.header;
    if (header?.resultCode !== "00") throw new Error(`API ${header?.resultCode}`);
    const items = json.response.body?.items ?? [];
    const arr = Array.isArray(items) ? items : items?.item ? (Array.isArray(items.item) ? items.item : [items.item]) : [];
    all.push(...arr);
    if (arr.length < 300) break;
    page++;
  }
  return all;
}

async function getMyKnownNoticeNos() {
  const [{ data: bids }, { data: parts }] = await Promise.all([
    sb.from("bids").select("notice_no"),
    sb.from("public_participants").select("bid_ntce_no").eq("prcbdr_bizno", MY_BIZNO),
  ]);
  const set = new Set();
  for (const b of bids ?? []) set.add((b.notice_no ?? "").replace(/-\d+$/, ""));
  for (const p of parts ?? []) set.add(p.bid_ntce_no);
  return set;
}

function checkQualified(notice) {
  // 무자격: 방제 키워드는 위에서 이미 걸러짐. 업종 매칭만 체크.
  const main = notice.mainCnsttyNm ?? "";
  if (!main) return true; // 정보 없으면 일단 통과
  return INDUSTRY_KW.some((kw) => main.includes(kw));
}

async function main() {
  const all = await fetchYesterdayCnstwk();
  const ansan = all.filter((n) => ANSAN.test(n.dminsttNm ?? "") && !BANGJE.test(n.bidNtceNm ?? ""));
  const myKnown = await getMyKnownNoticeNos();
  const newOnes = ansan.filter((n) => !myKnown.has(n.bidNtceNo));
  const qualified = newOnes.filter(checkQualified);

  const lines = [];
  lines.push(`📢 어제 안산 비방제 신규 공고 ${ansan.length}건 (전체 ${all.length})`);
  lines.push(`   본인 자격가능 미등록: ${qualified.length}건\n`);

  if (qualified.length === 0) {
    lines.push("(자격가능 신규 공고 없음)");
  } else {
    qualified.forEach((n, i) => {
      lines.push(`${i + 1}. ${n.bidNtceNm}`);
      lines.push(`   ${n.dminsttNm} | 기초 ${Number(n.bdgtAmt ?? 0).toLocaleString()}원 | 개찰 ${(n.opengDt ?? "").slice(0, 16)}`);
      lines.push(`   하한율 ${n.sucsfbidLwltRate ?? "?"}% / 주공종 ${n.mainCnsttyNm ?? "?"}`);
      lines.push(`   ${n.bidNtceNo}`);
      lines.push("");
    });
  }

  const text = lines.join("\n");
  console.log(text);

  if (SLACK_WEBHOOK_URL && qualified.length > 0) {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    console.log(`Slack: ${res.ok ? "전송됨" : `실패 ${res.status}`}`);
  } else if (!SLACK_WEBHOOK_URL) {
    console.log("\n(Slack 웹훅 미설정 — .env.local의 SLACK_WEBHOOK_URL 추가 시 자동 전송)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
