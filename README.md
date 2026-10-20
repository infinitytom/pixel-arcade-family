# 像素放映厅 · 家庭版

**让你的飞牛 NAS，变成家里的街机游戏厅。**

中文游戏库、分类搜索、封面与视频预览、收藏、最近游玩。打开浏览器即可游玩，无需续映账号。适合飞牛 fnOS，也可部署在能运行 Docker 的 Linux 主机上。

![家庭版大厅](docs/library.png)

[飞牛图文部署教程](docs/fnos.md) · [资源与导入说明](docs/resources.md) · [常见问题](docs/faq.md) · [宣传视频](https://github.com/infinitytom/pixel-arcade-family/releases/latest) · [支持作者](#支持作者)

## 快速部署

下载本仓库的 ZIP 并解压，或执行：

```sh
git clone https://github.com/infinitytom/pixel-arcade-family.git
cd pixel-arcade-family
mkdir -p roms
docker compose up -d --build
```

打开 `http://你的NAS地址:18888`。第一次构建需要从 Docker Hub 获取 Python 镜像，从 npm 官方仓库下载锁定版本的模拟器和四个核心。完成构建后，网页和核心由 NAS 本地提供，游玩不依赖外部 CDN。

飞牛用户可以直接在 Docker → Compose 中选择解压后的项目目录创建项目，详见[逐步教程](docs/fnos.md)。已有 18888 端口服务时，复制 `.env.example` 为 `.env`，修改 `ARCADE_PORT=18891` 后再启动。

## 放入游戏

```text
roms/
├── fbneo/
│   └── 你的游戏.zip
├── mame2003_plus/
│   └── 你的游戏.zip
└── 你的整合包/
    ├── gamelist.xml
    ├── 动作街机/
    │   └── 你的游戏.zip
    └── images/
```

- 只有 ROM：自动按文件名展示；上级文件夹作为分类。
- 有 `gamelist.xml`：读取中文名、简介、厂商、排序关键词、封面、视频和 Logo；引用文件必须在挂载目录内。
- 保留整合目录的相对位置，ROM 自身的 ZIP 不解压、不重命名。外层整合包的 7z 需要解压，避免把整个整合包当成单款游戏。
- 新增或删除文件后等待约 15 秒，刷新大厅。运行时以只读方式访问游戏目录。
- 支持四个街机核心。以核心名命名的上级文件夹优先指定核心，其余使用 `.env` 中的 `DEFAULT_CORE`。
- `neogeo.zip` 等 BIOS 不作为游戏展示。可把 `neogeo.zip` 放在 ROM 同目录或挂载根目录；其他系统的 BIOS/父 ROM 请按相应核心要求放置。也可提供自己的 `collection-bios.zip`，会优先使用。

作者提供的 1464 款 FBNeo 整理资源链接在[资源说明](docs/resources.md)。仓库、镜像和发布包均不附带 ROM、BIOS 或整合包封面视频；资源获取与软件部署相互独立。

## 家庭版有什么

| 功能 | 说明 |
| --- | --- |
| 中文大厅 | 分类、搜索、分页、名称排序、详情与预览 |
| 自动目录 | 扫描 ZIP/7z，读取可选 gamelist.xml |
| 我的收藏 / 最近游玩 | 保存在当前浏览器 |
| 模拟器 | EmulatorJS 4.2.3 + FBNeo / MAME 2003 Plus / FBA CPS1 / FBA CPS2 |
| 控制器检测 | 浏览器 Gamepad、键盘输入与 WebGL 检测 |
| 独立部署 | 单容器，无数据库、无账号、无续映依赖 |
| 自愿赞助 | README 与大厅内入口；所有功能免费 |

游戏运算发生在打开网页的电脑、手机或电视浏览器中，NAS 负责提供文件。性能取决于游玩设备、浏览器及 ROM 与核心的匹配程度。1464 是整理资源的数量，不代表全部游戏已验证兼容。

家庭版用于可信局域网，无登录鉴权。请将端口限制在家庭网络中。USB 手柄在部分浏览器中需要可信 HTTPS；键盘与触屏可先用 HTTP。存档、收藏和最近记录不跨设备同步，清理浏览器前请导出存档。

## 配置与维护

复制 `.env.example` 为 `.env`，按需修改：

```dotenv
ARCADE_PORT=18888
ROM_DIR=/vol2/1000/games/fbneo
DEFAULT_CORE=fbneo
```

`ROM_DIR` 可以省略，默认使用项目旁的 `roms`。具体飞牛目录以文件管理中复制的真实路径为准。容器以 UID/GID 10001 运行，目录需要可遍历、文件需要可读；不要为此开放写入权限。

更新：先备份项目配置、游戏目录与浏览器导出的存档，再拉取源码并运行 `docker compose up -d --build`。停止：`docker compose down`，游戏目录不会随容器移除。建议更新前保留旧镜像。

不使用 Docker 的本地开发：

```sh
python scripts/fetch_engine.py
python server.py
```

使用 Python 3.12+，默认监听 8080。可用 `ROM_ROOT`、`ENGINE_ROOT`、`HOST`、`PORT` 环境变量指定目录和监听地址。验证命令：`python -m unittest discover -s tests -v`。

## 支持作者

如果这个项目让你的 NAS 多了一点乐趣，欢迎点 Star，或自愿请作者喝一杯。赞助不解锁功能，不与游戏资源挂钩。

<img src="site/library/assets/alipay-donate.jpg" alt="infinitytom 的支付宝赞助码" width="260">

支付前请核对收款名：`infinitytom(*吴)`。

## 致谢与许可

感谢 [EmulatorJS](https://github.com/EmulatorJS/EmulatorJS)、[FBNeo](https://github.com/finalburnneo/FBNeo)、[MAME 2003 Plus](https://github.com/libretro/mame2003-plus-libretro) 和 libretro 社区。本项目的新增源码以 GPL-3.0 发布，见 [LICENSE](LICENSE)。模拟器及各核心的源码、许可证和分发说明见 [THIRD_PARTY.md](THIRD_PARTY.md)，各第三方组件保留自身许可。

本项目为社区家庭街机工具，与飞牛官方无隶属关系。
