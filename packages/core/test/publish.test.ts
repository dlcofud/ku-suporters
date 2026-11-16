import { describe, expect, it } from "vitest";
import { schedulePost, validatePost, tick, cancelPost, MockPublisher, type ScheduledPost } from "../src/publish/index.js";

const now = new Date("2026-11-18T09:00:00Z");
const at = (min: number) => new Date(now.getTime() + min * 60_000);
const base = {
  id: "s1", userId: "u1", igUserId: "ig1", mediaType: "REELS" as const,
  mediaUrl: "https://storage.example.com/reel.mp4", caption: "편의점 신상 3초 리뷰 #리뷰", publishAt: at(120).toISOString(),
};
const token = async () => "token";

describe("publish", () => {
  it("캡션·주소·시각을 검사한다", () => {
    expect(validatePost(base, now)).toEqual([]);
    expect(validatePost({ ...base, caption: Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ") }, now)[0]).toContain("해시태그");
    expect(validatePost({ ...base, mediaUrl: "file:///a.mp4" }, now)).toHaveLength(1);
    expect(validatePost({ ...base, publishAt: at(-1).toISOString() }, now)).toHaveLength(1);
    expect(validatePost({ ...base, caption: "a [여기에 내 경험 한 줄을 직접 써 주세요]" }, now)).toHaveLength(1);
  });

  it("게시 30분 전에 컨테이너를 만들고, 처리 완료 후 정해진 시각에 게시한다", async () => {
    const pub = new MockPublisher();
    let posts: ScheduledPost[] = [schedulePost(base, now)];
    posts = await tick(posts, at(60), pub, token); // 아직 이르다
    expect(posts[0]!.status).toBe("scheduled");
    posts = await tick(posts, at(95), pub, token);
    expect(posts[0]!.status).toBe("container_created");
    posts = await tick(posts, at(100), pub, token); // 처리 중
    expect(posts[0]!.status).toBe("container_created");
    pub.statuses.set(posts[0]!.containerId!, "FINISHED");
    posts = await tick(posts, at(105), pub, token);
    expect(posts[0]!.status).toBe("ready");
    posts = await tick(posts, at(110), pub, token); // 게시 시각 전
    expect(posts[0]!.status).toBe("ready");
    posts = await tick(posts, at(120), pub, token);
    expect(posts[0]).toMatchObject({ status: "published", mediaId: `media_${pub.created[0]}` });
  });

  it("컨테이너가 만료되면 다시 만들고, 한도에 걸리면 기다린다", async () => {
    const pub = new MockPublisher();
    let posts = await tick([schedulePost(base, now)], at(95), pub, token);
    pub.statuses.set(posts[0]!.containerId!, "EXPIRED");
    posts = await tick(posts, at(100), pub, token);
    expect(posts[0]).toMatchObject({ status: "scheduled", containerId: undefined });
    posts = await tick(posts, at(101), pub, token);
    pub.statuses.set(posts[0]!.containerId!, "FINISHED");
    posts = await tick(posts, at(102), pub, token);
    pub.used = 50;
    posts = await tick(posts, at(121), pub, token);
    expect(posts[0]!.status).toBe("ready");
    expect(posts[0]!.log.at(-1)!.message).toContain("한도");
  });

  it("처리 오류가 3번 나면 실패로 끝낸다", async () => {
    const pub = new MockPublisher();
    let posts = [schedulePost(base, now)];
    for (let i = 0; i < 3; i++) {
      posts = await tick(posts, at(95 + i * 2), pub, token);
      pub.statuses.set(posts[0]!.containerId!, "ERROR");
      posts = await tick(posts, at(96 + i * 2), pub, token);
    }
    expect(posts[0]!.status).toBe("failed");
    expect(posts[0]!.attempts).toBe(3);
  });

  it("게시된 콘텐츠는 취소할 수 없다", () => {
    const p = { ...schedulePost(base, now), status: "published" as const };
    expect(() => cancelPost(p, now)).toThrow();
  });
});
