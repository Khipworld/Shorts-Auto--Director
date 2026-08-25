// 카테고리 정의 — 이 프로그램이 다루는 콘텐츠 종류와, 종류마다 달라지는 모든 설정.
//
// 왜 한 파일에 모으나: 카테고리 분기를 각 단계 파일에 if로 흩뿌리면 카테고리를 하나 더
// 늘릴 때 여러 파일을 뒤져야 하고, 어디는 반영되고 어디는 빠지는 사고가 난다.
// (이 프로젝트에서 같은 설정을 두 곳에 두었다가 어긋난 사고가 이미 두 번 있었다.)
// 그래서 프롬프트 조각·신뢰등급·검증 기준·제약 항목·문구를 전부 여기 두고,
// 각 단계는 이 정의를 읽어서 쓴다.
//
// 배경: 원래 이 프로그램은 "정부지원사업" 하나만 다뤘고 대상을 생애주기 6그룹
// (임신부/영유아/청소년/청년/중장년/60세이상)으로 나눴다. 사용자 지시로 일반 주제
// 6개 카테고리로 넓히면서, 기존 정부지원은 public_info(공공정보) 카테고리로 그대로
// 유지한다 — 전환 후에도 결과물이 같아야 한다는 것이 이번 작업의 성공 기준이다.

import type { TrustTier } from "../3-verification/sourceTrustTiers";

export type CategoryId = "public_info" | "product" | "place" | "knowledge" | "trend" | "etc";

export interface CategoryDef {
  id: CategoryId;
  label: string;
  /** 화면에 보여줄 한 줄 설명 */
  summary: string;
  /** 주제에서 카테고리를 자동으로 알아낼 때 쓰는 낱말들 */
  keywords: string[];

  // ── [1] 자료 수집 ──
  /** 조사 담당자의 역할 (시스템 프롬프트) */
  researcherRole: string;
  /** 어디서 무엇을 어떻게 찾을지 (사용자 프롬프트에 붙는 지침) */
  collectGuidance: string;
  /**
   * 무엇을 찾는지 한 마디로 (예: "최근 신규 또는 변경된 정부 지원사업/정책").
   * 카테고리마다 찾는 대상 자체가 다르므로 프롬프트에서 이 문구를 쓴다.
   */
  subjectPhrase: string;
  /**
   * 지역 한정 항목을 걸러낼지.
   * 공공정보는 전국 대상이라 지자체 전용 사업을 빼야 하지만,
   * 여행·장소는 지역이 콘텐츠의 핵심이라 걸러내면 정상 자료가 전부 사라진다.
   */
  useRegionFilter: boolean;

  // ── [3] 검증 ──
  /** 이 카테고리에서 "검증"이 무엇을 뜻하는지 — 검증 프롬프트에 그대로 들어간다 */
  verificationFocus: string;
  /** 신뢰도 우선순위. 앞에 있을수록 높다 */
  trustOrder: TrustTier[];

  // ── [4] 제약조건 ──
  /** 이 카테고리에서 확인할 제약 항목 id */
  constraintIds: string[];

  // ── 영상 문구 ──
  /** 상단 배너 문구 (채널명 뒤에 붙는다) */
  bannerText: string;
  ctaHeadline: string;
  ctaButton: string;

  /** 시작 화면 예시 주제 */
  examples: string[];
}

const COMMON_COLLECT =
  "항목마다 제목, 핵심 내용 요약, 실제 출처 URL을 반드시 포함해서 답해주세요. 최소 3개 이상 서로 다른 출처에서 찾아주세요. 확인되지 않은 내용은 지어내지 말고, 찾은 것만 답하세요.";

