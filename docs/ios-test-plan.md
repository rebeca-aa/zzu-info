# iOS 验收测试计划（交给有 Mac / iPhone 的同学）

目标：验证「自动取票」在真实 iOS Safari 上能不能用。
桌面 Edge 的自动化冒烟已经过了（`npm run userscript:e2e`，11 项），**逻辑本身没问题**；
这份计划只测桌面测不到的东西：iOS Safari、Userscripts 扩展、主屏幕 PWA 的真实行为。

背景和原理见 [ios-login.md](ios-login.md)。

---

## 0. 先看这个：最大的未知数

**iOS 上「主屏幕 PWA」和「Safari 标签页」的本地存储是隔离的。**

自动取票的链路是：

```
主屏幕 PWA → 打开学校登录页（Safari）→ 脚本把票带回 …/pwa/index.html#token=…
```

票会被导入到「跳回来的那个上下文」里。如果那是 Safari 标签页而不是主屏幕 PWA，
**主屏幕里的 App 看不到这张票，仍然是未登录**。我们在 Windows 上完全没法验证这一点，
这是整份计划里最重要的用例（**T6**），请优先做。

另外一个同类疑问：Safari 扩展（包括 Userscripts）在「主屏幕 Web App」窗口里是否生效，
我们也不确定（**T7**）。

这两条的结果直接决定方案能不能成立，请如实记录，不要为了「通过」去调整步骤。

---

## 1. 环境

| 项目 | 要求 |
| --- | --- |
| 设备 | **真机 iPhone 优先**（模拟器没有 App Store，装不了 Userscripts；真要用模拟器需从源码构建，见附录） |
| iOS 版本 | 记录实际版本（建议 16.4+，主屏幕 Web App 行为在这之后有变化） |
| 网络 | 登录 CAS 本身公网可达；**地图卡片（T9）需要校园网** |
| 账号 | 一个真实的郑大统一身份认证账号 |
| Mac | 用于 Safari Web Inspector 看 localStorage（可选但强烈建议，见 §2） |

先在表里填好：

```
设备型号：
iOS 版本：
Safari 版本：
Userscripts 版本：
测试日期：
```

## 2. 准备

### 2.1 装脚本

1. App Store 搜 **Userscripts**（作者 Justin Wasack，免费）装上
2. 打开它，按引导选一个脚本目录
3. 下载脚本：`https://rebeca-aa.github.io/zzu-info/userscript/zzu-info-ticket.user.js`
   放进上一步的目录（文件名保持 `zzu-info-ticket.user.js`）
4. 设置 → Safari → 扩展 → Userscripts → 打开，并把 `uniapp.s.zzu.edu.cn` 设为**允许**

### 2.2 看 localStorage（可选，调试用）

iPhone 设置 → Safari → 高级 → 打开「网页检查器」，USB 连 Mac，
Mac Safari 菜单「开发」→ 你的 iPhone → 选中页面 → 控制台里：

```js
Object.keys(localStorage).filter(k => k.startsWith('zzu-info:'))
localStorage.getItem('zzu-info:autoTicket')   // 期望 "true"（装了脚本并成功回跳后）
```

主屏幕 PWA 的窗口也会出现在「开发」菜单里，注意区分是哪一个。

### 2.3 约定

- 每个用例前先「重置」：App 内「我的 → 其他方式 → 清除」，并用网页检查器删掉 `zzu-info:autoTicket`
- 「Safari 标签页」指直接在 Safari 里打开 `https://rebeca-aa.github.io/zzu-info/`
- 「主屏幕 PWA」指分享 → 添加到主屏幕后从图标启动

---

## 3. 用例

结果栏填：✅ 通过 / ❌ 失败 / ⚠️ 与预期不符（写现象）。**每条都写实际现象，哪怕通过。**

### T1 脚本已安装并生效（前置）

