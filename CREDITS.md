# Credits and third-party assets

Every third-party file shipped with Hit Jonh is listed here with its source and licence. The licence texts are included in `public/licenses/` and are served with the build.

## Fonts

| Asset | File(s) | Author | Licence | Source |
| --- | --- | --- | --- | --- |
| Luckiest Guy (latin subset, woff2) | `src/assets/fonts/luckiest-guy-latin.woff2` | Brian J. Bonislawsky, Astigmatic (AOETI) | Apache License 2.0 (`public/licenses/LICENSE-LuckiestGuy.txt`) | Google Fonts (`fonts.gstatic.com`); licence and metadata from `github.com/google/fonts/tree/main/apache/luckiestguy` |
| Nunito (latin subset, variable weight, woff2) | `src/assets/fonts/nunito-latin.woff2` | The Nunito Project Authors (Vernon Adams, Cyreal, Jacques Le Bailly) | SIL Open Font License 1.1 (`public/licenses/OFL-Nunito.txt`) | Google Fonts (`fonts.gstatic.com`); licence from `github.com/google/fonts/tree/main/ofl/nunito` |

## Sound effects

| Asset | File(s) | Author | Licence | Source |
| --- | --- | --- | --- | --- |
| Kenney "Impact Sounds" 1.0, 15 of 130 files, unmodified Ogg Vorbis | `public/audio/impact*.ogg` | Kenney (www.kenney.nl) | Creative Commons Zero (CC0 1.0), per the pack's `License.txt` (`public/licenses/Kenney-Impact-Sounds-CC0.txt`) | `https://kenney.nl/assets/impact-sounds` (downloaded 7 October 2026) |

CC0 does not require attribution. Kenney is credited here anyway.

## Made for this project (no third-party licence)

- **All visual art** (Jonh, hats, cannon, scenery, effects, map previews, UI icons) is original SVG, authored in code in `src/art/` and `src/ui/`, and rasterized at runtime.
- **The music loop** ("Sunday Stroll", `src/audio/music.ts`) and every synthesized sound layer (yelps, whoosh, slide whistle, fuse, birdsong, UI ticks) are original and generated with the Web Audio API at runtime.
- **The comic words** (BONK!, WHAM!…) are rendered at runtime with Luckiest Guy (see above).

## Software

The runtime and tooling dependencies are listed in `package.json`, with their own licences in `node_modules/`. Phaser is MIT-licensed.
