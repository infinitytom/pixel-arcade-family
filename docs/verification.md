# v1.0.0 验证记录

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
