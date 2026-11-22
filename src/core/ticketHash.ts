/**
 * 地址栏 hash 里的「登录态」。
 *
 * 为什么要有这层：CAS 有服务白名单（只认学校域名），网页端拿不到 30 天票，
 * 连 8 小时的票也只能靠「登录完落在学校那一页、我们自己再去取」。
 * 装了自动取票脚本（docs/ios-login.md）的设备，脚本会把票塞进
 * `#token=…&auto=1` 跳回来；没装脚本的设备则是用户手动粘地址。
 *
 * `auto=1` 不是给用户看的，它表示「这台设备装了脚本」——App 之后票过期时
 * 才敢自己跳去 CAS 再回来。没这个标记就跳，会把没装脚本的人卡在一屏 CSS 上。
 */
export interface TicketHash {
  /** 已经做过 URL 解码的原始值（JWT / 同步码 / 学校页面地址） */
  raw: string;
  /** 设备装了自动取票脚本 */
  auto: boolean;
}

/** 从 `location.hash` 里读出登录态；没有就返回 null。 */
export function parseTicketHash(hash: string): TicketHash | null {
  const src = (hash || '').replace(/^#/, '');
  if (!src) return null;
  const hit = /(?:code|token|idToken)=([^&]+)/i.exec(src);
  if (!hit || !hit[1]) return null;
  let raw = hit[1];
  try {
    raw = decodeURIComponent(raw);
  } catch {
    /* 解不开就按原样用，parseImportLink 那边还会再判一次 */
  }
  return { raw, auto: /(?:^|[&])auto=1(?:&|$)/.test(src) };
}
