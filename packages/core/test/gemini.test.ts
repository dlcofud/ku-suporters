import { describe, expect, it } from "vitest";
import { GeminiClient } from "../src/llm/index.js";

type Call = { url: string; model: string; headers: Record<string, string>; body: Record<string, any> };
type Reply = { status: number; body: unknown } | "hang";

/** 모델마다 차례로 답을 정해 두는 가짜 fetch. "hang"이면 시간 초과까지 답하지 않는다 */
function fakeFetch(byModel: Record<string, Reply[]>) {
  const calls: Call[] = [];
  const seen: Record<string, number> = {};
  const impl = (async (url: string, init: RequestInit) => {
    const model = decodeURIComponent(url.match(/models\/([^:]+):/)![1]!);
    calls.push({ url, model, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    const list = byModel[model] ?? [{ status: 404, body: "not found" }];
    const r = list[Math.min(seen[model] ?? 0, list.length - 1)]!;
    seen[model] = (seen[model] ?? 0) + 1;
    if (r === "hang")
      return new Promise((_, rej) => init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("t"), { name: "TimeoutError" }))));
    return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}
const ok = (text: string, version = "gemini-x-flash") => ({
  candidates: [{ content: { parts: [{ text: "생각 중…", thought: true }, { text }] }, finishReason: "STOP" }],
  usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: 50 },
  modelVersion: version,
});
const busy = { status: 503, body: { error: { code: 503, message: "This model is currently experiencing high demand.", status: "UNAVAILABLE" } } };
const req = { system: "시스템", user: "질문", maxOutputTokens: 400, schema: { type: "object", properties: { a: { type: "string" } }, required: ["a"] } };
const small = { system: "s", user: "u", maxOutputTokens: 10 };

