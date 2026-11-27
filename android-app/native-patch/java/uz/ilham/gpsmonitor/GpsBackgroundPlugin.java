package uz.ilham.gpsmonitor;

import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

// Bridges the web page (consent-tracking.ejs) to a foreground Android
// service that keeps reporting GPS location while the app is backgrounded or
// the screen is off. The service always shows a persistent notification, so
// the employee can see tracking is active even when not looking at the page —
// this is what makes "no need to keep the page open" still consent-visible.
@CapacitorPlugin(
    name = "GpsBackground",
    permissions = {
        @Permission(
            alias = "location",
            strings = {
                android.Manifest.permission.ACCESS_FINE_LOCATION,
                android.Manifest.permission.ACCESS_COARSE_LOCATION
            }
        )
    }
)
public class GpsBackgroundPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        String token = call.getString("token");
        if (token == null || token.isEmpty()) {
            call.reject("token is required");
            return;
        }
        if (getPermissionState("location") != com.getcapacitor.PermissionState.GRANTED) {
            saveCall(call);
            requestPermissionForAlias("location", call, "locationPermsCallback");
            return;
        }
        startServiceWithToken(token);
        JSObject ret = new JSObject();
        ret.put("started", true);
        call.resolve(ret);
    }

    @PermissionCallback
    private void locationPermsCallback(PluginCall call) {
        if (getPermissionState("location") != com.getcapacitor.PermissionState.GRANTED) {
            call.reject("Location permission was not granted");
            return;
        }
        String token = call.getString("token");
        startServiceWithToken(token);
        JSObject ret = new JSObject();
        ret.put("started", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), LocationTrackingService.class);
        getContext().stopService(intent);
        JSObject ret = new JSObject();
        ret.put("stopped", true);
        call.resolve(ret);
    }

    private void startServiceWithToken(String token) {
        Intent intent = new Intent(getContext(), LocationTrackingService.class);
        intent.putExtra("token", token);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
    }
}
