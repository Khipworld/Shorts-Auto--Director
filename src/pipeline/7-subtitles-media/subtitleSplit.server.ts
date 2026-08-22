// 자막 재분할: 나레이션 문단 하나를 화면 표시용 짧은 자막 줄들로 쪼개고 타임스탬프를 맞춘다.
// K-Street Evolution Director의 /api/gemini/align-subtitles 엔드포인트(실제로는 Claude 사용)를
// 그대로 재사용 — 화면 쪽 "문단 편집 + 재분할 버튼" UI(EditorConsole.tsx)와 짝을 이루던 서버
// 로직으로, 파라미터 이름 자체가 이미 K-Street 특유의 개념(단계/시대)에 묶여있지 않아 그대로 씀.
import { callClaudeJSON, classifyAnthropicError } from "../../core/claude.server";

function secondsToTimeStr(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export interface SubtitleLine {
  start: string;
  end: string;
  text: string;
}

export async function splitNarrationIntoSubtitles(narration: string, duration: number, startTime: number): Promise<SubtitleLine[]> {
  const prompt = `
    사용자가 입력한 아래 나레이션 대본(narration)을 바탕으로, 비디오 재생 시간 동안 화면에 표출될 자막들을 자동으로 분할하고 타임스탬프를 완벽히 동기화해 주세요.

    [나레이션 대본]:
    "${narration}"

    [요구사항]:
    1. 이 구간의 총 재생 시간은 ${duration}초입니다. (시작 시간: ${secondsToTimeStr(startTime)}, 종료 시간: ${secondsToTimeStr(startTime + duration)}).
    2. 대본 텍스트를 의미 단위로 적절히 분할하여 가독성 높은 한 줄짜리 자막 목록(subtitles)을 생성해 주세요.
       - 자막 개수는 약 3~5개가 적당합니다.
       - 각 자막은 시작 시간과 종료 시간(start, end)을 'MM:SS' 형식으로 가져야 하며, 반드시 지정된 재생 구간 범위 내에 완벽하게 안착해야 합니다.
       - 자막 시간은 서로 겹치거나 누락되어 비는 곳 없이 흐름을 채우며 연결되어야 합니다.
    3. 반드시 한국어로 답변해 주세요.
  `;

  const data = await callClaudeJSON(
    "당신은 영상 자막 싱크 조율 및 텍스트 분할에 전문화된 자막 디렉터입니다. 주어진 영상 타임라인 범위 내에 자막 싱크를 칼같이 할당합니다.",
    prompt,
    "align_subtitles",
    {
      type: "object",
      properties: {
        subtitles: {
          type: "array",
          description: "입력된 나레이션 텍스트를 가독성 높은 한 줄짜리 자막들로 쪼개고 타임스탬프를 부여한 목록",
          items: {
            type: "object",
            properties: {
              start: { type: "string", description: "자막 시작 시간 (MM:SS 형식)" },
              end: { type: "string", description: "자막 종료 시간 (MM:SS 형식)" },
              text: { type: "string", description: "자막 내용 (한 줄 한국어 자막)" },
            },
            required: ["start", "end", "text"],
          },
        },
      },
      required: ["subtitles"],
    }
  );
  return data.subtitles as SubtitleLine[];
}

export { classifyAnthropicError };
