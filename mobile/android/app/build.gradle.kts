plugins {
  id("com.android.application")
}

/*
 * 签名：一把固定的钥匙，随仓库走。
 *
 * 为什么必须固定：Android 只允许「同一签名」的包覆盖安装。以前每次 CI 都临时生成
 * debug 钥匙，于是每个 APK 的签名都不一样，只能卸载重装（App 内的「检查更新」也就没法用）。
 * 现在钥匙固定下来，之后的包都能原地升级、数据不动。
 *
 * 这把钥匙的密码是公开的（和仓库一起公开）——这个 App 是自签名、自己分发的，
 * 更新通道（Release 上的 shell.json + APK）都由仓库的控制者掌握，
 * 别人就算用同一把钥匙签一个包，也发不到我们用户的手机上。
 */
/*
 * 文件名跟着项目改成了 zzu-info.p12，但**钥匙内部的别名和口令没动**（还是 campus-layer
 * 那套）。原因：这两样写在 p12 文件里，改它们得用 keytool 重写整个文件；一旦改错或
 * 重新生成钥匙，Android 就不允许覆盖安装，老用户只能卸载重装、数据全丢。
 * 名字只是个内部字符串，不影响任何对外可见的东西——保持原样最安全。
 */
val keystoreFile = file("zzu-info.p12")
val keystorePass = "campus-layer-sign"

android {
  namespace = "cn.zzu.campuslayer"
  compileSdk = 34

  defaultConfig {
    applicationId = "cn.zzu.campuslayer"
    minSdk = 24
    targetSdk = 34
    /* 132：改名后老壳里存的还是旧 Pages 地址（zzu-campus-layer），打开就是 404。
       版本号必须比上一版大，装过旧包的人下次启动才会看到「有新版」并自己升上来。 */
    versionCode = 136
    versionName = "0.2.151"
  }

  signingConfigs {
    // 首次构建时由 CI 用 keytool 生成并提交（见 .github/workflows/android.yml）；
    // 本地没有这个文件就退回默认 debug 签名，照样能构建调试。
    if (keystoreFile.exists()) {
      create("shared") {
        storeFile = keystoreFile
        storeType = "PKCS12"
        storePassword = keystorePass
        /* 必须和 p12 里的别名一致（见上面那段说明），不能顺手改成新名字 */
        keyAlias = "campus-layer"
        keyPassword = keystorePass
      }
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  buildTypes {
    debug {
      isMinifyEnabled = false
      if (keystoreFile.exists()) signingConfig = signingConfigs.getByName("shared")
    }
    release {
      isMinifyEnabled = false
      if (keystoreFile.exists()) signingConfig = signingConfigs.getByName("shared")
    }
  }
}

/*
 * 有意不引任何第三方依赖（没有 AndroidX、没有 Kotlin 插件）：
 * 壳只做这几件事——显示网页、拉一个登录页取 token、把 token 塞回网页、自己更新自己。
 * 依赖越少，CI 里构建越不容易炸。
 */