describe("GeminiClient", () => {
  it("키는 헤더로, 스키마는 responseJsonSchema로, 생각은 minimal로 보내고 생각 부분은 빼고 답을 모은다", async () => {
    const { impl, calls } = fakeFetch({ "gemini-flash-latest": [{ status: 200, body: ok('{"a":"답"}') }] });
    const r = await new GeminiClient("KEY", "gemini-flash-latest", { fetchImpl: impl }).complete({ ...req, images: [{ mediaType: "image/png", data: "AAAA" }] });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("/v1beta/models/gemini-flash-latest:generateContent");
    expect(calls[0]!.url).not.toContain("KEY");
    expect(calls[0]!.headers["x-goog-api-key"]).toBe("KEY");
    const g = calls[0]!.body.generationConfig;
    expect(g.responseMimeType).toBe("application/json");
    expect(g.responseJsonSchema).toEqual(req.schema);
    expect(g.thinkingConfig).toEqual({ thinkingLevel: "minimal" });
    expect(g.maxOutputTokens).toBe(1024); // 400 × 1.5 → 최소 1024
    expect(calls[0]!.body.contents[0].parts[0]).toEqual({ inline_data: { mime_type: "image/png", data: "AAAA" } });
    expect(r.text).toBe('{"a":"답"}');
    expect(r.inputTokens).toBe(120);
    expect(r.outputTokens).toBe(80); // 답 30 + 생각 50
    expect(r.finishReason).toBe("STOP");
  });

  it("첫 모델이 붐비면(503) 가벼운 모델로 넘어간다 — 배포 사이트에서 실제로 난 상황", async () => {
    const { impl, calls } = fakeFetch({ "gemini-flash-latest": [busy], "gemini-flash-lite-latest": [{ status: 200, body: ok('{"a":"lite"}', "gemini-lite-x") }] });
    const r = await new GeminiClient("KEY", "gemini-flash-latest", { fetchImpl: impl }).complete(req);
    expect(calls.map((c) => c.model)).toEqual(["gemini-flash-latest", "gemini-flash-lite-latest"]);
    expect(r.text).toBe('{"a":"lite"}');
    expect(r.model).toBe("gemini-lite-x");
  });

  it("첫 모델이 답 없이 멈추면 시간 제한 뒤 다음 모델로 넘어간다", async () => {
    const { impl, calls } = fakeFetch({ m1: ["hang"], m2: [{ status: 200, body: ok("살았다") }] });
    const r = await new GeminiClient("K", "m1", { fetchImpl: impl, timeoutMs: 30, fallbackModels: ["m2"] }).complete(small);
    expect(calls.map((c) => c.model)).toEqual(["m1", "m2"]);
    expect(r.text).toBe("살았다");
  });

  it("모두 붐비면 어떤 모델이 왜 실패했는지 알려 준다", async () => {
    const all = fakeFetch({ m1: [busy], m2: ["hang"] });
    await expect(new GeminiClient("K", "m1", { fetchImpl: all.impl, timeoutMs: 30, fallbackModels: ["m2"] }).complete(small)).rejects.toThrow(/붐벼서.*m1: 503.*m2: 0초 안에 답 없음/);
    const quota = fakeFetch({ m1: [{ status: 429, body: "quota" }], m2: [{ status: 429, body: "quota" }] });
    await expect(new GeminiClient("K", "m1", { fetchImpl: quota.impl, fallbackModels: ["m2"] }).complete(small)).rejects.toThrow("무료 사용량");
  });

  it("생각 설정을 거절하면(400) 빼고, 그래도 400이면 스키마도 빼고 같은 모델에 다시 묻는다", async () => {
    const one = fakeFetch({ "gemini-2.5-flash": [{ status: 400, body: "Unknown field thinkingLevel" }, { status: 200, body: ok('{"a":"c"}') }] });
    expect((await new GeminiClient("KEY", "gemini-2.5-flash", { fetchImpl: one.impl }).complete(req)).text).toBe('{"a":"c"}');
    expect(one.calls[1]!.body.generationConfig.thinkingConfig).toBeUndefined();
    expect(one.calls[1]!.body.generationConfig.responseJsonSchema).toEqual(req.schema);

    const two = fakeFetch({ m: [{ status: 400, body: "bad" }, { status: 400, body: "Unknown name responseJsonSchema" }, { status: 200, body: ok('{"a":"b"}') }] });
    expect((await new GeminiClient("KEY", "m", { fetchImpl: two.impl }).complete(req)).text).toBe('{"a":"b"}');
    expect(two.calls).toHaveLength(3);
    expect(two.calls[2]!.body.generationConfig.responseJsonSchema).toBeUndefined();
    expect(two.calls[2]!.body.systemInstruction.parts[0].text).toContain("JSON 스키마");
  });

  it("thinkingLevel off면 생각 설정을 보내지 않고, 대체 모델은 중복 없이 차례대로", async () => {
    const a = fakeFetch({ m: [{ status: 200, body: ok("x") }] });
    await new GeminiClient("K", "m", { fetchImpl: a.impl, thinkingLevel: "off" }).complete(small);
    expect(a.calls[0]!.body.generationConfig.thinkingConfig).toBeUndefined();
    expect(new GeminiClient("K", "a", { fallbackModels: ["a", "b"] }).models).toEqual(["a", "b"]);
    expect(new GeminiClient("K", "a", { fallbackModels: [] }).models).toEqual(["a"]);
  });

  it("키 오류는 바로 알려 주고(다른 모델로 넘어가지 않음), 모델이 하나도 없으면 GEMINI_MODEL을 짚는다", async () => {
    const bad = fakeFetch({ m: [{ status: 400, body: "API key not valid" }] });
    await expect(new GeminiClient("K", "m", { fetchImpl: bad.impl }).complete(req)).rejects.toThrow("키가 맞지 않아요");
    expect(bad.calls).toHaveLength(1);
    const nf = fakeFetch({});
    await expect(new GeminiClient("K", "없는모델", { fetchImpl: nf.impl, fallbackModels: [] }).complete(small)).rejects.toThrow("없는모델");
    expect(() => new GeminiClient("")).toThrow();
  });
});
