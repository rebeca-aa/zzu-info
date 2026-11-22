# iOS / 网页端登录：自动取票

## 为什么网页端要这么绕

两条硬限制，都不是我们代码能绕开的：

1. **CAS 有服务白名单**。把 `service` 填成我们自己的地址会被挡：
   `GET https://cas.s.zzu.edu.cn/cas/login?service=https://rebeca-aa.github.io/...`
   → 页面标题「未认证授权的服务」。只有 `uniapp.s.zzu.edu.cn` 这一脉的地址放行。
2. **`/token/*`（30 天票）没有 CORS**。预检 `OPTIONS` 直接 `403`，浏览器发不出去。

所以网页端拿不到 30 天票；8 小时的 CAS 票也只能「登录完落在学校那一页，再自己取回来」。
安卓壳能用 30 天票，是因为它走原生 HTTP，不受 CORS 约束；桌面扩展是有 `host_permissions`。

## 自动取票脚本（推荐）

装一次，之后登录和续期都不用手动复制地址。

### iOS（Safari）

1. App Store 装 **Userscripts**（免费，开源）
2. 在「文件」App 里给它一个目录（App 首次启动会引导）
3. 新建脚本，粘贴 [`public/userscript/zzu-info-ticket.user.js`](../public/userscript/zzu-info-ticket.user.js) 的内容，
   文件名随便（如 `zzu-info-ticket.user.js`）
4. Safari 设置 → 扩展 → Userscripts → 打开，并对 `uniapp.s.zzu.edu.cn` 允许

### 桌面（可选）

Tampermonkey / Violentmonkey 新建脚本，粘贴同一份内容即可。桌面其实更推荐直接用扩展。

## 装完之后是什么体验

```
点「登录」→ CAS 认出 TGC（14 天内免密码）→ 自动跳回 App → 已登录
```

用时约 2 秒。脚本回跳时会带上 `auto=1`，App 记住「这台设备装了脚本」；
**之后票过期时 App 自己跳去 CAS 再回来**，用户看到的只是启动时闪一下。

没装脚本的设备不会触发自动跳转——没有那个标记，App 不会把人带到一屏 CSS 上。

## 脚本做了什么

在学校那页（登录后落到 `…/static/index.<hash>.css?redirect=true&ticket=<JWT>`）上：

1. 从地址里取出 `ticket`
2. `location.replace` 到 `…/pwa/index.html#token=<ticket>&auto=1`

App 那条 `#token=` 通道会解析这个 JWT、取出 `idToken`，写进教务和门户两张票，
然后 `history.replaceState` 把 hash 抹掉。

## 不装脚本时的退路

手动复制那页的完整地址，回到 App 的「我的 → 其他方式」粘进输入框。

也可以把下面这段存成书签（Safari 书签地址栏里替换成它），在那页上点一下：

```js
javascript:(()=>{const t=new URLSearchParams(location.search).get('ticket');if(!t){alert('这一页没有 ticket');return}location.replace('https://rebeca-aa.github.io/zzu-info/pwa/index.html#token='+encodeURIComponent(t))})()
```

## 想彻底对齐安卓壳

iOS 上要拿到 30 天票、课前提醒、原生通知，只能写一个原生壳（WKWebView + URLSession，
原生请求不受 CORS 限制）。需要 Apple 开发者账号，走 TestFlight 分发。当前版本没有做。
