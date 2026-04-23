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
