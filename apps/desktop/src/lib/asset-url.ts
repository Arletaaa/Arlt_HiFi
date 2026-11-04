/**
 * public/ 下的静态资源地址。
 * Vite 的 BASE_URL 自带尾部斜杠（Electron 生产包是 "./"，开发是 "/"），
 * 拼在路径前即可同时适配自定义协议、开发服务器和 GitHub Pages 子路径部署。
 */
export const assetUrl = (path: string): string => `${import.meta.env.BASE_URL}${path.replace(/^\/+/u, "")}`;
