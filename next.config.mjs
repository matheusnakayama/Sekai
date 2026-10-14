/** @type {import('next').NextConfig} */
const nextConfig = {
  // O app desktop abre o servidor de dev por 127.0.0.1; sem isso o Next bloqueia o HMR/recursos de dev.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
};

export default nextConfig;
