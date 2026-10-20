# Third-party components

The new application code is distributed under GPL-3.0. Donation artwork is supplied by the project author and is not third-party emulator code.

Emulator binaries are **not checked into this repository**. `scripts/fetch_engine.py` downloads the packages listed in `engine-lock.json` from the official npm registry and verifies their published SHA-512 integrity. The default build currently pins version 4.2.3 of all five packages, matching the author's existing installation. This is a compatibility pin, not a claim that 4.2.3 is the latest release.

| Component | Upstream source / license information |
| --- | --- |
| EmulatorJS | https://github.com/EmulatorJS/EmulatorJS (GPL-3.0) |
| EmulatorJS core build system | https://github.com/EmulatorJS/build |
| FBNeo libretro core | https://github.com/libretro/FBNeo and https://github.com/finalburnneo/FBNeo (see upstream license) |
| MAME 2003 Plus | https://github.com/libretro/mame2003-plus-libretro (see upstream license) |
| FBA 2012 CPS1 / CPS2 | https://github.com/libretro/fbalpha2012_cps1 and https://github.com/libretro/fbalpha2012_cps2 (see upstream licenses) |
| Python base image | https://hub.docker.com/_/python (Python and base-system licenses apply) |

The application GPL license does not replace core-specific licenses. ROMs, BIOS files, game artwork and game preview media are not included in the repository or default container. Screenshots and the promotional demonstration show the author's local imported collection; they are not a downloadable game bundle.

For the exact npm archives used by a build, including names, versions, URLs and checksums, consult `engine-lock.json`. Upstream source and license links are provided above; review the relevant upstream component's terms before redistributing modified emulator/core binaries.
