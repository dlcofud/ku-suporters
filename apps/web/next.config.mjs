/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@supportlab/core"],
  // core 패키지는 TypeScript 소스에서 "./x.js" 형태로 import 하므로 .ts 파일로 연결해 준다
  webpack: (config) => {
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
  experimental: { serverActions: { bodySizeLimit: "200mb" } },
};
export default nextConfig;
