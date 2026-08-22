// [3] 사실/신뢰성 검증 단계의 출처 신뢰도 등급 정의.
// 사용자 지침: "공식기관, 언론사, 네이버 등 출처가 분명한 것 등으로 신뢰등급 순위를 정할 것".
// 형식적으로 "검증했다"는 표시만 남기지 않도록 — 어떤 규칙으로 이 등급이 매겨졌는지 그대로
// 로그에 남길 수 있게, 도메인 패턴과 등급을 명시적인 데이터로 둔다 (요구사항 [3]/[4]단계 참고).
export type TrustTier = "official" | "press" | "verified_platform" | "unverified";

export interface TrustTierDef {
  tier: TrustTier;
  label: string;
  description: string;
  domainPatterns: RegExp[];
}

export const TRUST_TIERS: TrustTierDef[] = [
  {
    tier: "official",
    label: "공식기관 (1등급)",
    description: "정부/지자체/공공기관 등 공식 도메인",
    domainPatterns: [/\.go\.kr$/i, /\.go\.kr\//i, /\.korea\.kr$/i, /gov$/i],
  },
  {
    tier: "press",
    label: "언론사 (2등급)",
    description: "등록된 뉴스/언론사 도메인",
    domainPatterns: [
      /\.co\.kr\/.*news/i,
      /yna\.co\.kr$/i,
      /yonhapnews\.co\.kr$/i,
      /chosun\.com$/i,
      /joongang\.co\.kr$/i,
      /hani\.co\.kr$/i,
      /khan\.co\.kr$/i,
      /mbc\.co\.kr$/i,
      /kbs\.co\.kr$/i,
      /sbs\.co\.kr$/i,
    ],
  },
  {
    tier: "verified_platform",
    label: "출처 분명한 플랫폼 (3등급)",
    description: "네이버 등 출처·작성자가 분명히 확인되는 대형 플랫폼",
    domainPatterns: [/naver\.com$/i, /wikipedia\.org$/i],
  },
  {
    tier: "unverified",
    label: "미검증 (4등급)",
    description: "위 세 등급에 해당하지 않는 커뮤니티/개인 블로그 등 — 대본에 자동 반영되지 않고 별도 분리",
    domainPatterns: [],
  },
];

export function classifySourceTrust(url: string): TrustTierDef {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return TRUST_TIERS[TRUST_TIERS.length - 1];
  }
  for (const def of TRUST_TIERS) {
    if (def.domainPatterns.some((p) => p.test(host) || p.test(url))) return def;
  }
  return TRUST_TIERS[TRUST_TIERS.length - 1];
}
