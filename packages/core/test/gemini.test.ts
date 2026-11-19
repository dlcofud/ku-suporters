import { describe, expect, it } from "vitest";
import { GeminiClient } from "../src/llm/index.js";

type Call = { url: string; headers: Record<string, string>; body: Record<string, any> };
function fakeFetch(responses: { status: number; body: unknown }[]) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)]!;
    return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}
const ok = (text: string, extra: Record<string, unknown> = {}) => ({
  candidates: [{ content: { parts: [{ text: "생각 중…", thought: true }, { text }] }, finishReason: "STOP" }],
  usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: 50 },
  modelVersion: "gemini-x-flash",
  ...extra,
});
const req = { system: "시스템", user: "질문", maxOutputTokens: 400, schema: { type: "object", properties: { a: { type: "string" } }, required: ["a"] } };

describe("GeminiClient", () => {
  it("키는 헤더로, 스키마는 responseJsonSchema로 보내고 생각 부분은 빼고 답을 모은다", async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: ok('{"a":"답"}') }]);
    const r = await new GeminiClient("KEY", "gemini-flash-latest", { fetchImpl: impl }).complete({ ...req, images: [{ mediaType: "image/png", data: "AAAA" }] });
    expect(calls[0]!.url).toContain("/v1beta/models/gemini-flash-latest:generateContent");
    expect(calls[0]!.url).not.toContain("KEY");
    expect(calls[0]!.headers["x-goog-api-key"]).toBe("KEY");
    const g = calls[0]!.body.generationConfig;
    expect(g.responseMimeType).toBe("application/json");
    expect(g.responseJsonSchema).toEqual(req.schema);
    expect(g.maxOutputTokens).toBe(2048);
    expect(g.thinkingConfig).toEqual({ thinkingLevel: "low" }); // 기본 high는 1분을 넘길 수 있다
    expect(calls[0]!.body.contents[0].parts[0]).toEqual({ inline_data: { mime_type: "image/png", data: "AAAA" } });
    expect(r.text).toBe('{"a":"답"}');
    expect(r.inputTokens).toBe(120);
    expect(r.outputTokens).toBe(80); // 답 30 + 생각 50
    expect(r.model).toBe("gemini-x-flash");
  });

  it("생각 설정을 거절하면(400) 빼고, 그래도 400이면 스키마도 빼고 다시 묻는다", async () => {
    const one = fakeFetch([{ status: 400, body: "Unknown field thinkingLevel" }, { status: 200, body: ok('{"a":"c"}') }]);
    expect((await new GeminiClient("KEY", "gemini-2.5-flash", { fetchImpl: one.impl }).complete(req)).text).toBe('{"a":"c"}');
    expect(one.calls[1]!.body.generationConfig.thinkingConfig).toBeUndefined();
    expect(one.calls[1]!.body.generationConfig.responseJsonSchema).toEqual(req.schema);

    const { impl, calls } = fakeFetch([{ status: 400, body: "bad" }, { status: 400, body: "Unknown name responseJsonSchema" }, { status: 200, body: ok('{"a":"b"}') }]);
    const r = await new GeminiClient("KEY", "m", { fetchImpl: impl }).complete(req);
    expect(calls).toHaveLength(3);
    expect(calls[2]!.body.generationConfig.responseJsonSchema).toBeUndefined();
    expect(calls[2]!.body.systemInstruction.parts[0].text).toContain("JSON 스키마");
    expect(r.text).toBe('{"a":"b"}');
  });

  it("사용량 초과(429)면 한 번 쉬고 다시 시도하고, 계속이면 알아보기 쉬운 오류를 낸다", async () => {
    const a = fakeFetch([{ status: 429, body: "quota" }, { status: 200, body: ok("안녕") }]);
    expect((await new GeminiClient("K", "m", { fetchImpl: a.impl, retryDelayMs: 1 }).complete({ system: "s", user: "u", maxOutputTokens: 10 })).text).toBe("안녕");
    const b = fakeFetch([{ status: 429, body: "quota" }]);
    await expect(new GeminiClient("K", "m", { fetchImpl: b.impl, retryDelayMs: 1 }).complete({ system: "s", user: "u", maxOutputTokens: 10 })).rejects.toThrow("무료 사용량");
  });

  it("thinkingLevel off면 생각 설정을 보내지 않고, 시간 제한을 넘기면 알아보기 쉬운 오류", async () => {
    const a = fakeFetch([{ status: 200, body: ok("x") }]);
    await new GeminiClient("K", "m", { fetchImpl: a.impl, thinkingLevel: "off" }).complete({ system: "s", user: "u", maxOutputTokens: 10 });
    expect(a.calls[0]!.body.generationConfig.thinkingConfig).toBeUndefined();
    const slow = (async (_u: string, init: RequestInit) =>
      new Promise((_, rej) => init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("t"), { name: "TimeoutError" }))))) as unknown as typeof fetch;
    await expect(new GeminiClient("K", "m", { fetchImpl: slow, timeoutMs: 20 }).complete({ system: "s", user: "u", maxOutputTokens: 10 })).rejects.toThrow("안에 답하지 않았어요");
  });

  it("키·모델 오류를 한국어로 알려 준다", async () => {
    const bad = fakeFetch([{ status: 400, body: "API key not valid" }]);
    await expect(new GeminiClient("K", "m", { fetchImpl: bad.impl }).complete({ system: "s", user: "u", maxOutputTokens: 10 })).rejects.toThrow("키가 맞지 않아요");
    const nf = fakeFetch([{ status: 404, body: "not found" }]);
    await expect(new GeminiClient("K", "없는모델", { fetchImpl: nf.impl }).complete({ system: "s", user: "u", maxOutputTokens: 10 })).rejects.toThrow("없는모델");
    expect(() => new GeminiClient("")).toThrow();
  });
});
