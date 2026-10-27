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

Offline source patch: after verified extraction, `scripts/fetch_engine.py` replaces the optional CDN version-check URL in `data/src/emulator.js` with `/data/version.json`, the bundled upstream manifest. This avoids an unhandled network error when the browser is offline. The patch is visible in the fetch script; emulator and core binary code is otherwise unmodified. The patched JavaScript source is served in the container at `/data/src/emulator.js` with the original upstream notices retained.

## 可选原生金手指数据库

下载器接入 https://github.com/finalburnneo/FBNeo-cheats 与 https://github.com/libretro/mame2003-plus-libretro/blob/master/metadata/cheat.dat ，仅在使用者运行下载命令时取得资源。源码与发布包不附带数据库；上游未明确提供独立数据库再分发许可，不能将本项目 GPL 视为其许可。安装文件保留来源、SHA-256 与 MAME 原始署名。详见 [更新指南](docs/update.md)。新增边框为本项目 CSS 原创图形，滤镜复用既有 EmulatorJS 内置着色器及其原始许可。

## 画面比例资料与操作音

`site/library/game-layouts.json` 仅包含 ROM 集名称与显示宽高比的派生事实，不包含 ROM、原始 XML/DAT、游戏海报或音频。资料由 `scripts/fetch_layouts.py` 从官方 [MAME 2003 Plus metadata](https://github.com/libretro/mame2003-plus-libretro/blob/master/metadata/mame2003-plus.xml) 和 [libretro/FBNeo DAT](https://github.com/libretro/FBNeo/tree/master/dats) 提取，原始地址及 SHA-256 保留在 JSON 的 sources 字段。游戏资源及上游原始数据库仍遵循各自条款。

操作音由本项目的 `sounds.js` 用 Web Audio 三角波与音量包络原创合成，不使用外部采样或录音。发布页的试听 WAV 为同一程序实际输出的录制。
