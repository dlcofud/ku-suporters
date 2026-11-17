/**
 * @supportlab/core — 화면(UI)과 분리된 핵심 로직 모음.
 * 각 모듈은 서로 독립적이고, 저장소·LLM·인스타 API는 인터페이스로 주입한다.
 */
export * as shared from "./shared.js";
export * as credits from "./credits/index.js";
export * as notice from "./notice/index.js";
export * as skeleton from "./skeleton/index.js";
export * as planner from "./planner/index.js";
export * as contribution from "./contribution/index.js";
export * as feedback from "./feedback/index.js";
export * as trends from "./trends/index.js";
export * as llm from "./llm/index.js";
export * as account from "./account/index.js";
export * as content from "./content/index.js";
export * as publish from "./publish/index.js";
// 서버 전용 렌더러는 "@supportlab/core/content/node" 에서 따로 import 한다.
export * as apply from "./apply/index.js";
export * as auth from "./auth/index.js";
// 비밀번호 해시·로그인 토큰은 서버 전용 "@supportlab/core/auth/node" 에서 import 한다.
export * as billing from "./billing/index.js";
