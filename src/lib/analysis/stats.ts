// 통계 유틸리티
//
// 백테스트 지표(Calibration, Sharpness) 및 신뢰구간 계산용.
// 외부 AI 평가 4라운드에서 공통 지적된 "점 추정만 보여주지 말고 CI 병기" 원칙에 따라,
// 모든 비율·평균 지표에 Bootstrap 또는 Wilson CI를 붙인다.

// === 기초 통계 ===

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

// === Quantile (분위수) ===
//
// Linear interpolation (numpy default "linear"). 표본이 적어도 안정적.
// 입력 배열이 정렬 안 됐으면 내부에서 복사 후 정렬.

export function quantile(xs: number[], p: number): number | null {
  if (xs.length === 0) return null;
  if (p < 0 || p > 1) throw new Error(`quantile: p=${p} out of [0,1]`);
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// 여러 quantile 한 번에 (정렬 재사용)
export function quantiles(xs: number[], ps: number[]): (number | null)[] {
  if (xs.length === 0) return ps.map(() => null);
  const sorted = [...xs].sort((a, b) => a - b);
  return ps.map((p) => {
    const idx = p * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  });
}

// === Bootstrap 신뢰구간 ===
//
// 비모수. 원본을 복원 추출로 리샘플링 → 통계량 분포 → 분위수로 CI 추출.
// 17건처럼 작은 표본에 적합. 정규성 가정 없음.

export type BootstrapCI = {
  point: number; // 원본 표본에서의 점 추정
  low: number; // CI 하한
  high: number; // CI 상한
  level: number; // 신뢰 수준 (0.95 기본)
  iters: number; // 리샘플링 횟수
};

export function bootstrapCI<T>(
  data: T[],
  statFn: (sample: T[]) => number,
  opts: { iters?: number; level?: number; seed?: number } = {},
): BootstrapCI {
  const iters = opts.iters ?? 1000;
  const level = opts.level ?? 0.95;
  const n = data.length;

  if (n === 0) {
    return { point: NaN, low: NaN, high: NaN, level, iters };
  }

  const point = statFn(data);

  // 간이 PRNG (seed 지원). seed 없으면 Math.random.
  const rng = opts.seed != null ? mulberry32(opts.seed) : Math.random;

  const stats: number[] = [];
  for (let i = 0; i < iters; i++) {
    const sample: T[] = [];
    for (let j = 0; j < n; j++) {
      sample.push(data[Math.floor(rng() * n)]);
    }
    stats.push(statFn(sample));
  }

  stats.sort((a, b) => a - b);
  const loIdx = Math.floor(iters * (1 - level) / 2);
  const hiIdx = Math.floor(iters * (1 - (1 - level) / 2));
  return {
    point,
    low: stats[loIdx],
    high: stats[Math.min(hiIdx, iters - 1)],
    level,
    iters,
  };
}

// 결정론적 시드 PRNG (테스트/재현용)
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// === Wilson 점수 신뢰구간 (이진 비율) ===
//
// 정확도·포함률·개선률처럼 성공/실패 이진 결과의 비율에 사용.
// Wald(정규 근사)보다 작은 표본에서 안정적.
// 개선률 7/17 = 41.18% 같은 값에 [loWald=18%, hiWald=65%] 대신
// Wilson은 [21%, 64%] 정도로 더 정직한 경계.

export type WilsonCI = {
  point: number; // p = k / n
  low: number;
  high: number;
  level: number;
  n: number;
  k: number;
};

export function wilsonCI(k: number, n: number, level = 0.95): WilsonCI {
  if (n === 0) {
    return { point: NaN, low: NaN, high: NaN, level, n, k };
  }
  const z = zForLevel(level);
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return {
    point: p,
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
    level,
    n,
    k,
  };
}

function zForLevel(level: number): number {
  // 흔한 수준만 하드코딩. 그 외에는 0.95.
  if (Math.abs(level - 0.95) < 1e-9) return 1.959963984540054;
  if (Math.abs(level - 0.9) < 1e-9) return 1.6448536269514722;
  if (Math.abs(level - 0.99) < 1e-9) return 2.5758293035489004;
  return 1.959963984540054;
}

// === 상태 판정 (UI 신뢰도 배지용) ===
//
// Calibration 실측이 목표 커버리지에서 얼마나 벗어났는지에 따라 tone 결정.
// 경계는 DeepSeek §5 제안 + Gemini §1 제안 종합.

export type CalibrationTone = "good" | "warn" | "bad";

export function calibrationTone(
  observed: number,
  target: number,
  tolerance: { good: number; warn: number } = { good: 0.05, warn: 0.15 },
): CalibrationTone {
  const diff = Math.abs(observed - target);
  if (diff <= tolerance.good) return "good";
  if (diff <= tolerance.warn) return "warn";
  return "bad";
}

// === 간이 문자열 포맷터 (UI 중복 피하기 위해 여기 배치) ===

export function formatCI(
  point: number,
  low: number,
  high: number,
  fn: (x: number) => string,
): string {
  return `${fn(point)} [${fn(low)} ~ ${fn(high)}]`;
}
