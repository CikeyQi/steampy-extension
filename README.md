# SteamPY 浏览器插件

SteamPY 浏览器插件会在 Steam 商店游戏购买区域显示 SteamPY 的代购价格、CDK 价格和相对 Steam 标价的折扣信息。点击价格可直接打开对应的 SteamPY 页面。

## 安装

1. 下载或克隆本项目。
2. 在 Chrome、Edge 等 Chromium 浏览器中打开扩展管理页（Chrome 地址为 `chrome://extensions`）。
3. 开启“开发者模式”，点击“加载已解压的扩展程序”，选择项目根目录。
4. 打开任意 Steam 游戏商店页面（例如 `https://store.steampowered.com/app/` 后接游戏 App ID）。

## 使用

- 价格信息会自动出现在 Steam 的购买选项下方。
- 点击价格可打开 SteamPY 对应商品页面。
- 未配置 accessToken 时，CDK 价格可能是缓存价格，并会显示提示标记。
- 点击价格区域左侧 SteamPY 图标，在居中弹窗中输入个人 `accessToken`，即可查询实时 CDK 最低价。

accessToken 只保存在浏览器扩展的本地存储中，并通过扩展后台请求发送给 SteamPY。请勿在公共电脑上保存个人 token。

## 权限说明

- `storage`：保存用户主动配置的 SteamPY accessToken。
- 打开页面：使用浏览器的标签页 API，在用户点击价格后打开 SteamPY 商品页面，不读取其他标签页内容。
- Steam 商店页面脚本权限：读取购买选项和 Steam 标价并插入价格信息。
- SteamPY 网络权限：请求游戏价格及实时 CDK 数据。

## 开发与检查

项目不需要构建步骤，修改文件后在扩展管理页点击“重新加载”即可生效。需要 Node.js 18 或更高版本：

```bash
npm install
npm run check
```

`npm run check` 会运行 helper 单元测试并检查所有 JavaScript 文件语法。

## 已知限制

- 插件仅匹配 Steam 商店的游戏 App 页面，不处理社区、库或搜索页面。
- Steam 页面结构变化可能影响购买区域的识别；遇到异常时请先重新加载扩展并刷新页面。
