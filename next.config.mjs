/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "better-sqlite3",
    "kokoro-js",
    "@huggingface/transformers",
    "onnxruntime-node",
  ],
};
export default nextConfig;
