import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@supportlab/core"],
  // ffmpeg-static은 바이너리 경로를 돌려주는 패키지라 번들하지 않고 그대로 둔다
  serverExternalPackages: ["ffmpeg-static", "tesseract.js", "tesseract.js-core"],
  // 모노레포 루트 기준으로 파일을 추적하고, 영상 편집에 필요한 바이너리·글꼴을 서버 함수에 포함한다
  outputFileTracingRoot: join(here, "../.."),
  outputFileTracingIncludes: {
    "/studio": ["../../node_modules/ffmpeg-static/ffmpeg", "./assets/fonts/**"],
    // 팀 수집 시트 (저장소 루트 data/)
    "/": ["../../data/curated.csv"],
    // 공고 이미지 글자 읽기 (tesseract 엔진·한국어/영어 학습 데이터)
    "/notice": ["../../node_modules/tesseract.js/**", "../../node_modules/tesseract.js-core/**", "../../node_modules/@tesseract.js-data/kor/4.0.0_best_int/**", "../../node_modules/@tesseract.js-data/eng/4.0.0_best_int/**"],
    "/trends": ["../../data/curated.csv"],
    "/reviews": ["../../data/curated.csv"],
    "/admin/sheet": ["../../data/curated.csv"],
    "/api/sheet/download": ["../../data/curated.csv", "../../data/수집시트.xlsx"],
  },
  // core 패키지는 TypeScript 소스에서 "./x.js" 형태로 import 하므로 .ts 파일로 연결해 준다
  webpack: (config) => {
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
  experimental: { serverActions: { bodySizeLimit: "200mb" } },
};
export default nextConfig;
