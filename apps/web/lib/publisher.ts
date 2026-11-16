import { publish } from "@supportlab/core";
import type { User } from "./store";

/** 데모 게시: 실제로 인스타에 올리지 않고, 처리 완료 → 게시 흐름만 보여준다. */
class DemoPublisher extends publish.MockPublisher {
  override async containerStatus() {
    return "FINISHED" as const;
  }
}

export function publisherFor(user: User): { client: publish.InstagramPublisher; tokenFor: (p: publish.ScheduledPost) => Promise<string>; demo: boolean } {
  if (user.ig) {
    const token = user.ig.accessToken;
    return { client: new publish.GraphApiPublisher(), tokenFor: async () => token, demo: false };
  }
  return { client: new DemoPublisher(), tokenFor: async () => "demo", demo: true };
}
