#!/usr/bin/env node
// 안산∩비방제 652 공고에 대해 BidPublicInfoService 호출하여 sucsfbidMthdNm 누적.
// data/notice-methods.json 에 캐시 (재실행 시 자동 스킵).

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
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const OUT = path.join(__dirname, "..", "data", "notice-methods.json");
const BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoCnstwk";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getNoticeIds() {
  const all = [];
  let from = 0;
  while (true) {
    const r = await fetch(
      `${URL_BASE}/rest/v1/public_wins?select=bid_ntce_no&is_ansan=eq.true&is_bangje=eq.false&order=rl_openg_dt.desc&limit=1000&offset=${from}`,
      { headers: { apikey: KEY } }
    );
    const d = await r.json();
    if (!d.length) break;
    all.push(...d.map((x) => x.bid_ntce_no));
    if (d.length < 1000) break;
    from += 1000;
  }
  return [...new Set(all)];
}

let cache = {};
if (fs.existsSync(OUT)) {
  try { cache = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch {}
}

async function fetchMeta(no, retry = 0) {
  const url = `${BASE}?ServiceKey=${API_KEY}&type=json&inqryDiv=2&bidNtceNo=${no}&pageNo=1&numOfRows=1`;
  const r = await fetch(url);
  if (r.status === 429) {
    if (retry < 5) {
      await sleep(2000 * (retry + 1));
      return fetchMeta(no, retry + 1);
    }
    throw new Error("HTTP 429");
  }
  if (!r.ok) return null;
  const j = await r.json();
  const items = j?.response?.body?.items?.item ?? j?.response?.body?.items ?? [];
  const arr = Array.isArray(items) ? items : items ? [items] : [];
  await sleep(150);
  return arr[0] ?? null;
}

const ids = await getNoticeIds();
const todo = ids.filter((id) => !(id in cache));
console.log(`📋 ${ids.length} 공고 / 캐시 ${ids.length - todo.length} / 신규 ${todo.length}`);

let okCount = 0, failCount = 0;
for (let i = 0; i < todo.length; i++) {
  const no = todo[i];
  process.stdout.write(`[${i + 1}/${todo.length}] ${no} ... `);
  try {
    const m = await fetchMeta(no);
    if (m) {
      cache[no] = {
        sucsfbid_method: m.sucsfbidMthdNm ?? null,
        bid_method: m.bidMethdNm ?? null,
        sucsfbid_lwlt_rate: m.sucsfbidLwltRate ?? null,
      };
      okCount++;
    } else {
      cache[no] = { sucsfbid_method: null, bid_method: null };
      failCount++;
    }
    if ((i + 1) % 50 === 0) {
      fs.writeFileSync(OUT, JSON.stringify(cache, null, 2));
      console.log(`💾 저장 (${i + 1})`);
    } else {
      console.log("✅");
    }
  } catch (e) {
    console.log(`❌ ${e.message}`);
    failCount++;
    if (e.message.includes("429")) break;
  }
}

fs.writeFileSync(OUT, JSON.stringify(cache, null, 2));
console.log(`\n완료. 성공 ${okCount} / 실패 ${failCount}. 캐시: ${OUT}`);
