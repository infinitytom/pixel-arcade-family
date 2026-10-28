# v1.3.1：正面机台与本地数据说明

- 恢复正面机台和设置预览，游戏画面保持水平、垂直。边框通过对称侧条、玻璃凹陷和控制台压边体现真实厚度。
- 明确收藏、历史、继续点及设置仅在当前浏览器保存；登录用于区分本机账号，尚无服务器备份或跨设备自动同步。收藏历史导出不包含游戏存档。

## 更新部署

Git 用户在原目录运行 `git pull --ff-only`，然后 `docker compose up -d --build`。ZIP 用户下载 `pixel-arcade-family-v1.3.1.zip`，合并程序文件并在原 Compose 项目重新构建。保留 `.env`、ROM、cheats、自定义路径和已导入的 `site/library/private-shaders.json`。公开包不附带作者滤镜资源。

保持原协议、域名、端口和账号；关闭旧游戏页并刷新大厅，缓存标识为 `arcade9`。不要清除网站数据。校验文件为 `SHA256SUMS-v1.3.1.txt`。详见 [更新部署指南](update.md)。
