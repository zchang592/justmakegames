# 海风茶档

一款限时经营网页小游戏。在海边茶档接待客人、接单备餐、取餐送到对应餐桌。营业时间为 75 秒，打烊后继续处理剩余订单。

## 录屏观察

- **00:18–00:55**：客人先在门口等位，再被安排到不同桌位。入座后的订单通过气泡提示。
- **01:29–01:50**：玩家要在料理台和座位之间切换。同一时间有几桌等待，选择先服务哪桌会影响得分。
- **02:39–02:57**：门口显示已经打烊，仍需继续照顾场内客人。

原型采用独立的海边茶档主题。等位和桌边各有耐心条，料理台每种餐点一次做一单，托盘一次拿一份。送对桌后记入收入，客人用餐后自动腾出桌位。

## 开发

使用 Node.js 24 和 npm。使用 nvm 时可先运行 `nvm install` 和 `nvm use`。

```sh
npm ci
npm run dev
npm test
npm run build
```

菜单、出餐时间、来客节奏和耐心时限集中在 [src/menu.ts](src/menu.ts)。[src/game.ts](src/game.ts) 负责规则，[src/main.ts](src/main.ts) 将规则接到界面上。

## GitHub Pages

运行 `npm run deploy` 构建游戏并把静态文件发布到 `gh-pages` 分支。仓库的 **Settings → Pages** 使用 **Deploy from a branch**，选择 `gh-pages` 和 `/(root)`。网页资源使用相对路径，支持 GitHub Pages 的仓库子目录。
