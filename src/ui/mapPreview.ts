/** Small scene illustrations share the same layouts as the playable maps. */
export function mapPreview(id: string): string {
  const obstacle = id === 'backyard'
    ? '<rect x="94" y="63" width="48" height="55" fill="#bd8c56"/><path d="M94 63h48v8H94z" fill="#70523a"/><rect x="110" y="87" width="17" height="31" fill="#70523a"/>'
    : id === 'fence'
      ? '<rect x="115" y="82" width="10" height="36" fill="#a7754c"/><path d="M119 83v34" stroke="#70523a"/>'
      : '<rect x="160" y="40" width="85" height="78" fill="#a8b9c5"/><path d="M154 40h97" stroke="#23324b" stroke-width="6"/><path d="M173 59h18v18h-18zm39 0h18v18h-18zm-39 29h18v18h-18zm39 0h18v18h-18z" fill="#def4ec"/>';
  const jonhY = id === 'rooftop' ? 15 : 92;
  return `<svg viewBox="0 0 300 140" aria-hidden="true" class="map-preview">
    <rect width="300" height="140" fill="#def4ec"/>
    <path d="M0 100q40-35 80 0t80 0t80 0t80 0v40H0" fill="#b4d4b4"/>
    <path d="M0 118h300v22H0" fill="#72966a"/>
    <ellipse cx="60" cy="28" rx="30" ry="8" fill="#fff"/>
    <g stroke="#23324b" stroke-width="2" stroke-linejoin="round">${obstacle}
    <circle cx="35" cy="112" r="8" fill="#23324b"/><path d="M33 102l23-13 5 9-23 12z" fill="#645ee8"/>
    <g transform="translate(213 ${jonhY})"><path d="M0 13v12m9-12v12"/><rect x="-2" y="3" width="13" height="14" fill="#ee7357"/><circle cx="4" cy="0" r="6" fill="#f0c299"/><path d="M-4-5h16" stroke="#70523a" stroke-width="4"/><path d="M-5 8l14-2 3 9-14 2z" fill="#fff"/></g></g>
  </svg>`;
}

export const MAP_DESCRIPTIONS: Record<string, string> = {
  backyard: 'Arc over the garden shed. Afternoon peace is overrated.',
  fence: 'Clear the fence. Settle the neighbourhood dispute.',
  rooftop: 'A higher target. A very inconvenient lunch break.',
};

export const HOME_ILLUSTRATION = `<svg viewBox="0 0 420 360" role="img" aria-label="Jonh reads his newspaper beside a garden shed while a cannonball approaches">
  <rect x="15" y="30" width="390" height="310" rx="38" fill="#def4ec"/>
  <circle cx="326" cy="88" r="31" fill="#ffd35c"/>
  <path d="M15 258q80-85 145 0t120 0t125 0v44q0 38-38 38H53q-38 0-38-38z" fill="#b4d4b4"/>
  <g stroke="#23324b" stroke-width="5" stroke-linejoin="round">
    <path d="M50 167h105v146H50z" fill="#bd8c56"/><path d="M44 167h117v18H44z" fill="#70523a"/>
    <path d="M77 245h46v68H77z" fill="#70523a"/><path d="M70 199h63v29H70z" fill="#def4ec"/>
    <path d="M225 226l-15 98m-12-78 116 9m-16-23 25 92" fill="none"/>
    <path d="M252 246l12 56 40 3m-66-51-8 56 32 11" fill="none" stroke-width="13"/>
    <path d="M234 164q-26 38 0 91l54-9q10-55-18-80z" fill="#ee7357"/>
    <ellipse cx="255" cy="141" rx="27" ry="33" fill="#f0c299"/>
    <path d="M220 123h71m-57-4 5-26 40 5 4 24" fill="#ffd35c"/>
    <path d="M239 143h8m18 0h8m-27 16q10 6 19-1" fill="none" stroke-width="3"/>
    <path d="M210 180l43 9 40-11-3 57-40 9-42-12z" fill="#f7fafb"/>
    <path d="M253 189v55m-32-48 21 4m-20 9 18 4m27-16 13-4m-14 14 13-4" fill="none" stroke-width="2"/>
    <circle cx="74" cy="67" r="14" fill="#23324b"/>
    <path d="M32 52l21 7m-21 11 20-2" stroke="#645ee8" stroke-dasharray="4 5"/>
  </g>
</svg>`;
