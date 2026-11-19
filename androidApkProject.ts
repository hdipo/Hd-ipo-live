import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

export interface ZipEntry {
  name: string;
  data: Buffer;
}

// Precomputed CRC32 table for standard PKZIP archives (zero external dependencies)
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function createZipBuffer(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name.replace(/^\/+/, ''), 'utf8');
    const uncompressed = entry.data;
    const isPng = entry.name.toLowerCase().endsWith('.png');
    const compressed = isPng ? uncompressed : zlib.deflateRawSync(uncompressed, { level: 6 });
    const method = isPng ? 0 : 8; // STORE for PNG, DEFLATE for text
    const crc = crc32(uncompressed);

    // Local File Header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 flag
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(uncompressed.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compressed);

    // Central Directory Header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 flag
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(uncompressed.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDir.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, endRecord]);
}

function parseVersionCode(versionName: string): number {
  const nums = versionName.match(/\d+/g);
  if (!nums || nums.length === 0) return 10;
  const major = Number(nums[0] || 1);
  const minor = Number(nums[1] || 0);
  const patch = Number(nums[2] || 0);
  return Math.max(1, major * 100 + minor * 10 + patch);
}

export function buildHdIpoAndroidProjectZip(options: {
  appUrl: string;
  versionName: string;
  publicDir: string;
}): Buffer {
  const safeUrl = options.appUrl.replace(/"/g, '').trim();
  const cleanVersionName = options.versionName.replace(/^v/i, '').replace(/[^0-9.]/g, '') || '1.0';
  const versionCode = parseVersionCode(cleanVersionName);

  let appHost = '';
  try {
    appHost = new URL(safeUrl).hostname;
  } catch {
    appHost = '';
  }

  const entries: ZipEntry[] = [];
  const addText = (name: string, content: string) => {
    entries.push({ name, data: Buffer.from(content, 'utf8') });
  };

  // Root Gradle files
  addText(
    'settings.gradle',
    `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "HD-IPO"
include(":app")
`
  );

  addText(
    'build.gradle',
    `plugins {
    id 'com.android.application' version '8.5.2' apply false
}
`
  );

  addText(
    'gradle.properties',
    `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
android.enableJetifier=false
`
  );

  addText(
    'app/build.gradle',
    `plugins {
    id 'com.android.application'
}

android {
    namespace 'com.hdipo.live'
    compileSdk 34

    defaultConfig {
        applicationId "com.hdipo.live"
        minSdk 23
        targetSdk 34
        versionCode ${versionCode}
        versionName "${cleanVersionName}"
    }

    signingConfigs {
        release {
            def ksFile = file("hdipo-release.jks")
            if (ksFile.exists()) {
                storeFile ksFile
                storePassword System.getenv("KEYSTORE_PASS") ?: "hdipo123456"
                keyAlias System.getenv("KEY_ALIAS") ?: "hdipo"
                keyPassword System.getenv("KEY_PASS") ?: "hdipo123456"
            }
        }
    }

    buildTypes {
        release {
            minifyEnabled false
            shrinkResources false
            if (file("hdipo-release.jks").exists()) {
                signingConfig signingConfigs.release
            } else {
                signingConfig signingConfigs.debug
            }
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
        debug {
            applicationIdSuffix ""
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
}

dependencies {
    implementation 'androidx.appcompat:appcompat:1.7.0'
    implementation 'androidx.swiperefreshlayout:swiperefreshlayout:1.1.0'
}
`
  );

  addText('app/proguard-rules.pro', '# Keep WebView JavaScript interfaces clean\n');

  // AndroidManifest.xml
  addText(
    'app/src/main/AndroidManifest.xml',
    `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <application
        android:allowBackup="true"
        android:hardwareAccelerated="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher"
        android:supportsRtl="true"
        android:theme="@style/Theme.HDIPO"
        android:usesCleartextTraffic="false">

        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:exported="true"
            android:launchMode="singleTop"
            android:screenOrientation="portrait">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

    </application>
</manifest>
`
  );

  // Resources
  addText(
    'app/src/main/res/values/strings.xml',
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">HD IPO</string>
</resources>
`
  );

  addText(
    'app/src/main/res/values/styles.xml',
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.HDIPO" parent="Theme.AppCompat.Light.NoActionBar">
        <item name="colorPrimary">#1d4ed8</item>
        <item name="colorPrimaryDark">#1e40af</item>
        <item name="colorAccent">#1d4ed8</item>
        <item name="android:statusBarColor">#1d4ed8</item>
        <item name="android:navigationBarColor">#ffffff</item>
        <item name="android:windowBackground">#f8fafc</item>
    </style>
</resources>
`
  );

  addText(
    'app/src/main/res/layout/activity_main.xml',
    `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="#f8fafc">

    <androidx.swiperefreshlayout.widget.SwipeRefreshLayout
        android:id="@+id/swipeRefresh"
        android:layout_width="match_parent"
        android:layout_height="match_parent">

        <WebView
            android:id="@+id/webView"
            android:layout_width="match_parent"
            android:layout_height="match_parent" />
    </androidx.swiperefreshlayout.widget.SwipeRefreshLayout>

    <ProgressBar
        android:id="@+id/progressBar"
        style="?android:attr/progressBarStyleHorizontal"
        android:layout_width="match_parent"
        android:layout_height="3dp"
        android:indeterminate="false"
        android:max="100"
        android:progressTint="#1d4ed8"
        android:visibility="gone" />
</FrameLayout>
`
  );

  // MainActivity.java
  addText(
    'app/src/main/java/com/hdipo/live/MainActivity.java',
    `package com.hdipo.live;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

public class MainActivity extends AppCompatActivity {

    private static final String APP_URL = "${safeUrl}";
    private static final String APP_HOST = "${appHost}";

    private WebView webView;
    private ProgressBar progressBar;
    private SwipeRefreshLayout swipeRefresh;
    private long lastBackPressMs = 0L;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);
        swipeRefresh = findViewById(R.id.swipeRefresh);

        swipeRefresh.setColorSchemeColors(0xFF1D4ED8, 0xFF15803D);
        swipeRefresh.setOnRefreshListener(() -> {
            if (webView.getUrl() == null || webView.getUrl().startsWith("data:")) {
                webView.loadUrl(APP_URL);
            } else {
                webView.reload();
            }
        });

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    progressBar.setVisibility(View.VISIBLE);
                    progressBar.setProgress(newProgress);
                } else {
                    progressBar.setVisibility(View.GONE);
                    swipeRefresh.setRefreshing(false);
                }
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                progressBar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                swipeRefresh.setRefreshing(false);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null) return false;
                String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase() : "";
                String host = uri.getHost() != null ? uri.getHost().toLowerCase() : "";
                String urlStr = uri.toString();

                // Open WhatsApp, phone, mail, intent, or external registrar/APK links outside WebView
                if (scheme.equals("whatsapp") || scheme.equals("tel") || scheme.equals("mailto")
                        || scheme.equals("intent") || host.contains("wa.me")
                        || host.contains("api.whatsapp.com") || urlStr.contains("/api/download/")) {
                    openExternalUri(uri);
                    return true;
                }

                // Keep main HD IPO domain inside app WebView; open external allotment/broker sites in Chrome
                if ((scheme.equals("https") || scheme.equals("http"))
                        && !APP_HOST.isEmpty()
                        && !host.equalsIgnoreCase(APP_HOST)
                        && !host.endsWith("." + APP_HOST)
                        && !host.contains("firebaseapp.com")
                        && !host.contains("accounts.google.com")) {
                    openExternalUri(uri);
                    return true;
                }

                return false;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    swipeRefresh.setRefreshing(false);
                    progressBar.setVisibility(View.GONE);
                    String offlineHtml = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
                            + "<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc;color:#0f172a;text-align:center;padding:24px;}"
                            + ".card{background:#fff;border-radius:16px;padding:24px;box-shadow:0 6px 20px rgba(0,0,0,.08);max-width:340px;width:100%;}"
                            + "button{background:#1d4ed8;color:#fff;border:none;border-radius:10px;padding:12px 20px;font-weight:700;font-size:15px;margin-top:14px;width:100%;}</style></head>"
                            + "<body><div class='card'><h2>HD IPO Offline</h2><p>Internet connection check karein aur dobara try karein.</p>"
                            + "<button onclick=\\"location.href='" + APP_URL + "'\\">Retry Live Data</button></div></body></html>";
                    view.loadDataWithBaseURL(null, offlineHtml, "text/html", "UTF-8", null);
                }
            }
        });

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                openExternalUri(Uri.parse(url));
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    long now = System.currentTimeMillis();
                    if (now - lastBackPressMs < 2000L) {
                        finish();
                    } else {
                        lastBackPressMs = now;
                        Toast.makeText(MainActivity.this, "Exit karne ke liye dobara Back dabayein", Toast.LENGTH_SHORT).show();
                    }
                }
            }
        });

        webView.loadUrl(APP_URL);
    }

    private void openExternalUri(Uri uri) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(this, "Browser ya app open nahi ho paya.", Toast.LENGTH_SHORT).show();
        }
    }
}
`
  );

  // GitHub Actions 1-Click Cloud APK Builder workflow (FREE, no Android Studio required!)
  addText(
    '.github/workflows/build-apk.yml',
    `name: Build Signed HD-IPO base.apk

on:
  push:
    branches: [ main, master ]
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build-apk:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Project
        uses: actions/checkout@v4

      - name: Set up Java 17
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v3
        with:
          gradle-version: '8.7'

      - name: Generate Release Signing Keystore
        run: |
          keytool -genkeypair -v \\
            -keystore app/hdipo-release.jks \\
            -keyalg RSA -keysize 2048 -validity 10000 \\
            -alias hdipo \\
            -storepass hdipo123456 \\
            -keypass hdipo123456 \\
            -dname "CN=HD IPO, OU=Mobile, O=HD IPO, L=India, S=IN, C=IN"

      - name: Build Signed Release APK
        run: gradle assembleRelease --no-daemon

      - name: Rename to HD-IPO-v${cleanVersionName}-base.apk
        run: |
          mkdir -p release-out
          cp app/build/outputs/apk/release/app-release.apk release-out/HD-IPO-v${cleanVersionName}-base.apk
          cp app/build/outputs/apk/release/app-release.apk release-out/base.apk

      - name: Upload APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: HD-IPO-v${cleanVersionName}-base-apk
          path: release-out/*.apk

      - name: Publish Direct Download Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: v${cleanVersionName}
          name: HD IPO v${cleanVersionName}
          files: |
            release-out/HD-IPO-v${cleanVersionName}-base.apk
            release-out/base.apk
`
  );

  // Super easy Hinglish README
  addText(
    'README_APK_BANANE_KA_AASAN_TARIKA.txt',
    `========================================================
  HD IPO (v${cleanVersionName}) - REAL SIGNED base.apk BANANE KA TARIKA
========================================================

App URL: ${safeUrl}
Package ID: com.hdipo.live
Version: v${cleanVersionName}

--------------------------------------------------------
TARIKA 1: FREE CLOUD AUTO-BUILD (BINA ANDROID STUDIO KE)
--------------------------------------------------------
1. github.com par free account kholein aur "New Repository" banayein (naam: hd-ipo-apk, Public rakhein).
2. Is ZIP file ko unzip karke saari files us repo mein upload karein (ya git push karein).
3. GitHub repo mein upar "Actions" tab par click karein — 90 second mein signed "HD-IPO-v${cleanVersionName}-base.apk" automatically ban jayegi!
4. Repo ke "Releases" section mein aapko direct .apk download link mil jayegi:
   https://github.com/<your-username>/hd-ipo-apk/releases/latest/download/base.apk
5. Us link ko HD IPO app -> 3-Line Menu -> Settings -> "Save APK Link & Version" mein paste karein, ya seedha "Upload base.apk" button se upload kar dein!

--------------------------------------------------------
TARIKA 2: ANDROID STUDIO SE (LAPTOP / PC PAR)
--------------------------------------------------------
1. Android Studio kholein -> "Open" -> is unzipped folder ko select karein.
2. Menu mein Build -> Build Bundle(s) / APK(s) -> Build APK(s) par click karein.
3. app/build/outputs/apk/debug/app-debug.apk ko rename karke base.apk bana lein aur HD IPO Settings mein upload kar dein.
`
  );

  // Add real HD IPO launcher icons from /public
  const icon512Path = path.join(options.publicDir, 'pwa-512x512.png');
  const icon192Path = path.join(options.publicDir, 'pwa-192x192.png');
  const icon512 = fs.existsSync(icon512Path) ? fs.readFileSync(icon512Path) : null;
  const icon192 = fs.existsSync(icon192Path) ? fs.readFileSync(icon192Path) : icon512;

  if (icon512) {
    entries.push({ name: 'app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', data: icon512 });
    entries.push({ name: 'app/src/main/res/mipmap-xxhdpi/ic_launcher.png', data: icon512 });
  }
  if (icon192) {
    entries.push({ name: 'app/src/main/res/mipmap-xhdpi/ic_launcher.png', data: icon192 });
    entries.push({ name: 'app/src/main/res/mipmap-hdpi/ic_launcher.png', data: icon192 });
    entries.push({ name: 'app/src/main/res/mipmap-mdpi/ic_launcher.png', data: icon192 });
  }

  return createZipBuffer(entries);
}
