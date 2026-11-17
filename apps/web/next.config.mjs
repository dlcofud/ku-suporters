import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@supportlab/core"],
  // ffmpeg-static은 바이너리 경로를 돌려주는 패키지라 번들하지 않고 그대로 둔다
  serverExternalPackages: ["ffmpeg-static"],
  // 모노레포 루트 기준으로 파일을 추적하고, 영상 편집에 필요한 바이너리·글꼴을 서버 함수에 포함한다
  outputFileTracingRoot: join(here, "../.."),
  outputFileTracingIncludes: {
    "/studio": ["../../node_modules/ffmpeg-static/ffmpeg", "./assets/fonts/**"],
    // 팀 수집 시트 (저장소 루트 data/)
    "/": ["../../data/curated.csv"],
    "/trends": ["../../data/curated.csv"],
  },
  // core 패키지는 TypeScript 소스에서 "./x.js" 형태로 import 하므로 .ts 파일로 연결해 준다
  webpack: (config) => {
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
  experimental: { serverActions: { bodySizeLimit: "200mb" } },
};
export default nextConfig;
