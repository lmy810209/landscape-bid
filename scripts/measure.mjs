#!/usr/bin/env node
// 17건 실측 통계 — 개념 노트 v2 작성을 위한 P0 검증.
//
// 계산:
//   1) 안산/유지관리 win_ratio 기술 통계 (n, mean, sd, min, max, median, skew, kurt)
//   2) result_status별 세부 통계
//   3) 낙찰하한선미달 그룹 vs 전체의 위치 비교 (z-score)
//   4) Quantile (25/50/75/40/90)
//   5) Bootstrap resampling으로 stddev 신뢰구간 (1000회)
//   6) 이론값 0.64~0.77% vs 실측 비교 → "발주처 노이즈 지수" 계산

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Supabase env missing.");
  process.exit(1);
}

const supabase = createClient(url, key);

const { data, error } = await supabase
  .from("bids")
  .select("*")
  .ilike("agency", "%안산%")
  .eq("work_type", "유지관리");

if (error) {
  console.error("Query error:", error.message);
  process.exit(1);
}

const bids = data ?? [];
console.log(`=== 원본 조회: ${bids.length}건 (안산 포함 × 유지관리) ===\n`);

// win_ratio 계산 가능한 건만
const withWin = bids
  .filter((b) => b.winning_amount != null && b.base_amount > 0)
  .map((b) => ({
    ...b,
    win_ratio: Number(b.winning_amount) / Number(b.base_amount),
  }));

console.log(`win_ratio 계산 가능: ${withWin.length}건\n`);

// === 1) 기술 통계 ===
const rs = withWin.map((x) => x.win_ratio);
const n = rs.length;
const mean = rs.reduce((a, b) => a + b, 0) / n;
const variance = rs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
const sd = Math.sqrt(variance);
const sorted = [...rs].sort((a, b) => a - b);
const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[(n - 1) / 2];
const min = sorted[0];
const max = sorted[n - 1];

// 왜도 (sample skewness, Fisher-Pearson)
const m3 = rs.reduce((a, b) => a + (b - mean) ** 3, 0) / n;
const skew = m3 / Math.pow(sd, 3);
// 첨도 (excess kurtosis)
const m4 = rs.reduce((a, b) => a + (b - mean) ** 4, 0) / n;
const kurt = m4 / Math.pow(sd, 4) - 3;

const pct = (x) => (x * 100).toFixed(3) + "%";

console.log("=== 1. 기술 통계 (win_ratio, 소수 비율) ===");
console.log(`  n       = ${n}`);
console.log(`  mean    = ${pct(mean)}`);
console.log(`  median  = ${pct(median)}`);
console.log(`  sd      = ${pct(sd)}`);
console.log(`  min     = ${pct(min)}`);
console.log(`  max     = ${pct(max)}`);
console.log(`  range   = ${pct(max - min)}`);
console.log(`  skew    = ${skew.toFixed(3)}  ${skew > 0.5 ? "(우편향 ↑ positive skew)" : skew < -0.5 ? "(좌편향 ↓ negative skew)" : "(거의 대칭)"}`);
console.log(`  kurt    = ${kurt.toFixed(3)}  ${kurt > 1 ? "(뾰족함, leptokurtic)" : kurt < -1 ? "(평평, platykurtic)" : "(정규 유사)"}`);
console.log();

