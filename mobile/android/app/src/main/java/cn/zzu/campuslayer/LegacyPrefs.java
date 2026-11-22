package cn.zzu.campuslayer;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.Map;

/**
 * 一次性把改名前的 prefs 搬过来。
 *
 * <p>prefs 文件原名 {@code campus_layer}，改名后叫 {@code zzu_info}。SharedPreferences
 * 的文件名就是 key，改名等于换了一个空文件：老用户的图书馆登录 token、上次检查更新的时间
 * 都会「凭空消失」，图书馆会要求重登一次。这条搬迁只跑一次（搬完删掉老文件），
 * 之后就只是一次「老文件存不存在」的判断。
 */
final class LegacyPrefs {

    private static final String CURRENT = "zzu_info";
    private static final String LEGACY = "campus" + "_layer";

    private LegacyPrefs() {}

    /** 在 Application/Activity 启动时调一次即可；重复调用无副作用。 */
    static void migrate(Context ctx) {
        try {
            SharedPreferences old = ctx.getSharedPreferences(LEGACY, Context.MODE_PRIVATE);
            /* 老文件不存在时 getAll() 返回空 map，不会顺手把空文件建出来 */
            Map<String, ?> all = old.getAll();
            if (all == null || all.isEmpty()) return;

            SharedPreferences cur = ctx.getSharedPreferences(CURRENT, Context.MODE_PRIVATE);
            SharedPreferences.Editor ed = cur.edit();
            for (Map.Entry<String, ?> e : all.entrySet()) {
                String k = e.getKey();
                Object v = e.getValue();
                /* 新文件已有的键不覆盖：那边才是更新过的值 */
                if (cur.contains(k)) continue;
                if (v instanceof String) ed.putString(k, (String) v);
                else if (v instanceof Integer) ed.putInt(k, (Integer) v);
                else if (v instanceof Long) ed.putLong(k, (Long) v);
                else if (v instanceof Float) ed.putFloat(k, (Float) v);
                else if (v instanceof Boolean) ed.putBoolean(k, (Boolean) v);
            }
            ed.apply();
            old.edit().clear().apply();
        } catch (Throwable ignored) {
            /* 搬迁失败不该挡住启动：最坏结果只是要重新登一次图书馆 */
        }
    }
}
