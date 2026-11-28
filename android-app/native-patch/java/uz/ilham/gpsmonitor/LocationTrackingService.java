package uz.ilham.gpsmonitor;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.text.format.DateFormat;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

// Foreground service: keeps requesting location updates and posting them to
// the server while the app is backgrounded or the screen is off. ALWAYS shows
// a persistent, non-dismissible notification while running, by Android's own
// rule for foreground services (this is what keeps tracking visible to the
// employee even though they no longer have to keep the page open).
//
// A reading is queued to a local file first and only removed from that queue
// once the server has accepted it (HTTP 204) — same non-drop rule as the
// browser's offline-queue.js, now enforced natively.
public class LocationTrackingService extends Service {

    private static final String TAG = "GpsBackground";
    private static final String CHANNEL_ID = "gps_tracking";
    private static final int NOTIF_ID = 4201;
    private static final String BASE_URL = "https://gps-monitoring.onrender.com";
    private static final long INTERVAL_MS = 30_000L;

    private FusedLocationProviderClient fusedClient;
    private LocationCallback locationCallback;
    private ExecutorService ioExecutor;
    private Handler mainHandler;
    private ConnectivityManager.NetworkCallback networkCallback;
    private final AtomicBoolean sending = new AtomicBoolean(false);
    private String token;
    private String title; // admin-editable banner/notification text (Sozlamalar page)

    @Override
    public void onCreate() {
        super.onCreate();
        ioExecutor = Executors.newSingleThreadExecutor();
        mainHandler = new Handler(Looper.getMainLooper());
        fusedClient = LocationServices.getFusedLocationProviderClient(this);
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.hasExtra("token")) {
            token = intent.getStringExtra("token");
            saveToken(token);
        }
        if (intent != null && intent.hasExtra("title")) {
            title = intent.getStringExtra("title");
            saveTitle(title);
        }
        if (token == null) {
            token = loadToken();
        }
        if (title == null) {
            title = loadTitle();
        }
        if (token == null) {
            Log.w(TAG, "No token available, stopping service");
            stopSelf();
            return START_NOT_STICKY;
        }

