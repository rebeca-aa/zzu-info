/**
 * 地址栏 #token= 的解析。
 *
 * 这条通道有两个来源：用户手动粘的学校地址，和自动取票脚本跳回来的
 * `#token=…&auto=1`。`auto` 决定 App 之后敢不敢自己跳去 CAS 续票，
 * 判错了要么续不了，要么把没装脚本的人卡在一屏 CSS 上。
 */
import { describe, expect, it } from 'vitest';
import { parseTicketHash } from '../src/core/ticketHash';

const JWT = 'eyJhbGciOiJIUzUxMiJ9.eyJpZFRva2VuIjoieCJ9.sig';

describe('parseTicketHash', () => {
  it('普通的 #token= 能读出来，不带 auto', () => {
    expect(parseTicketHash(`#token=${JWT}`)).toEqual({ raw: JWT, auto: false });
  });

  it('脚本回跳带 auto=1 时标记出来', () => {
    expect(parseTicketHash(`#token=${JWT}&auto=1`)).toEqual({ raw: JWT, auto: true });
  });

  it('同步码走 code=', () => {
    expect(parseTicketHash('#code=abc123')).toEqual({ raw: 'abc123', auto: false });
  });

  it('值里的百分号编码会解开', () => {
    expect(parseTicketHash('#token=a%2Fb%3D')).toEqual({ raw: 'a/b=', auto: false });
  });

  it('解不开始终返回原文，不抛异常', () => {
    expect(parseTicketHash('#token=bad%zz')).toEqual({ raw: 'bad%zz', auto: false });
  });

  it('auto 只认完整的参数，不被 autox 之类误触', () => {
    expect(parseTicketHash(`#token=${JWT}&autox=1`)).toEqual({ raw: JWT, auto: false });
    expect(parseTicketHash(`#auto=1&token=${JWT}`)).toEqual({ raw: JWT, auto: true });
  });

  it('没有 token 就是 null', () => {
    expect(parseTicketHash('')).toBeNull();
    expect(parseTicketHash('#')).toBeNull();
    expect(parseTicketHash('#auto=1')).toBeNull();
    expect(parseTicketHash('#something=else')).toBeNull();
  });
});
