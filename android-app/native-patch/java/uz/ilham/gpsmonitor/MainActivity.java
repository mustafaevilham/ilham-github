package uz.ilham.gpsmonitor;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Must match capacitor.config.json's server.url.
    private static final String BASE_URL = "https://gps-monitoring.onrender.com";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin registration must happen before super.onCreate() (Capacitor requirement).
        registerPlugin(GpsBackgroundPlugin.class);
        super.onCreate(savedInstanceState);
        // The bridge/WebView exist only after super.onCreate(), so navigate after it.
        handleTargetPathIntent(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleTargetPathIntent(intent);
    }

    // Lets the tracking notification open a specific in-app page (e.g. the
    // employee message panel) instead of just bringing the app to the front.
    private void handleTargetPathIntent(Intent intent) {
        if (intent == null) return;
        String path = intent.getStringExtra("target_path");
        if (path == null || path.isEmpty()) return;
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().loadUrl(BASE_URL + path);
        }
    }
}
