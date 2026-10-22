# 宣传视频与发布文案

## v1.1.2 简短更新说明

[观看更新说明](https://github.com/infinitytom/pixel-arcade-family/releases/download/v1.1.2/pixel-arcade-family-v1.1.2-update.mp4)。约 45 秒、1600×1000、30 fps，无配音、无音轨。录制实际运行的界面，介绍先激活网页、输入状态、手柄设置、恢复默认和操作指南。UU 虚拟手柄大厅操作已有用户确认；视频不演示游戏内或多人验收。

使用含资源的本地服务（默认 `http://127.0.0.1:18893`），安装 Playwright 与 FFmpeg 后运行 `node scripts/record_update.cjs`。可设置 `DEMO_URL` 和 `BROWSER_CHANNEL`。脚本仅在独立浏览器上下文操作界面，不修改用户浏览器配置。成片、预览与时间线保存在 `dist/`。

## 原版宣传片

成片：[GitHub Release 下载](https://github.com/infinitytom/pixel-arcade-family/releases/latest)。

![宣传片封面](promo-poster.png)

视频采用真实浏览器界面录制，去除了核心加载等待时间，保留字幕提示，加入低音量复古合成背景音乐，无配音和赞助码。展示作者本地收藏、中文游戏名搜索、收藏、MAME 游戏启动和导入指南，片尾显示 GitHub 地址。游戏文件没有随项目发布。

录制时屏蔽了浏览器访问外部站点，用于确认游戏核心、ROM 和界面均从本机服务加载。视频中的游戏数属于作者的本地目录；全新部署为空游戏库。

## 建议标题

把街机厅搬进飞牛 NAS！像素放映厅家庭版开源，浏览器直接玩

## 简介

给飞牛 NAS 加一个中文街机游戏大厅：分类、搜索、封面预览、收藏和最近游玩，一个 Compose 项目独立部署，无需续映账号。游戏在电脑、手机或电视的浏览器运行，NAS 负责提供文件。

项目与飞牛部署教程：https://github.com/infinitytom/pixel-arcade-family

作者整理的资源链接与提取码见仓库的资源说明。程序不内置 ROM 或 BIOS，游戏兼容性需按核心和 ROM 版本实测。收藏与存档在当前浏览器，不跨设备同步。

免费开源，欢迎 Star。

标签：飞牛NAS、fnOS、Docker、自部署、复古街机、EmulatorJS、开源

## 重新录制

需自行安装 Playwright、浏览器和 FFmpeg。在本机分别启动含收藏的演示服务（18891）和空目录服务（18892），执行 `node scripts/record_promo.cjs`。可用 `DEMO_URL` 与 `BROWSER_CHANNEL` 覆盖演示地址和浏览器，默认使用本机 Edge。脚本只创建独立浏览器上下文。

执行 `python scripts/render_promo.py` 合成无音轨成片。原始录屏与时间线位于 `dist/`，不提交到 Git；成片作为 Release 附件发布。

背景音乐由 `scripts/add_music.py` 合成，采用原创音符编排与振荡器音色，没有使用第三方采样。安装 NumPy 后，执行 `python scripts/add_music.py`，可将无音轨中间文件合成为带轻背景音乐的版本；音乐有渐入渐出，目标响度约 -27 LUFS。
