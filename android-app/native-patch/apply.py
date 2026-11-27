#!/usr/bin/env python3
"""Splice the native background-GPS plugin into the Capacitor-generated
`android/` project. Run from android-app/ after `npx cap add android`.

Capacitor regenerates android/ from scratch on every CI run (it's
git-ignored), so this script is how the hand-written Java sources,
manifest permissions, the service declaration, the Gradle dependency, and
the plugin registration all get applied to that fresh project every time.
"""
import re
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


def patch_main_activity():
    java_dir = ANDROID / "app" / "src" / "main" / "java" / "uz" / "ilham" / "gpsmonitor"
    candidates = list(java_dir.glob("MainActivity.*"))
    if not candidates:
        fail(f"MainActivity not found under {java_dir}")
    path = candidates[0]
    text = path.read_text()

    if "GpsBackgroundPlugin" in text:
        print("MainActivity already patched, skipping")
        return

    if path.suffix == ".java":
        if "public class MainActivity extends BridgeActivity {}" in text:
            text = text.replace(
                "public class MainActivity extends BridgeActivity {}",
                (
                    "public class MainActivity extends BridgeActivity {\n"
                    "    @Override\n"
                    "    public void onCreate(android.os.Bundle savedInstanceState) {\n"
                    "        registerPlugin(GpsBackgroundPlugin.class);\n"
                    "        super.onCreate(savedInstanceState);\n"
                    "    }\n"
                    "}\n"
                ),
            )
        elif re.search(r"public class MainActivity extends BridgeActivity \{", text):
            text = re.sub(
                r"(public class MainActivity extends BridgeActivity \{\n)",
                (
                    r"\1"
                    "    @Override\n"
                    "    public void onCreate(android.os.Bundle savedInstanceState) {\n"
                    "        registerPlugin(GpsBackgroundPlugin.class);\n"
                    "        super.onCreate(savedInstanceState);\n"
                    "    }\n\n"
                ),
                text,
                count=1,
            )
        else:
            fail(f"unrecognized MainActivity.java shape, cannot patch:\n{text}")
    else:
        fail(f"MainActivity has unexpected extension: {path.name}")

    path.write_text(text)
    print(f"patched {path}")


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
    copy_java_sources()
    patch_manifest()
    patch_main_activity()
    patch_app_build_gradle()
    print("apply.py: done")


if __name__ == "__main__":
    main()
