const ADMIN_PAGE_PATHS = new Set(['/admin', '/admin/', '/admin/index.html'])

export function isAdminPortalRequest(hostname: string, method: string, pathname: string) {
  return hostname === 'admin.dashcup.com' && method === 'GET' && ADMIN_PAGE_PATHS.has(pathname)
}
