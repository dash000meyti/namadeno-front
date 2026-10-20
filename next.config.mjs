/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The app is client-rendered against a mocked REST API (MSW) in development.
  // When the real backend is ready, set NEXT_PUBLIC_API_MOCKING=disabled and NEXT_PUBLIC_API_BASE_URL.
  async redirects() {
    return [];
  },
};

export default nextConfig;
