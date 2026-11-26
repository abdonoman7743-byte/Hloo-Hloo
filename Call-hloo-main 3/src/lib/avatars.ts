export function makeSvgAvatar(
  initials: string,
  bgFrom: string,
  bgTo: string
): string {
  const safeText = initials.slice(0, 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bgFrom}" />
        <stop offset="100%" stop-color="${bgTo}" />
      </linearGradient>
    </defs>
    <rect width="160" height="160" rx="40" fill="url(#g)" />
    <circle cx="128" cy="32" r="44" fill="rgba(255,255,255,0.12)" />
    <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="56">${safeText}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
