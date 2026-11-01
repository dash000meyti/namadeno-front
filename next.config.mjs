/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The app is client-rendered against a mocked REST API (MSW) in development.
  // When the real backend is ready, set NEXT_PUBLIC_API_MOCKING=disabled and NEXT_PUBLIC_API_BASE_URL.
  async redirects() {
    return [
      // the operator's reports page was merged into the overview (/op)
      { source: '/op/reports', destination: '/op', permanent: false },
    ];
  },
};

export default nextConfig;
