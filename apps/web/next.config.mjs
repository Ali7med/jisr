/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // الحزمة المشتركة تُبنى معنا لا تُستهلك من dist — يبقى العقد مصدراً واحداً
  transpilePackages: ['@jisr/shared'],
};

export default nextConfig;
