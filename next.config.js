const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: '/funnel', destination: '/get-started', permanent: true },
    ];
  },
}
module.exports = nextConfig