export const CATEGORIES: CategoryDef[] = [
  {
    id: "public_info",
    label: "공공정보",
    summary: "정부지원·복지·행정 안내",
    keywords: ["지원금", "지원사업", "정책", "복지", "보조금", "수당", "급여", "바우처", "정부지원", "신청 자격"],
    researcherRole:
      "당신은 대한민국 정부 지원 정책을 조사하는 리서처입니다. 반드시 실제 웹 검색 결과에 근거해서만 답하고, 각 항목마다 실제 출처 URL을 명시하세요. 확실하지 않은 내용은 포함하지 마세요.",
    collectGuidance:
      "정부24, 고용노동부, 행정안전부 등 공식 사이트는 직접 접근이 막혀 있을 수 있으니, 언론 보도나 복지로(bokjiro.go.kr)·정부 부처 보도자료를 인용한 뉴스 기사 등 2차 출처를 적극 활용하세요. " +
      COMMON_COLLECT +
      "\n\n전국 어디서나 신청할 수 있는 사업 위주로 찾아주세요. 특정 시·군·구에서만 되는 지자체 사업은 대부분의 시청자에게 해당되지 않으므로 넣지 마세요.",
    subjectPhrase: "최근 신규 또는 변경된 정부 지원사업/정책",
    useRegionFilter: true,
    verificationFocus:
      "지원 금액·자격 조건·시행일이 실제와 맞는지 확인하세요. 금액이나 비율이 나오는 항목은 특히 주의하고, 서로 다른 출처가 다른 숫자를 말하면 상충으로 표시하세요.",
    trustOrder: ["official", "press", "verified_platform", "unverified"],
    constraintIds: ["political_bias", "defamation", "minor_depiction", "ad_disclosure", "image_license"],
    bannerText: "정부지원 안내",
    ctaHeadline: "내 지원금 지금 확인하세요",
    ctaButton: "프로필 링크에서 확인",
    examples: ["2026년 임신·출산 지원금 총정리", "2026년 청년 지원 정책 총정리", "중장년 재취업 지원 총정리"],
  },
  {
    id: "product",
    label: "상품·서비스",
    summary: "제품 소개, 비교, 할인 정보",
    keywords: ["상품", "제품", "가격", "할인", "리뷰", "비교", "추천템", "구매", "출시", "스펙", "후기"],
    researcherRole:
      "당신은 제품과 서비스를 조사하는 리서처입니다. 반드시 실제 웹 검색 결과에 근거해서만 답하세요. 가격·사양은 확인된 것만 쓰고, 확인이 안 되면 확인 안 됨이라고 쓰세요. 광고 문구를 그대로 옮기지 말고 사실만 정리하세요.",
    collectGuidance:
      "제조사 공식 사양, 실제 판매처의 가격·재고, 사용자 리뷰를 함께 찾아주세요. 가격은 확인한 시점을 함께 적어주세요 — 가격은 수시로 바뀝니다. " +
      COMMON_COLLECT +
      "\n\n최고, 1위, 유일 같은 단정적 표현은 객관적 근거가 있는 경우에만 쓰고, 근거가 없으면 쓰지 마세요.",
    subjectPhrase: "주목할 만한 제품·서비스 정보",
    useRegionFilter: false,
    verificationFocus:
      "가격과 재고가 지금도 유효한지, 사양이 제조사 공식 자료와 일치하는지 확인하세요. 광고성 과장 표현(최고/1위/유일 등)에 객관적 근거가 있는지 특히 엄격하게 보고, 근거가 없으면 미검증으로 분리하세요.",
    trustOrder: ["official", "verified_platform", "press", "unverified"],
    constraintIds: ["ad_disclosure", "false_advertising", "defamation", "image_license"],
    bannerText: "상품 정보",
    ctaHeadline: "자세한 정보는 링크에서",
    ctaButton: "프로필 링크 확인",
    examples: ["무선청소기 신제품 비교", "가성비 노트북 추천", "올여름 신상 가전 할인"],
  },
  {
    id: "place",
    label: "여행·장소",
    summary: "여행지, 맛집, 지역 명소",
    keywords: ["여행", "맛집", "카페", "명소", "코스", "가볼만한", "숙소", "축제", "당일치기", "나들이"],
    researcherRole:
      "당신은 여행지와 장소를 조사하는 리서처입니다. 반드시 실제 웹 검색 결과에 근거해서만 답하세요. 영업 여부와 운영시간은 확인된 것만 쓰고, 오래된 후기는 시점을 함께 밝히세요.",
    collectGuidance:
      "관광공사·지자체 공식 정보, 지도 서비스의 최신 영업정보, 방문 후기를 함께 찾아주세요. 위치·운영시간·비용을 포함하고, 최근 방문 후기인지 오래된 것인지 구분해 주세요. " +
      COMMON_COLLECT,
    subjectPhrase: "가볼 만한 장소와 방문 정보",
    useRegionFilter: false,
    verificationFocus:
      "지금도 영업하는지, 운영시간과 비용이 최신인지 확인하세요. 폐업·휴업·이전 정보가 있는지 반드시 찾아보고, 후기 시점이 오래됐으면 신뢰도를 낮추세요.",
    trustOrder: ["official", "verified_platform", "press", "unverified"],
    constraintIds: ["portrait_right", "image_license", "ad_disclosure", "defamation"],
    bannerText: "여행 정보",
    ctaHeadline: "위치와 정보는 링크에서",
    ctaButton: "프로필 링크 확인",
    examples: ["서울 근교 당일치기 코스", "제주 숨은 카페 추천", "가을 단풍 명소 총정리"],
  },
  {
    id: "knowledge",
    label: "지식·정보",
    summary: "역사, 과학, 경제, 하우투",
    keywords: ["역사", "과학", "경제", "원리", "이유", "방법", "하는법", "차이", "용어", "상식"],
    researcherRole:
      "당신은 지식을 정확하게 정리하는 리서처입니다. 반드시 실제 웹 검색 결과에 근거해서만 답하세요. 학계의 정설과 일부 주장을 반드시 구분해서 표시하세요.",
    collectGuidance:
      "학술·연구기관 자료, 백과, 전문 매체를 우선 찾아주세요. 널리 인정되는 통설인지 일부 주장인지 항목마다 구분해서 적어주세요. " +
      COMMON_COLLECT,
    subjectPhrase: "알아두면 좋은 지식·정보",
    useRegionFilter: false,
    verificationFocus:
      "널리 인정되는 통설인지 일부 주장인지 구분하세요. 한 출처만 주장하고 다른 곳에서 확인되지 않는 내용은 미검증으로 분리하세요. 의료·법률·투자 관련 내용은 단정적으로 서술하지 않도록 표시하세요.",
    trustOrder: ["official", "press", "verified_platform", "unverified"],
    constraintIds: ["image_license", "professional_advice", "defamation"],
    bannerText: "알아두면 좋은 정보",
    ctaHeadline: "더 알아보기",
    ctaButton: "프로필 링크 확인",
    examples: ["금리가 오르면 생기는 일", "커피 원두 차이 한눈에", "전기차 배터리 원리"],
  },
  {
    id: "trend",
    label: "트렌드·뉴스",
    summary: "최신 이슈, 화제 요약",
    keywords: ["이슈", "논란", "화제", "속보", "근황", "트렌드", "유행", "밈", "발표", "최신"],
    researcherRole:
      "당신은 최신 이슈를 정리하는 리서처입니다. 반드시 실제 웹 검색 결과에 근거해서만 답하세요. 보도 시각을 반드시 함께 적고, 사실과 해석을 구분하세요. 단정적 표현과 특정인에 대한 추측은 절대 쓰지 마세요.",
    collectGuidance:
      "언론사 보도와 공식 발표·해명을 함께 찾아주세요. 각 항목마다 언제 보도된 것인지 반드시 적어주세요. 이후 정정 보도나 후속 보도가 있었는지도 함께 확인해 주세요. " +
      COMMON_COLLECT +
      "\n\n진행 중인 수사나 재판에 대해서는 확정된 사실처럼 쓰지 마세요.",
    subjectPhrase: "최근 화제가 된 이슈",
    useRegionFilter: false,
    verificationFocus:
      "보도 시점이 언제인지, 그 이후 정정·후속 보도가 있었는지 반드시 확인하세요. 한 곳만 보도한 단독 기사는 다른 곳에서 확인되기 전까지 미검증으로 분리하세요. 확정되지 않은 의혹을 사실처럼 다루면 안 됩니다.",
    trustOrder: ["press", "official", "verified_platform", "unverified"],
    constraintIds: ["defamation", "political_bias", "image_license", "minor_depiction"],
    bannerText: "이슈 정리",
    ctaHeadline: "자세한 내용은 링크에서",
    ctaButton: "프로필 링크 확인",
    examples: ["이번 주 화제의 뉴스 정리", "요즘 뜨는 트렌드 3가지"],
  },
  {
    id: "etc",
    label: "기타",
    summary: "위 다섯에 안 들어가는 주제",
    keywords: [],
    researcherRole:
      "당신은 주제를 조사하는 리서처입니다. 반드시 실제 웹 검색 결과에 근거해서만 답하고, 각 항목마다 실제 출처 URL을 명시하세요. 확실하지 않은 내용은 포함하지 마세요.",
    collectGuidance: COMMON_COLLECT,
    subjectPhrase: "주제와 관련된 내용",
    useRegionFilter: false,
    verificationFocus:
      "서로 다른 출처가 같은 내용을 말하는지 교차 확인하고, 한 곳에서만 나오는 내용은 미검증으로 분리하세요.",
    trustOrder: ["official", "press", "verified_platform", "unverified"],
    constraintIds: ["defamation", "image_license", "ad_disclosure"],
    bannerText: "정보",
    ctaHeadline: "자세한 내용은 링크에서",
    ctaButton: "프로필 링크 확인",
    examples: [],
  },
];

export const DEFAULT_CATEGORY_ID: CategoryId = "etc";

export function getCategory(id: string | undefined): CategoryDef {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES.find((c) => c.id === DEFAULT_CATEGORY_ID)!;
}

/**
 * 주제에서 카테고리를 알아낸다. 못 알아내면 null — 추측하지 않고 사용자에게 묻기 위함.
 *
 * AI를 부르지 않고 낱말로 맞춘다: 즉시 반응하고 비용도 없고, 무엇을 보고 판단했는지
 * 사용자에게 그대로 보여줄 수 있다.
 */
export function inferCategory(topic: string): { category: CategoryDef; matchedWord: string } | null {
  const text = topic.trim();
  if (!text) return null;

  let best: { category: CategoryDef; word: string } | null = null;
  for (const c of CATEGORIES) {
    for (const w of c.keywords) {
      if (!text.includes(w)) continue;
      // 여러 개가 걸리면 더 긴(구체적인) 낱말이 이긴다
      if (!best || w.length > best.word.length) best = { category: c, word: w };
    }
  }
  return best ? { category: best.category, matchedWord: best.word } : null;
}
