// 지역 한정 사업 걸러내기.
//
// 전체 흐름을 실제로 돌려봤을 때(중장년 재취업 주제), 전국 대상 영상인데 "지자체
// 신중년/중장년 고용지원금 (지역 사업, 예시: 경남 양산시)" 같은 특정 지자체 사업이
// 카드로 들어오고 해시태그에도 #양산시고용지원금이 나왔다. 양산시민이 아니면 쓸모없는
// 정보가 전국 영상에 들어간 셈. 사용자 결정에 따라 지역 한정 사업은 아예 제외한다.
//
// 다만 "조용히 버리지 않는다" — 무엇을 왜 뺐는지 남겨서 화면에서 확인할 수 있게 한다
// (요구서의 "형식적 통과 표시 금지 / 판단 근거를 남길 것" 원칙).

// 광역시·도 이름. "시/군/구"로 끝나는 지명은 따로 정규식으로 잡는다.
const WIDE_REGIONS = [
  "서울", "부산", "대구", "인천", "광주광역시", "대전", "울산", "세종",
  "경기도", "강원", "충청북도", "충북", "충청남도", "충남",
  "전라북도", "전북", "전라남도", "전남", "경상북도", "경북",
  "경상남도", "경남", "제주",
];

// 지역 한정임을 직접 드러내는 표현.
const LOCAL_MARKERS = ["지자체", "지역 사업", "지역사업", "해당 지역", "관내", "거주자에 한", "시민만", "도민만"];

// "○○시", "○○군", "○○구" 형태의 기초자치단체 이름 (앞에 한글 1~4자).
const MUNICIPALITY_RE = /[가-힣]{1,4}(시|군|구)(?![ا-힣])/;

export interface RegionScopeResult {
  isRegional: boolean;
  reason: string; // 어떤 표현을 보고 지역 한정이라고 봤는지
}

export function checkRegionScope(title: string, summary: string): RegionScopeResult {
  const haystack = `${title} ${summary}`;

  for (const m of LOCAL_MARKERS) {
    if (haystack.includes(m)) return { isRegional: true, reason: `"${m}" 표현이 있음` };
  }
  for (const r of WIDE_REGIONS) {
    // 제목에 지역명이 있으면 그 지역 전용 사업일 가능성이 높다(요약에만 있으면 예시일 수 있음).
    if (title.includes(r)) return { isRegional: true, reason: `제목에 지역명 "${r}"이 들어감` };
  }
  const muni = MUNICIPALITY_RE.exec(title);
  // "중소기업", "우선지원대상기업"처럼 지명이 아닌 말이 걸리지 않도록 흔한 낱말은 뺀다.
  if (muni && !["대상기업", "중소기업", "중견기업", "사업구", "지구"].some((w) => title.includes(w) && title.includes(muni[0]))) {
    const NON_PLACE = ["시행", "시책", "실시", "시범", "시간", "시급", "구분", "구성", "구직", "구인", "군인"];
    if (!NON_PLACE.some((w) => w.startsWith(muni[0]) || muni[0].startsWith(w.slice(0, 2)))) {
      return { isRegional: true, reason: `제목에 지자체 이름으로 보이는 "${muni[0]}"이 들어감` };
    }
  }
  return { isRegional: false, reason: "" };
}
