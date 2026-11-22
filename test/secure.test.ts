/**
 * secure.ts 的单元测试。
 *
 * 这里不碰真正的 IndexedDB：钥匙用 `__setSecureKeyForTest` 直接塞进来
 * （Node 里 crypto.subtle 有，IndexedDB 没有），测的是信封本身和退化行为。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __setSecureKeyForTest, isSealed, readSecure, seal, open, secureAvailable, writeSecure } from '../src/core/secure';
import { getAppCreds, saveAppCreds } from '../src/core/creds';
import { getLibCreds, saveLibCreds } from '../src/core/libCreds';

const mem = new Map<string, string>();

function installLocalStorage(): void {
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  } as unknown as Storage;
}

async function newKey(): Promise<CryptoKey> {
  return globalThis.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** 存储里那条原始记录（模拟「有人把 localStorage 拷走」） */
function storedRaw(key: string): unknown {
  const raw = mem.get(`zzu-info:${key}`);
  return raw ? JSON.parse(raw) : undefined;
}

beforeEach(() => {
  mem.clear();
  installLocalStorage();
  __setSecureKeyForTest(undefined);
});

afterEach(() => {
  __setSecureKeyForTest(undefined);
});

describe('信封', () => {
  it('有钥匙时能往返，且密文里看不出原文', async () => {
    __setSecureKeyForTest(await newKey());
    const box = await seal('appCreds', { password: 'hunter2' });
    expect(box).toBeDefined();
    expect(box?.v).toBe(2);
    expect(box?.alg).toBe('AES-GCM');
    expect(JSON.stringify(box)).not.toContain('hunter2');
    expect(await open('appCreds', box!)).toEqual({ password: 'hunter2' });
  });

  it('没有钥匙就不封，直接给 undefined', async () => {
    __setSecureKeyForTest(null);
    expect(await seal('appCreds', { password: 'x' })).toBeUndefined();
    expect(await secureAvailable()).toBe(false);
  });

  it('换一把钥匙就解不开（当没存过）', async () => {
    __setSecureKeyForTest(await newKey());
    const box = await seal('appCreds', { password: 'x' });
    __setSecureKeyForTest(await newKey());
    expect(await open('appCreds', box!)).toBeUndefined();
  });

  it('密文换了槽位就解不开（AAD 绑了键名）', async () => {
    __setSecureKeyForTest(await newKey());
    const box = await seal('appCreds', { password: 'x' });
    expect(await open('libCreds', box!)).toBeUndefined();
  });
});

describe('读写与迁移', () => {
  it('writeSecure 落盘是密文，readSecure 读回原文', async () => {
    __setSecureKeyForTest(await newKey());
    await writeSecure('appCreds', { account: '2026', password: 'pw' });
    expect(isSealed(storedRaw('appCreds'))).toBe(true);
    expect(JSON.stringify(storedRaw('appCreds'))).not.toContain('pw');
    expect(await readSecure('appCreds')).toEqual({ account: '2026', password: 'pw' });
  });

  it('锁没打开时照旧存明文（老 WebView 不能因此用不了）', async () => {
    __setSecureKeyForTest(null);
    await writeSecure('appCreds', { account: '2026', password: 'pw' });
    expect(storedRaw('appCreds')).toEqual({ account: '2026', password: 'pw' });
    expect(await readSecure('appCreds')).toEqual({ account: '2026', password: 'pw' });
  });

  it('读到老明文会顺手迁成密文', async () => {
    __setSecureKeyForTest(await newKey());
    mem.set('zzu-info:appCreds', JSON.stringify({ account: 'a', password: 'old' }));
    expect(await readSecure<{ password: string }>('appCreds')).toEqual({ account: 'a', password: 'old' });
    await new Promise((r) => setTimeout(r, 10));
    expect(isSealed(storedRaw('appCreds'))).toBe(true);
  });

  it('没存过就是 undefined', async () => {
    __setSecureKeyForTest(await newKey());
    expect(await readSecure('appCreds')).toBeUndefined();
  });
});

/*
 * 改名（campus-layer → zzu-info）之后，用户设备上留下的还是老键名、老 AAD 的密文。
 * 这两条守住「升级不丢登录态」——丢了的话，所有人升级后都像第一次装。
 */
describe('改名前存下的数据还能读', () => {
  it('老键名的明文会搬到新键名下', async () => {
    __setSecureKeyForTest(await newKey());
    mem.set('campus-layer:appCreds', JSON.stringify({ account: 'a', password: 'old' }));

    expect(await readSecure<{ password: string }>('appCreds')).toEqual({ account: 'a', password: 'old' });
    expect(mem.has('campus-layer:appCreds')).toBe(false);
    expect(mem.has('zzu-info:appCreds')).toBe(true);
  });

  it('老 AAD 封的密文能解开，并按新 AAD 重新封', async () => {
    const key = await newKey();
    __setSecureKeyForTest(key);

    /* 造一份「改名前的信封」：AAD 用的是老前缀 */
    const iv = new Uint8Array(new ArrayBuffer(12));
    globalThis.crypto.getRandomValues(iv);
    const ct = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('campus-layer:appCreds') },
      key,
      new TextEncoder().encode(JSON.stringify({ account: 'a', password: 'old' })),
    );
    const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');
    mem.set(
      'zzu-info:appCreds',
      JSON.stringify({ v: 2, alg: 'AES-GCM', iv: b64(iv), ct: b64(new Uint8Array(ct)) }),
    );

    expect(await readSecure<{ password: string }>('appCreds')).toEqual({ account: 'a', password: 'old' });

    /* 重封之后，新 AAD 能直接解开（不再依赖老 AAD 兜底） */
    const now = storedRaw('appCreds');
    expect(await open('appCreds', now as never)).toEqual({ account: 'a', password: 'old' });
  });
});

describe('接到业务上', () => {
  it('学号密码落盘不再有明文', async () => {
    __setSecureKeyForTest(await newKey());
    await saveAppCreds({ account: '202615020223', password: 'secret-pw' });
    const raw = JSON.stringify(storedRaw('appCreds'));
    expect(raw).not.toContain('secret-pw');
    expect(raw).not.toContain('202615020223');
    const got = await getAppCreds();
    expect(got?.password).toBe('secret-pw');
    expect(got?.account).toBe('202615020223');
  });

  it('图书馆密码同理', async () => {
    __setSecureKeyForTest(await newKey());
    await saveLibCreds({ account: '202615020223', password: 'lib-pw' });
    expect(JSON.stringify(storedRaw('libCreds'))).not.toContain('lib-pw');
    expect((await getLibCreds())?.password).toBe('lib-pw');
  });
});