| 步骤 | 期望 |
| --- | --- |
| Safari 打开 `https://uniapp.s.zzu.edu.cn/static/index.a5c69d49.css?ticket=test123` | 页面**立即跳转**到 `…/zzu-info/pwa/index.html#token=test123&auto=1`（随后 hash 被清掉） |

不跳 → 脚本没生效，先排查 §2.1 第 4 步，**后面的用例都无意义**。

结果：

### T2 Safari 标签页：完整登录（主路径）

| 步骤 | 期望 |
| --- | --- |
| 1. Safari 打开 PWA → 「我的」→ 登录页 | 能看到登录页 |
| 2. 点「打开学校登录页」/「去登录」 | 跳到 CAS 登录页 |
| 3. 输入真实账号密码登录 | **自动**跳回 PWA，**不会**停在一屏 CSS 上 |
| 4. 回到 App | 顶部提示「已从链接导入登录态」，「我的」显示教务/门户已登录，首页能出课表 |
| 5. 网页检查器 | `zzu-info:autoTicket` 为 `"true"` |

结果：

### T3 没有 ticket 的学校页面不被干扰

| 步骤 | 期望 |
| --- | --- |
| Safari 打开 `https://uniapp.s.zzu.edu.cn/static/index.a5c69d49.css`（无 ticket） | 正常显示 CSS 源码，**不跳转** |

结果：

### T4 14 天内免密码续期

前提：T2 已通过，CAS 的登录会话（TGC）还在。

| 步骤 | 期望 |
| --- | --- |
| 1. 「我的 → 其他方式 → 清除」清掉票（**不要**清 autoTicket） | 显示已清除 |
| 2. 在 Safari 标签页里**重新加载** PWA | App 启动后**自己**跳去 CAS，因为 CAS 认得 TGC，**不要求再输密码**，自动跳回 App |
| 3. 回到 App | 已重新登录 |

记录：整个过程用了多久、有没有看到 CAS 的登录页或中间页闪现。

结果：

### T5 没装脚本的设备：不能被带偏

| 步骤 | 期望 |
| --- | --- |
| 1. Safari 设置里**关掉** Userscripts 扩展，重置 App（清票 + 清 autoTicket） | — |
| 2. 点登录，登录成功 | 停在学校那页（满屏 CSS 源码）——**这是正常的** |
| 3. 手动复制地址栏整条网址，回 App「我的 → 其他方式」粘进输入框 → 保存 | 导入成功 |
| 4. 此时 `autoTicket` | **不存在**（没装脚本就不该有这个标记） |
| 5. 再清票、重新打开 App | **不会**自动跳去 CAS，只显示未登录 |

第 5 步是关键：没装脚本的人如果被自动带去学校页，会被卡在一屏 CSS 上出不来。

结果：

### T6 ⭐ 主屏幕 PWA 与 Safari 的存储是否隔离（最重要）

| 步骤 | 期望 / 要记录的 |
| --- | --- |
| 1. 把 PWA **添加到主屏幕**，重置（清票、清 autoTicket） | — |
| 2. 在 Safari 标签页里按 T2 走完登录，确认 Safari 里已登录 | — |
| 3. 退出 Safari，**从主屏幕图标**启动 PWA | **记录：是否已登录？** |
| 4. 反过来：在主屏幕 PWA 里点登录，登录完看跳回到了**哪里**（Safari / 主屏幕 PWA 窗口 / 别处） | **记录：落在哪个上下文，主屏幕 PWA 里是否已登录** |

判定：

- 3 为「已登录」→ 存储共享，方案成立 ✅
- 3 为「未登录」→ **存储隔离，自动取票对主屏幕 PWA 无效**，需要换方案（见 §5）

结果：

### T7 Userscripts 在主屏幕 Web App 里是否生效

| 步骤 | 要记录的 |
| --- | --- |
| 1. 主屏幕 PWA 里点「打开学校登录页」 | 学校页是在**应用内弹出**、**跳到 Safari**、还是**在 PWA 窗口里直接导航**？ |
| 2. 登录完成后 | 脚本有没有触发（是否自动跳回）？ |
| 3. 对比 T2 | 行为是否一致？ |

