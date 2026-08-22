// 파이프라인 API 호출 공용 헬퍼. 서버가 { error } 형태로 실패를 내려주면 그대로 throw해서
// 화면단이 일관되게 잡아 보여줄 수 있게 한다.
export async function callPipeline<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `요청 실패 (HTTP ${res.status})`);
  return data as T;
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `요청 실패 (HTTP ${res.status})`);
  return data as T;
}
