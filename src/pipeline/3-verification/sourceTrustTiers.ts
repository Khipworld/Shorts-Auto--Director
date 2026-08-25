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

// 한국 도메인 관례 참고:
//   .go.kr  정부·지자체        .re.kr  정부출연연구기관     .ac.kr  대학·학술
//   .or.kr  비영리법인 — 한국은행·건보공단·관광공사처럼 공공기관도 여기를 쓰고,
//           일반 협회·단체도 함께 쓴다. 그래서 이름이 확인된 기관만 1등급으로 올리고
//           나머지 .or.kr 은 3등급으로 둔다.
const PUBLIC_INSTITUTIONS = [
  "bok.or.kr",        // 한국은행
  "nhis.or.kr",       // 국민건강보험공단
  "nps.or.kr",        // 국민연금공단
  "kcomwel.or.kr",    // 근로복지공단
  "visitkorea.or.kr", // 한국관광공사
  "koreanbar.or.kr",  // 대한변호사협회
  "kma.or.kr",        // 대한의사협회
  "kftc.or.kr",       // 금융결제원
  "kdi.re.kr",        // 한국개발연구원
  "kihasa.re.kr",     // 한국보건사회연구원
];

const PRESS_DOMAINS = [
  "yna.co.kr", "yonhapnews.co.kr", "newsis.com", "news1.kr",
  "chosun.com", "joongang.co.kr", "donga.com", "hani.co.kr", "khan.co.kr",
  "seoul.co.kr", "hankookilbo.com", "kmib.co.kr", "segye.com", "munhwa.com",
  "mk.co.kr", "hankyung.com", "edaily.co.kr", "mt.co.kr", "fnnews.com",
  "kbs.co.kr", "mbc.co.kr", "sbs.co.kr", "ytn.co.kr", "jtbc.co.kr", "ebs.co.kr",
  "etnews.com", "zdnet.co.kr", "bloter.net", "kormedi.com", "docdocdoc.co.kr",
];

/** 도메인 목록을 "그 도메인 자신 또는 하위 도메인" 규칙으로 바꾼다. */
function hostPatterns(domains: string[]): RegExp[] {
  return domains.map((d) => new RegExp(`(^|\\.)${d.replace(/\./g, "\\.")}$`, "i"));
}

export const TRUST_TIERS: TrustTierDef[] = [
  {
    tier: "official",
    label: "공식기관 (1등급)",
    description: "정부·지자체·공공기관·국책연구기관·대학 등 공식 도메인",
    domainPatterns: [
      /(^|\.)go\.kr$/i,        // 정부·지자체
      /(^|\.)korea\.kr$/i,     // 정책브리핑
      /(^|\.)re\.kr$/i,        // 정부출연연구기관
      /(^|\.)ac\.kr$/i,        // 대학·학술
      /(^|\.)gov$/i,           // 해외 정부 (.gov)
      /(^|\.)gov\.[a-z]{2}$/i, // 해외 정부 (.gov.uk 등)
      /(^|\.)edu$/i,           // 해외 대학
      ...hostPatterns(PUBLIC_INSTITUTIONS),
    ],
  },
  {
    tier: "press",
    label: "언론사 (2등급)",
    description: "등록된 뉴스/언론사 도메인",
    domainPatterns: [
      ...hostPatterns(PRESS_DOMAINS),
      /(^|\.)news\./i,        // news.xxx.com 형태
      /\.co\.kr\/.*news/i,     // 언론 섹션 경로
    ],
  },
  {
    tier: "verified_platform",
    label: "출처 분명한 플랫폼 (3등급)",
    description: "네이버·위키백과 등 출처·작성자가 확인되는 대형 플랫폼과, 기관 도메인(.or.kr)",
    domainPatterns: [
      /(^|\.)naver\.com$/i,
      /(^|\.)wikipedia\.org$/i,
      /(^|\.)or\.kr$/i,        // 비영리법인·협회 — 개인 블로그보다는 분명한 출처
    ],
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
