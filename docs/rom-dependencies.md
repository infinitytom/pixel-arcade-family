# 父 ROM 自动加载

街机分包只包含相对父游戏改变的文件，不能仅下载当前 ZIP 后启动。`library/rom-parents.json` 根据 FBNeo 官方 Arcade DAT 和 MAME 2003 Plus 驱动元数据的 `cloneof` 字段生成，仅包含游戏短名关系，不含 ROM 或 BIOS。

启动时读取当前游戏库，按明确的父子关系查找已有父资源。优先使用普通版，避免同名 HACK 包被误当成标准父包；最多向上加载 8 层并阻止循环。父包放入模拟器临时文件系统，不解压覆盖子包。7z 父包沿用临时 ZIP 转换。资源只从当前站点的游戏目录读取，不从网络搜寻 ROM。

例如 `kof97xt.zip`（拳皇97 最终决战）只提供改动文件，程序会一并加载已有的 `kof97.zip`。Neo Geo 的原始 BIOS ZIP 也会保留给 FBNeo，避免通用 BIOS 解压过程使核心找不到 `neogeo.zip`。

父资源不在游戏库时仍需导入合法持有的对应父包。未被当前核心支持的专用改版不能仅靠父包运行；不会用原版偷偷替换玩家选择的 HACK，也不强制切换核心。

元数据来源：[FBNeo DAT](https://github.com/libretro/FBNeo/tree/master/dats)、[MAME 2003 Plus](https://github.com/libretro/mame2003-plus-libretro)。核心版本以项目 `engine-lock.json` 为准；父关系与实际启动分别验证。