结果：

### T8 主屏幕 PWA 里的自动续期

前提：T6/T7 已记录现象。

| 步骤 | 要记录的 |
| --- | --- |
| 1. 在主屏幕 PWA 里让票过期（清票后重新打开） | App 有没有自己跳走？跳到了哪里？ |
| 2. 如果跳去了 CAS | 能不能回到主屏幕 PWA？还是留在了 Safari / 卡在某个页面？ |

特别留意：**有没有出现回不来的状态**（卡在 CAS 页或 CSS 页，没有返回入口）。
如果有，这是需要立刻修的问题，请截图。

结果：

### T9 顺带检查（与自动取票无关）

| 项目 | 期望 |
| --- | --- |
| 底部 tab 栏 | 不被 iPhone 底部手势条压住，没有露出白边 |
| 首页「校园地图」卡片（校园网下） | 点一下**新开**页面打开微地图，首次需要登录学校 SSO |
| 首页「校园地图」卡片（非校园网） | 打不开是正常的（WAF 返回 483），记录现象即可 |

结果：

---

## 4. 提交结果

把下面的内容整理发回（直接填在这份文件里提交 PR 也行）：

```
环境：（§1 那块）
T1：
T2：
T3：
T4：
T5：
T6：（必填，写清楚判定）
T7：（必填，写清楚现象）
T8：（必填）
T9：
截图 / 录屏：（T6、T7、T8 尽量带）
遇到的报错原文：
```

不要贴真实的票（`ticket=` 后面那一长串）或账号密码，截图前先打码。

## 5. 如果 T6 失败（存储隔离）会怎么办

先不要着急改代码，把 T6、T7、T8 的现象报回来。可能的方向：

1. **只支持 Safari 标签页**：文档里写明「iOS 请在 Safari 里使用，不要添加到主屏幕」。最省事，但丢掉了全屏体验。
2. **同步码兜底**：主屏幕 PWA 里新增「从 Safari 取登录态」的入口，通过剪贴板或分享链接把 Safari 里的票搬过来。
3. **写 iOS 原生壳**（WKWebView + URLSession，原生请求不受 CORS 限制，能直接换 30 天票）。
   体验最好，工作量最大，需要 Apple 开发者账号走 TestFlight。

选哪个取决于 T6/T7/T8 的实际结果。

---

## 附录

### A. 桌面自动化冒烟（参考，不是这次要测的）

```powershell
npm run build
npm run userscript:e2e
```

起本地「假学校」页 + 真实 `dist/`，注入真实脚本，11 项断言。
它验证了脚本和 App 的逻辑；**没法验证** Safari 扩展行为和主屏幕存储隔离。

### B. 没有真机、只能用 Xcode 模拟器

模拟器里没有 App Store，不能直接装 Userscripts。可以从源码构建：

1. `git clone https://github.com/quoid/userscripts`
2. Xcode 打开工程，选 iOS 模拟器作为目标，Run
3. 模拟器里设置 → Safari → 扩展 → 启用
4. 其余步骤同上

模拟器对 Safari 扩展的支持不如真机完整，**T1 不通过时优先怀疑这一点**，换真机复测。

### C. 相关文件

| 文件 | 作用 |
| --- | --- |
| [`public/userscript/zzu-info-ticket.user.js`](../public/userscript/zzu-info-ticket.user.js) | 用户脚本本体 |
| [`src/core/ticketHash.ts`](../src/core/ticketHash.ts) | 解析 `#token=…&auto=1` |
| [`pwa/main.tsx`](../pwa/main.tsx) | 导入 + 「票过期自动去 CAS」的逻辑（搜 `autoRenewTried`） |
| [`scripts/userscript-e2e.mjs`](../scripts/userscript-e2e.mjs) | 桌面端自动化冒烟 |
