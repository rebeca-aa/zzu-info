// ==UserScript==
// @name         郑大信息 · 自动取票
// @namespace    zzu-info
// @version      1.0.0
// @description  CAS 登录完把票自动带回「郑大信息」，省掉复制地址那一步
// @match        https://uniapp.s.zzu.edu.cn/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

/*
 * 为什么需要它
 * ------------
 * CAS 有服务白名单，只认 uniapp.s.zzu.edu.cn 这一脉的地址，所以我们的网页永远
 * 收不到 `?ticket=`；`/token/*`（30 天票）又不给 CORS。结果是网页端用户登录完
 * 只能落在学校那页上看一屏 CSS，再手动把地址复制回来。
 *
 * 这个小脚本就干一件事：在学校那页上发现地址里带 ticket，就把票塞进
 * `#token=…&auto=1` 跳回 App。带了 auto=1，App 才会记住「这台设备装了脚本」，
 * 以后票过期时自己跳去 CAS 再回来——用户什么都不用做。
 *
 * 安装：iOS 用 Userscripts App；桌面用 Tampermonkey / Violentmonkey。
 * 详细步骤见 docs/ios-login.md。
 */
(function () {
  var hit = /[?&#]ticket=([^&#]+)/.exec(location.href);
  if (!hit || !hit[1]) return;

  var ticket = hit[1];
  try {
    ticket = decodeURIComponent(ticket);
  } catch (e) {
    /* 解不开就按原样带走 */
  }

  location.replace(
    'https://rebeca-aa.github.io/zzu-info/pwa/index.html#token=' +
      encodeURIComponent(ticket) +
      '&auto=1',
  );
})();
