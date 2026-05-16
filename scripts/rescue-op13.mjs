// rescue-op13.mjs
// bids 테이블의 탈락 공고 중 public_participants에 op13 데이터가 없는 건을 복구.
// 개찰 완료 공고 → 나라장터 API 재호출 → upsert.
//
// 실행: node scripts/rescue-op13.mjs

import https from 'https';

const KEY   = process.env.NARA_API_KEY;
const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!KEY || !SB_URL || !SB_KEY) {
  console.error('환경변수 누락. .env.local을 로드하고 실행하세요:');
  console.error('  node --env-file=.env.local scripts/rescue-op13.mjs');
  process.exit(1);
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getWithRetry(url, maxTries = 5) {
  for (let i = 0; i < maxTries; i++) {
    try {
      const j = await get(url);
      const code = j?.response?.header?.resultCode ?? j?.['nkoneps.com.response.ResponseError']?.header?.resultCode;
      if (code === '00' || code === undefined) return j;
      if (code === '03') { await sleep(2000 * (i + 1)); continue; } // 서비스 점검
      return j;
    } catch {
      await sleep(1000 * (i + 1));
    }
  }
  return null;
}

// ─── Supabase helpers ──────────────────────────────────────────────────────────

async function sbFetch(table, params, maxRows = 5000) {
  let all = [], from = 0;
  while (from < maxRows) {
    const p = { ...params, limit: '1000', offset: String(from) };
    const url = SB_URL + '/rest/v1/' + table + '?' + new URLSearchParams(p);
    const res = await fetch(url, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

async function sbUpsert(table, rows) {
  if (rows.length === 0) return;
  // on_conflict: unique key (bid_ntce_no,bid_ntce_ord,bid_clsfc_no,rbid_no,openg_rank)
  const url = SB_URL + '/rest/v1/' + table +
    '?on_conflict=bid_ntce_no,bid_ntce_ord,bid_clsfc_no,rbid_no,openg_rank';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`upsert 실패 (${res.status}): ${err.slice(0, 200)}`);
  }
}

// ─── op13 API 조회 (전체 페이지) ───────────────────────────────────────────────

async function fetchOp13(bidNtceNo, bidNtceOrd = '000') {
  const PER = 100;
  const first = await getWithRetry(
    'https://apis.data.go.kr/1230000/as/ScsbidInfoService/getOpengResultListInfoOpengCompt?' +
    new URLSearchParams({ serviceKey: KEY, type: 'json', pageNo: '1', numOfRows: String(PER), bidNtceNo, bidNtceOrd })
  );
  if (!first) return [];

  const body = first?.response?.body;
  let items = body?.items ?? [];
  if (!Array.isArray(items)) items = items?.item ? (Array.isArray(items.item) ? items.item : [items.item]) : [];
  const total = Number(body?.totalCount ?? 0);

  const allItems = [...items];
  const totalPages = Math.ceil(total / PER);
  for (let pg = 2; pg <= totalPages; pg++) {
    await sleep(200);
    const j = await getWithRetry(
      'https://apis.data.go.kr/1230000/as/ScsbidInfoService/getOpengResultListInfoOpengCompt?' +
      new URLSearchParams({ serviceKey: KEY, type: 'json', pageNo: String(pg), numOfRows: String(PER), bidNtceNo, bidNtceOrd })
    );
    let pg_items = j?.response?.body?.items ?? [];
    if (!Array.isArray(pg_items)) pg_items = pg_items?.item ? (Array.isArray(pg_items.item) ? pg_items.item : [pg_items.item]) : [];
    allItems.push(...pg_items);
  }
  return allItems;
}

// ─── API 응답 → DB row 변환 ────────────────────────────────────────────────────

// 빈 문자열, null, undefined → null (numeric 컬럼 삽입 오류 방지)
function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
function str(v) {
  if (v == null || v === '') return null;
  return String(v).trim() || null;
}

function normalize(item, noticeNo) {
  const rmrk = str(item.rmrk);
  return {
    bid_ntce_no:        str(item.bidNtceNo)   ?? noticeNo,
    bid_ntce_ord:       str(item.bidNtceOrd)  ?? '000',
    bid_clsfc_no:       str(item.bidClsfcNo)  ?? '0',
    rbid_no:            str(item.rbidNo)      ?? '000',
    openg_rank:         num(item.opengRank) ?? 0, // 미달 참여자는 rank 없음 → 0 (후처리에서 음수로 변환)
    prcbdr_bizno:       str(item.prcbdrBizno),
    prcbdr_nm:          str(item.prcbdrNm),
    prcbdr_ceo_nm:      str(item.prcbdrCeoNm),
    bidprc_amt:         num(item.bidprcAmt),
    bidprcrt:           num(item.bidprcrt),
    rmrk,
    drwt_no_1:          num(item.drwtNo1),
    drwt_no_2:          num(item.drwtNo2),
    bidprc_dt:          str(item.bidprcDt),
    bidprce_evl_val:    str(item.bidPrceEvlVal),
    tech_evl_val:       str(item.techEvlVal),
    total_evl_amt_val:  str(item.totalEvlAmtVal),
    tech_evl_natur_val: str(item.techEvlNaturVal),
    // is_qualified, is_under_threshold — generated columns, DB가 자동 계산
    source:             'rescue-op13',
    scanned_at:         new Date().toISOString(),
    raw:                item,
  };
}

// 미달 참여자(openg_rank=0)가 여럿일 때 배치 내 unique key 충돌 방지.
// 사업자번호로 정렬 후 -1, -2, -3... 부여 → 재실행 시에도 동일 rank 보장 (idempotent).
function assignUniqueRanks(rows) {
  const ranked  = rows.filter(r => r.openg_rank !== 0).sort((a, b) => a.openg_rank - b.openg_rank);
  const under   = rows.filter(r => r.openg_rank === 0)
                      .sort((a, b) => (a.prcbdr_bizno ?? '').localeCompare(b.prcbdr_bizno ?? ''));
  under.forEach((row, idx) => { row.openg_rank = -(idx + 1); }); // -1, -2, -3 ...
  return [...ranked, ...under];
}

// ─── notice_no 파싱 (R26BK01456796-000 → {no, ord}) ──────────────────────────

function parseNoticeNo(noticeNo) {
  const m = noticeNo.match(/^(.+)-(\d{3})$/);
  if (m) return { no: m[1], ord: m[2] };
  return { no: noticeNo, ord: '000' };
}

// ─── 메인 ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('rescue-op13.mjs — op13 누락 데이터 복구');
  console.log('='.repeat(60));

  // 1. 탈락 공고 목록 (bids)
  const bids = await sbFetch('bids', {
    select: 'notice_no,agency,bid_date,result_status',
    result_status: 'in.(낙찰하한선미달,순위권밖)',
    order: 'bid_date.asc',
  });
  const ansanBids = bids.filter(b => /안산/.test(b.agency ?? ''));
  console.log('\nbids 탈락 공고 (안산):', ansanBids.length, '건');

  // 2. 이미 op13 있는 공고 확인 (대시 없는 형태로 정규화)
  const parsedNos = ansanBids.map(b => parseNoticeNo(b.notice_no).no).filter(Boolean);
  const existing = await sbFetch('public_participants', {
    select: 'bid_ntce_no',
    bid_ntce_no: 'in.(' + parsedNos.join(',') + ')',
    limit: '5000',
  });
  const hasData = new Set(existing.map(p => p.bid_ntce_no));

  const targets = ansanBids.filter(b => {
    const { no } = parseNoticeNo(b.notice_no);
    return !hasData.has(no);
  });

  console.log('op13 누락 (rescue 대상):', targets.length, '건');

  if (targets.length === 0) {
    console.log('\n✅ 누락 없음. 모든 공고에 op13 데이터 있음.');
    return;
  }

  // 3. 각 공고 API 조회 + upsert
  let success = 0, skipped = 0, failed = 0;
  const DELAY = 300; // ms

  for (let i = 0; i < targets.length; i++) {
    const b = targets[i];
    const { no, ord } = parseNoticeNo(b.notice_no);
    const prefix = `[${i + 1}/${targets.length}] ${b.notice_no}`;

    process.stdout.write(prefix + ' 조회 중...');

    try {
      const items = await fetchOp13(no, ord);
      if (items.length === 0) {
        console.log(' ⚠ 0건 (유찰/데이터 없음)');
        skipped++;
      } else {
        const rows = assignUniqueRanks(items.map(item => normalize(item, no)));
        await sbUpsert('public_participants', rows);
        const underCnt = rows.filter(r => r.openg_rank < 0).length;
        const extra = underCnt > 0 ? ` (미달 ${underCnt}명 rank -1~-${underCnt})` : '';
        console.log(` ✅ ${items.length}명 upsert${extra}`);
        success++;
      }
    } catch (e) {
      console.log(` ❌ 실패: ${e.message}`);
      failed++;
    }

    await sleep(DELAY);
  }

  // 4. 결과 요약
  console.log('\n' + '='.repeat(60));
  console.log('완료');
  console.log('  성공:', success, '건');
  console.log('  데이터 없음(유찰 등):', skipped, '건');
  console.log('  실패:', failed, '건');
  console.log('='.repeat(60));

  if (failed > 0) {
    console.log('\n실패 건수가 있습니다. 재실행하면 실패 건만 다시 시도합니다.');
  }
}

main().catch(e => { console.error('치명적 오류:', e); process.exit(1); });
