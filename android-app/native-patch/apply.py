#!/usr/bin/env python3
"""Splice the native background-GPS plugin into the Capacitor-generated
`android/` project. Run from android-app/ after `npx cap add android`.

Capacitor regenerates android/ from scratch on every CI run (it's
git-ignored), so this script is how the hand-written Java sources,
manifest permissions, the service declaration, the Gradle dependency, and
the plugin registration all get applied to that fresh project every time.
"""
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent  # android-app/native-patch
ANDROID = Path("android")  # relative to CWD (android-app/), per the workflow


def fail(msg):
    print(f"apply.py: {msg}", file=sys.stderr)
    sys.exit(1)


def copy_java_sources():
    src = ROOT / "java" / "uz" / "ilham" / "gpsmonitor"
    dst = ANDROID / "app" / "src" / "main" / "java" / "uz" / "ilham" / "gpsmonitor"
    dst.mkdir(parents=True, exist_ok=True)
    files = list(src.glob("*.java"))
    if not files:
        fail(f"no .java sources found under {src}")
    for f in files:
        shutil.copy(f, dst / f.name)
        print(f"copied {f.name} -> {dst / f.name}")


def patch_manifest():
    path = ANDROID / "app" / "src" / "main" / "AndroidManifest.xml"
    text = path.read_text()

    if "ACCESS_BACKGROUND_LOCATION" in text:
        print("manifest already patched, skipping")
        return

    permissions = (
        '    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />\n'
        '    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />\n'
        '    <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />\n'
        '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />\n'
        '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />\n'
        '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n'
        '    <uses-feature android:name="android.hardware.location.gps" android:required="false" />\n'
    )
    marker = '<uses-permission android:name="android.permission.INTERNET" />'
    if marker not in text:
        fail("could not find INTERNET permission line to anchor new permissions")
    text = text.replace(marker, marker + "\n" + permissions, 1)

    service_tag = (
        '        <service\n'
        '            android:name=".LocationTrackingService"\n'
        '            android:exported="false"\n'
        '            android:foregroundServiceType="location" />\n'
    )
    if "</application>" not in text:
        fail("could not find </application> to insert the service declaration")
    text = text.replace("</application>", service_tag + "    </application>", 1)

    path.write_text(text)
    print(f"patched {path}")


def remove_generated_main_activity_if_other_extension():
    # Capacitor's template is MainActivity.java, matching our own replacement
    # under native-patch/java/ (copied over it by copy_java_sources). If a
    # future Capacitor version ever generates a different extension (e.g.
    # .kt), having both would be a duplicate-class build error — fail loudly
    # instead of silently shipping a broken MainActivity.
    java_dir = ANDROID / "app" / "src" / "main" / "java" / "uz" / "ilham" / "gpsmonitor"
    others = [p for p in java_dir.glob("MainActivity.*") if p.suffix != ".java"]
    if others:
        fail(f"unexpected non-.java MainActivity generated: {others} — "
             f"update native-patch/java/.../MainActivity.java to match")


def patch_app_build_gradle():
    path = ANDROID / "app" / "build.gradle"
    text = path.read_text()
    dep = "    implementation 'com.google.android.gms:play-services-location:21.3.0'\n"
    if "play-services-location" in text:
        print("build.gradle already patched, skipping")
        return
    marker = "dependencies {\n"
    idx = text.find(marker)
    if idx == -1:
        fail("could not find dependencies { in app/build.gradle")
    insert_at = idx + len(marker)
    text = text[:insert_at] + dep + text[insert_at:]
    path.write_text(text)
    print(f"patched {path}")


def main():
    if not ANDROID.exists():
        fail(f"{ANDROID} not found — run this from android-app/ after `npx cap add android`")
    remove_generated_main_activity_if_other_extension()
    copy_java_sources()
    patch_manifest()
    patch_app_build_gradle()
    print("apply.py: done")


if __name__ == "__main__":
    main()
