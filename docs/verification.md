# v1.0.0 验证记录

## 2026-10-21 手柄与字体更新

新增标准 Gamepad 大厅导航、首次引导与随时可开的操作指南、焦点提示、屏幕键盘、分类和排序、分页、收藏、视频播放与暂停、核心切换、启动和返回后恢复筛选。帮助、赞助、检测页可手柄浏览和返回；游戏页提供暂停菜单和浏览器快捷存读档。正文、游戏名、分类与详情字体已增大。

`scripts/check_gamepad.cjs` 使用 Edge / Chromium 和模拟 Gamepad 验证方向、摇杆死区、弹窗、收藏、预览、核心、翻页边界、长按按钮不重复触发、屏幕键盘、断线重连、启动返回、引导、辅助页面以及 390 / 750 / 1280 / 1920 宽度无横向溢出。游戏菜单暂停和快捷存读档使用模拟的 EmulatorJS 对象验证适配；尚需实际游戏和实体手柄验收，不能据此宣称所有控制器与核心均兼容。Python 的 9 项服务测试通过。

本地运行浏览器检查：安装 Playwright 后执行 `node scripts/check_gamepad.cjs`；Windows 可设置 `BROWSER_CHANNEL=msedge` 使用现有 Edge。CI 在 Chromium 中运行同一检查。

验证日期：2026-10-20。

## 已验证

- Python 目录扫描与 HTTP 服务的 9 项测试通过，包括 XML 相对路径、中文名、核心选择、空目录、异常 XML、XML 实体拒绝、私有文件与路径越界、符号链接拒绝、HEAD 与 Range。
- GitHub Actions 使用 Python 3.12 运行测试，并从官方 npm 下载锁定的模拟器和核心，在干净环境成功构建 Docker 镜像。
- Compose 容器以 UID/GID 10001 运行，健康检查、空库页面与目录接口均正常。
- 本地真实资源目录扫描得到 1463 个游戏条目、14 个分类。原 1464 条记录中的 `uni-bios.zip` 作为 BIOS 排除。
- 浏览器检查覆盖空库、搜索、详情、收藏及刷新后保留、手机宽度布局。
- 宣传片录制时阻止了外部站点请求，MAME 2003 Plus 仍可从本地资源启动《恐龙新世纪》，完成投币和进入选人画面。

CI 状态可在 [Actions](https://github.com/infinitytom/pixel-arcade-family/actions/workflows/check.yml) 查看。

## 验证范围

尚未在第二台飞牛机器的全新安装上操作验收；Docker 干净构建验证在 GitHub Linux runner 上完成。未验证全部 ROM、所有 HACK 版本、真实双人摇杆或每一种电视浏览器。网盘链接与下载包未重新完整下载核验。
