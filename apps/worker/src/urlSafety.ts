import dns from "node:dns/promises";

/**
 * SSRF guard: resolves the target hostname and rejects private/loopback/link-local
 * addresses (including the 169.254.169.254 cloud-metadata address) before a
 * crawler ever navigates there. This matters once URL submission comes from a
 * form other people can fill in (the platform's job submission API) rather than
 * only from the CLI, per the architecture docs' explicit "SSRF prevention"
 * security control - checked here so discovery.ts enforces it regardless of
 * which caller invokes it.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Not a valid URL: "${rawUrl}"`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Refusing to navigate to a non-http(s) URL: "${rawUrl}"`);
  }

  const addresses = await dns.lookup(url.hostname, { all: true });
  if (addresses.length === 0) {
    throw new Error(`Could not resolve hostname "${url.hostname}".`);
  }

  for (const { address, family } of addresses) {
    if (isPrivateOrReservedIp(address, family)) {
      throw new Error(
        `Refusing to navigate to "${rawUrl}": hostname "${url.hostname}" resolves to a ` +
          `private/reserved address (${address}), which is either misconfigured or an ` +
          `SSRF attempt against internal infrastructure.`
      );
    }
  }

  return url;
}

function isPrivateOrReservedIp(address: string, family: number): boolean {
  if (family === 4) {
    const octets = address.split(".").map(Number);
    const [a, b] = octets;
    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata (169.254.169.254)
    if (a === 0) return true; // "this network"
    return false;
  }

  const lower = address.toLowerCase();
  if (lower === "::1") return true; // loopback
  if (lower.startsWith("fe80:")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
  return false;
}

/** True when `candidateUrl` shares the same hostname as `originUrl` - used to keep the crawler from following links off-site. */
export function isSameOrigin(candidateUrl: string, originUrl: URL): boolean {
  try {
    return new URL(candidateUrl, originUrl).hostname === originUrl.hostname;
  } catch {
    return false;
  }
}