        startForeground(NOTIF_ID, buildNotification(t("ishga tushdi", "started")), foregroundServiceType());
        startLocationUpdates();
        registerConnectivityCallback();
        return START_STICKY; // Android restarts us with a null intent if killed; we reload the token.
    }

    @Override
    public void onDestroy() {
        if (fusedClient != null && locationCallback != null) {
            fusedClient.removeLocationUpdates(locationCallback);
        }
        unregisterConnectivityCallback();
        if (ioExecutor != null) {
            ioExecutor.shutdownNow();
        }
        super.onDestroy();
    }

    // Keep running even if the user swipes the app away from recents.
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // Simple bundled strings: Uzbek (default) + English, chosen by the
    // device's own language setting (Settings > System > Languages).
    private boolean isUzbek() {
        String lang = Locale.getDefault().getLanguage();
        return lang == null || lang.equalsIgnoreCase("uz");
    }

    private String t(String uz, String en) {
        return isUzbek() ? uz : en;
    }

    private int foregroundServiceType() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION;
        }
        return 0;
    }

    private void startLocationUpdates() {
        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, INTERVAL_MS)
                .setMinUpdateIntervalMillis(INTERVAL_MS)
                .build();

        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                Location loc = result.getLastLocation();
                if (loc == null) return;
                enqueueAndFlush(loc);
            }
        };

        try {
            fusedClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper());
        } catch (SecurityException e) {
            Log.e(TAG, "Location permission missing at service start", e);
            stopSelf();
        }
    }

    // --- Local queue (one JSON array file per token, in internal storage) ---

    private File queueFile() {
        return new File(getFilesDir(), "gps_queue_" + token + ".json");
    }

    private synchronized JSONArray readQueue() {
        File f = queueFile();
        if (!f.exists()) return new JSONArray();
        try {
            java.io.FileInputStream in = new java.io.FileInputStream(f);
            byte[] data = new byte[(int) f.length()];
            int read = in.read(data);
            in.close();
            if (read <= 0) return new JSONArray();
            return new JSONArray(new String(data, StandardCharsets.UTF_8));
        } catch (IOException | JSONException e) {
            Log.e(TAG, "readQueue failed, starting fresh", e);
            return new JSONArray();
        }
    }

    private synchronized void writeQueue(JSONArray arr) {
        try (OutputStream out = new FileOutputStream(queueFile())) {
            out.write(arr.toString().getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            Log.e(TAG, "writeQueue failed", e);
        }
    }

    private String isoNow() {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new java.util.Date());
    }

    private void enqueueAndFlush(Location loc) {
        try {
            JSONObject point = new JSONObject();
            point.put("lat", loc.getLatitude());
            point.put("lng", loc.getLongitude());
            point.put("recorded_at", isoNow());
            JSONArray q = readQueue();
            q.put(point);
            writeQueue(q);
        } catch (JSONException e) {
            Log.e(TAG, "enqueue failed", e);
            return;
        }
        flush();
    }

    // Sends everything currently queued. Only removes the points the server
    // actually accepted (by value), so a point appended while a send is in
    // flight is never dropped. Only one send runs at a time.
    private void flush() {
        if (!sending.compareAndSet(false, true)) return;
        ioExecutor.execute(() -> {
            try {
                JSONArray toSend = readQueue();
                if (toSend.length() == 0) return;
                boolean ok = postPoints(toSend);
                if (ok) {
                    mainHandler.post(() -> updateNotification(t("yuborildi", "sent")));
                    synchronized (LocationTrackingService.this) {
                        JSONArray remaining = subtractSent(readQueue(), toSend);
                        writeQueue(remaining);
                    }
                } else {
                    mainHandler.post(() -> updateNotification(t("internet kutilmoqda", "waiting for internet")));
                }
            } finally {
                sending.set(false);
            }
        });
    }

    private JSONArray subtractSent(JSONArray current, JSONArray sent) {
        List<String> sentKeys = new ArrayList<>();
        for (int i = 0; i < sent.length(); i++) {
            sentKeys.add(sent.optJSONObject(i).toString());
        }
        JSONArray remaining = new JSONArray();
        for (int i = 0; i < current.length(); i++) {
            String key = current.optJSONObject(i).toString();
            if (sentKeys.contains(key)) {
                sentKeys.remove(key); // remove one matching occurrence only
            } else {
                remaining.put(current.opt(i));
            }
        }
        return remaining;
    }

    private boolean postPoints(JSONArray points) {
        HttpURLConnection conn = null;
        try {
            JSONObject body = new JSONObject();
            body.put("points", points);

            URL url = new URL(BASE_URL + "/consent/" + token + "/locations");
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setConnectTimeout(15_000);
            conn.setReadTimeout(15_000);
            conn.setDoOutput(true);
            byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
            conn.getOutputStream().write(payload);
            int code = conn.getResponseCode();
            return code == 204;
        } catch (Exception e) {
            Log.w(TAG, "postPoints failed: " + e.getMessage());
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    // --- Token persistence (survives a service restart after being killed) ---

    private void saveToken(String t) {
        getSharedPreferences("gps_background", Context.MODE_PRIVATE)
                .edit().putString("token", t).apply();
    }

    private String loadToken() {
        return getSharedPreferences("gps_background", Context.MODE_PRIVATE)
                .getString("token", null);
    }

    private void saveTitle(String customTitle) {
        getSharedPreferences("gps_background", Context.MODE_PRIVATE)
                .edit().putString("title", customTitle).apply();
    }

    private String loadTitle() {
        return getSharedPreferences("gps_background", Context.MODE_PRIVATE)
                .getString("title", null);
    }

    // --- Reconnect handling: flush as soon as connectivity returns ---

    private void registerConnectivityCallback() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return;
        NetworkRequest request = new NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build();
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                flush();
            }
        };
        try {
            cm.registerNetworkCallback(request, networkCallback);
        } catch (Exception e) {
            Log.w(TAG, "registerNetworkCallback failed", e);
        }
    }

    private void unregisterConnectivityCallback() {
        if (networkCallback == null) return;
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm != null) {
            try {
                cm.unregisterNetworkCallback(networkCallback);
            } catch (Exception ignored) {
            }
        }
    }

    // --- Notification (always visible while this service runs) ---

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "GPS kuzatuv", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Joylashuv fon rejimida yuborilayotganini ko'rsatadi");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification(String status) {
        String time = DateFormat.format("HH:mm", new java.util.Date()).toString();
        // The admin can edit this text from the Sozlamalar page; it arrives
        // via GpsBackground.start({title}) and is persisted so a restarted
        // service still shows the right text. Falls back to the bilingual
        // default only if the web page never sent one (e.g. an old cached page).
        String displayTitle = (title != null && !title.isEmpty())
                ? title
                : t("\uD83D\uDEF0\uFE0F GPS kuzatuv FAOL", "\uD83D\uDEF0\uFE0F GPS tracking ACTIVE");
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(displayTitle)
                .setContentText(status + " · " + time)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    private void updateNotification(String status) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) {
            nm.notify(NOTIF_ID, buildNotification(status));
        }
    }
}
