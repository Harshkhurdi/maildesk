import type { NextConfig } from "next";
const config: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["terminal.local"],
  outputFileTracingRoot: process.cwd(),
  webpack(config, { isServer, webpack }) {
    if (!isServer)
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^node:(fs|https)$/,
          process.cwd() + "/lib/browser-node-stub.ts",
        ),
      );
    return config;
  },
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
  // The offline Office SDK uses a few absolute asset paths internally.
  async rewrites() {
    return ["sdkjs", "fonts", "web-apps"].map((p) => ({
      source: `/${p}/:path*`,
      destination: `/office/${p}/:path*`,
    }));
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/office/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
      {
        source: "/office/assets/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      ...[
        "/sdkjs/common/wasm/x2t/x2t.wasm.br",
        "/office/sdkjs/common/wasm/x2t/x2t.wasm.br",
      ].map((source) => ({
        source,
        headers: [
          { key: "Content-Type", value: "application/wasm" },
          { key: "Content-Encoding", value: "br" },
        ],
      })),
    ];
  },
};
export default config;
