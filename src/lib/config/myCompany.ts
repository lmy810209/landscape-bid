// MVP 단일 사용자 가정. 다른 회사로 바꾸려면 이 기본값 수정 또는
// 브라우저에서 localStorage `myCompany`에 {name, businessNumber} JSON 저장.

export type MyCompany = {
  name: string;
  businessNumber: string;
};

export const DEFAULT_MY_COMPANY: MyCompany = {
  name: "(주)새빛조경",
  businessNumber: "495-86-03422",
};

// API 매칭용 정규화 bizno (하이픈 제거). 직접 import해서 사용.
export const MY_BIZNO = "4958603422";

const LS_KEY = "myCompany";

export function loadMyCompany(): MyCompany {
  if (typeof window === "undefined") return DEFAULT_MY_COMPANY;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_MY_COMPANY;
    const parsed = JSON.parse(raw) as Partial<MyCompany>;
    return {
      name:
        typeof parsed.name === "string" && parsed.name.trim()
          ? parsed.name.trim()
          : DEFAULT_MY_COMPANY.name,
      businessNumber:
        typeof parsed.businessNumber === "string" && parsed.businessNumber.trim()
          ? parsed.businessNumber.trim()
          : DEFAULT_MY_COMPANY.businessNumber,
    };
  } catch {
    return DEFAULT_MY_COMPANY;
  }
}

export function saveMyCompany(company: MyCompany): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_KEY, JSON.stringify(company));
}

// 매칭 우선 식별자 (사업자번호 우선, 없으면 회사명)
export function buildCompanyQuery(company: MyCompany): string {
  return company.businessNumber.trim() || company.name.trim();
}

// ────────────────────────────────────────────────────────
// 자격 매칭용 — 공고의 면허·지역·시공능력 요건 vs 본인 자격 비교
// 어제 공고 R26BK01294519에서 확인된 본인(새빛조경) 정보 기반.
// ────────────────────────────────────────────────────────
export const MY_QUALIFICATIONS = {
  industryKeywords: ["조경식재", "조경시설물", "유지보수", "유지관리"],
  disqualifyKeywords: ["나무의사", "방제업"],
  homeRegion: "경기도 안산시",
  cnstrtnAbltyEvlAmt: null as number | null, // 시공능력평가금액 (원). 모르면 null.
};

export type QualMatchResult = {
  match: boolean;
  reasons: string[];
};

export function matchQualification(
  noticeName: string,
  mainCnstty: string | null,
  prtcptLmtRgnNm: string | null,
): QualMatchResult {
  const reasons: string[] = [];
  let pass = true;

  const fullText = `${noticeName} ${mainCnstty ?? ""}`;
  for (const kw of MY_QUALIFICATIONS.disqualifyKeywords) {
    if (fullText.includes(kw)) {
      pass = false;
      reasons.push(`✗ "${kw}" 포함`);
    }
  }

  if (mainCnstty) {
    const matched = MY_QUALIFICATIONS.industryKeywords.find((kw) => mainCnstty.includes(kw));
    if (matched) {
      reasons.push(`✓ 업종 ${matched}`);
    } else {
      pass = false;
      reasons.push(`✗ ${mainCnstty} 무자격`);
    }
  }

  if (prtcptLmtRgnNm) {
    if (prtcptLmtRgnNm.includes(MY_QUALIFICATIONS.homeRegion) || prtcptLmtRgnNm.includes("안산")) {
      reasons.push(`✓ 안산 가능`);
    } else if (prtcptLmtRgnNm.includes("경기도")) {
      reasons.push(`✓ 경기도 가능`);
    } else {
      pass = false;
      reasons.push(`✗ ${prtcptLmtRgnNm}만 가능`);
    }
  }

  return { match: pass, reasons };
}
