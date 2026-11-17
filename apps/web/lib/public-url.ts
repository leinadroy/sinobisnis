/** Browser-facing redirects must use the public origin, not the server bind address. */
export function publicUrl(path: string, request: Request): URL {
  return new URL(path, process.env.SINOBISNIS_PUBLIC_ORIGIN || request.url);
}