// === 2) Quantile ===
function q(arr, p) {
  const idx = p * (arr.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? arr[lo] : arr[lo] + (arr[hi] - arr[lo]) * (idx - lo);
}

console.log("=== 2. Quantile ===");
console.log(`  Q10  = ${pct(q(sorted, 0.1))}`);
console.log(`  Q25  = ${pct(q(sorted, 0.25))}`);
console.log(`  Q40  = ${pct(q(sorted, 0.4))}   ← 비대칭 구간 하단 후보`);
console.log(`  Q50  = ${pct(q(sorted, 0.5))}`);
console.log(`  Q75  = ${pct(q(sorted, 0.75))}`);
console.log(`  Q90  = ${pct(q(sorted, 0.9))}   ← 비대칭 구간 상단 후보`);
console.log(`  IQR  = ${pct(q(sorted, 0.75) - q(sorted, 0.25))}   ← 50% 구간 폭`);
console.log();

// === 3) result_status 별 ===
console.log("=== 3. 결과 상태별 통계 ===");
const byStatus = {};
for (const b of withWin) {
  if (!byStatus[b.result_status]) byStatus[b.result_status] = [];
  byStatus[b.result_status].push(b);
}
for (const [status, arr] of Object.entries(byStatus)) {
  const ratios = arr.map((x) => x.win_ratio);
  const m = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  console.log(`  ${status}: n=${arr.length}, mean=${pct(m)}, min=${pct(Math.min(...ratios))}, max=${pct(Math.max(...ratios))}`);
}
console.log();

// === 4) 낙찰하한선미달 그룹 위치 분석 (Gemini 질문) ===
console.log("=== 4. 낙찰하한선미달 위치 분석 (Gemini 질문 대응) ===");
const under = byStatus["낙찰하한선미달"] ?? [];
if (under.length > 0) {
  const underRatios = under.map((x) => x.win_ratio);
  const underMean = underRatios.reduce((a, b) => a + b, 0) / underRatios.length;
  const zScore = (underMean - mean) / sd;
  console.log(`  부적격 n = ${under.length}`);
  console.log(`  부적격 평균 win_ratio = ${pct(underMean)}`);
  console.log(`  전체 평균 = ${pct(mean)}, 전체 sd = ${pct(sd)}`);
  console.log(`  z-score = ${zScore.toFixed(2)}  ${zScore > 0 ? "(부적격이 평균보다 위)" : "(부적격이 평균보다 아래)"}`);
  console.log(`  해석: 부적격 그룹의 사정율이 전체 대비 ${zScore > 0 ? "높은" : "낮은"} 쪽에 쏠림`);
  console.log(`        → 부적격 회피 보정은 ${zScore > 0 ? "하한선까지 거리 측정 중요" : "내 투찰이 하한선 위일 가능성"}`);
  console.log();
  console.log(`  개별 부적격 win_ratio: ${underRatios.map(pct).join(", ")}`);
}
console.log();

// === 5) Bootstrap resampling ===
function bootstrap(data, statFn, iters = 1000) {
  const results = [];
  for (let i = 0; i < iters; i++) {
    const sample = [];
    for (let j = 0; j < data.length; j++) {
      sample.push(data[Math.floor(Math.random() * data.length)]);
    }
    results.push(statFn(sample));
  }
  results.sort((a, b) => a - b);
  return {
    point: statFn(data),
    ci95_low: results[Math.floor(iters * 0.025)],
    ci95_high: results[Math.floor(iters * 0.975)],
  };
}

const sdStat = (arr) => {
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
};
const meanStat = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

console.log("=== 5. Bootstrap 95% CI (1000 resamples) ===");
const sdBoot = bootstrap(rs, sdStat);
const meanBoot = bootstrap(rs, meanStat);
console.log(`  mean : ${pct(meanBoot.point)} [${pct(meanBoot.ci95_low)} ~ ${pct(meanBoot.ci95_high)}]`);
console.log(`  sd   : ${pct(sdBoot.point)} [${pct(sdBoot.ci95_low)} ~ ${pct(sdBoot.ci95_high)}]`);
console.log();

// === 6) 이론값 vs 실측 (발주처 노이즈 지수) ===
console.log("=== 6. 이론값 vs 실측 (발주처 노이즈 지수) ===");
const theoSD = 0.0066; // 균등 ±2.5% 가정
const theoSD_wide = 0.0077; // 균등 ±3% 가정 (Claude)
console.log(`  이론값 (예비가격 균등 ±2.5% 가정)  = ${pct(theoSD)}`);
console.log(`  이론값 (예비가격 균등 ±3% 가정)   = ${pct(theoSD_wide)}`);
console.log(`  실측값                            = ${pct(sd)}`);
console.log();

const ratio25 = sd / theoSD;
const ratio30 = sd / theoSD_wide;
console.log(`  실측/이론 비율 (±2.5%): ${ratio25.toFixed(2)}×`);
console.log(`  실측/이론 비율 (±3%):   ${ratio30.toFixed(2)}×`);

// σ_bias² = σ_total² - σ_draw² (Gemini 제안)
const sigma_bias_25 = Math.sqrt(Math.max(0, sd * sd - theoSD * theoSD));
const sigma_bias_30 = Math.sqrt(Math.max(0, sd * sd - theoSD_wide * theoSD_wide));
console.log();
console.log(`  발주처 노이즈 지수 σ_bias (분산 분해):`);
console.log(`    σ_bias (vs ±2.5%) = ${pct(sigma_bias_25)}`);
console.log(`    σ_bias (vs ±3%)   = ${pct(sigma_bias_30)}`);
console.log();

// === 7) 50% 신뢰구간 폭 이론값 비교 ===
console.log("=== 7. 현재 추천 구간 폭 vs 이론 하한 ===");
const iqr = q(sorted, 0.75) - q(sorted, 0.25);
const currentBinWidth = 0.003; // BIN_SIZE
console.log(`  현재 BIN_SIZE                     = ${pct(currentBinWidth)}`);
console.log(`  이론 50% 구간 폭 (1.349 × sd)     = ${pct(1.349 * sd)}`);
console.log(`  실측 IQR (25~75 percentile)       = ${pct(iqr)}`);
console.log(`  현재 구간이 IQR 대비 비율         = ${((currentBinWidth / iqr) * 100).toFixed(1)}%`);
console.log();

// === 8) 요약 ===
console.log("=== 8. 요약 (노트 v2 §2.4에 이 숫자를 넣을 것) ===");
console.log(`  표본: n=${n} (안산/유지관리)`);
console.log(`  mean=${pct(mean)}, sd=${pct(sd)} [95% CI ${pct(sdBoot.ci95_low)}~${pct(sdBoot.ci95_high)}]`);
console.log(`  skew=${skew.toFixed(2)} ${skew > 0.5 ? "(비대칭 Quantile 검토 필요)" : ""}`);
console.log(`  실측 sd가 이론값보다 ${ratio25 > 1 ? `${((ratio25 - 1) * 100).toFixed(0)}% 큼 → σ_bias = ${pct(sigma_bias_25)}` : "오히려 작거나 비슷"}`);
console.log(`  현재 추천 구간 폭 ${pct(currentBinWidth)}는 실측 IQR ${pct(iqr)}의 ${((currentBinWidth / iqr) * 100).toFixed(0)}%`);
console.log(`  → 구조적으로 구간이 너무 좁음${iqr > currentBinWidth * 2 ? " (최소 2~3배 확장 필요)" : ""}`);
