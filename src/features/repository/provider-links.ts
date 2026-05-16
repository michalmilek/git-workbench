export function trustedProviderUrl(url: string | null, providerBaseUrl: string): string | null {
  if (url === null) {
    return null;
  }

  try {
    const targetUrl = new URL(url);
    const baseUrl = new URL(providerBaseUrl);

    if (targetUrl.protocol !== "https:" || baseUrl.protocol !== "https:") {
      return null;
    }

    if (targetUrl.origin !== baseUrl.origin) {
      return null;
    }

    if (!pathIsUnderBasePath(targetUrl.pathname, normalizedBasePath(baseUrl.pathname))) {
      return null;
    }

    return targetUrl.toString();
  } catch {
    return null;
  }
}

function normalizedBasePath(pathname: string): string {
  const path = pathname.replace(/\/+$/g, "");
  return path.length === 0 ? "/" : path;
}

function pathIsUnderBasePath(pathname: string, basePath: string): boolean {
  return basePath === "/" || pathname === basePath || pathname.startsWith(`${basePath}/`);
}
