package local.contradiction.android;

import android.app.*;
import android.content.*;
import android.content.res.AssetFileDescriptor;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import java.io.*;
import java.util.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.concurrent.*;

public class MainActivity extends Activity {
    private static final String HOST = "game.contradiction.local";
    private static final long MOVIE_BYTES = 2374166828L;
    private WebView web;
    private Uri movie;
    private boolean loaded;
    private boolean foreground;
    private final Properties assetIndex = new Properties();
    private ServerSocket movieServer;
    private final ExecutorService movieWorkers = Executors.newFixedThreadPool(4);
    private String movieUrl;
    private boolean importing;
    private volatile boolean destroyed;
    private Thread importThread;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        try (InputStream index = getAssets().open("asset-index.properties")) { assetIndex.load(index); }
        catch (IOException e) { throw new IllegalStateException("Missing asset index", e); }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        immersive();
        web = new WebView(this);
        web.setOnLongClickListener(view -> true);
        web.setHapticFeedbackEnabled(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportZoom(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        web.setBackgroundColor(0xff000000);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return !HOST.equals(r.getUrl().getHost());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                if (movieUrl != null && movieUrl.equals(r.getUrl().toString())) return null;
                if (!HOST.equals(r.getUrl().getHost())) return response(403, "Forbidden", 0, null, null);
                try { return resource(r.getUrl(), r.getRequestHeaders()); }
                catch (Exception e) {
                    android.util.Log.e("Contradiction", "Resource failed: " + r.getUrl(), e);
                    return response(404, "Not Found", 0, null, null);
                }
            }
        });
        File internalMovie = new File(getFilesDir(), "MCMV.mp4");
        // Incomplete imports are never used as the game's video.
        File[] leftovers = getFilesDir().listFiles((dir, name) -> name.startsWith("video-import-"));
        if (leftovers != null) for (File leftover : leftovers) leftover.delete();
        if (internalMovie.length() == MOVIE_BYTES) {
            movie = Uri.fromFile(internalMovie); launchGame();
        } else {
            String saved = getPreferences(0).getString("movie", null);
            if (saved != null) importMovie(Uri.parse(saved));
            else showSetup("Import MCMV.mp4 once from Downloads. The app keeps its own copy, so you can delete the Downloads copy after import completes. Import needs about 2.4 GB of additional free space.");
        }
    }

    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(5894);
    }
    private void showSetup(String message) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(48, 24, 48, 24);
        box.setGravity(Gravity.CENTER);
        TextView title = new TextView(this);
        title.setText("CONTRADICTION · Android prototype"); title.setTextSize(24);
        TextView info = new TextView(this); info.setText(message); info.setTextSize(17);
        Button choose = new Button(this); choose.setText("Import MCMV.mp4");
        choose.setOnClickListener(v -> pickMovie());
        box.addView(title); box.addView(info); box.addView(choose); setContentView(box);
    }
    private void pickMovie() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("video/*");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(intent, 1);
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != 1 || result != RESULT_OK || data == null) return;
        Uri selected = data.getData();
        try (AssetFileDescriptor descriptor = getContentResolver().openAssetFileDescriptor(selected, "r")) {
            if (descriptor == null || descriptor.getLength() != MOVIE_BYTES)
                throw new IOException("Select the original MCMV.mp4 (2,374,166,828 bytes).");
            getContentResolver().takePersistableUriPermission(selected, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            importMovie(selected);
        } catch (Exception e) {
            new AlertDialog.Builder(this).setMessage("Cannot use this video: " + e.getMessage()).setPositiveButton("OK", null).show();
        }
    }
    private void importMovie(Uri selected) {
        if (importing) return;
        long free = new StatFs(getFilesDir().getAbsolutePath()).getAvailableBytes();
        if (free < MOVIE_BYTES + 64L * 1024 * 1024) {
            showSetup("Not enough free space to import. Free about 2.4 GB in addition to the Downloads copy, then try again."); return;
        }
        importing = true;
        if (loaded) web.evaluateJavascript("window.mobileSuspend && window.mobileSuspend()", null);
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER); box.setPadding(64, 32, 64, 32);
        TextView label = new TextView(this); label.setTextSize(22); label.setText("Importing game video… 0%");
        ProgressBar progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        TextView detail = new TextView(this);
        detail.setText("Creating the app's own copy. Keep the app open until import finishes. The original file will stay in Downloads.");
        box.addView(label); box.addView(progress, new LinearLayout.LayoutParams(-1, -2)); box.addView(detail);
        setContentView(box);
        importThread = new Thread(() -> {
            File partial = null;
            try {
                partial = File.createTempFile("video-import-", ".tmp", getFilesDir());
                long copied = 0; int previousPercent = -1;
                try (InputStream input = getContentResolver().openInputStream(selected);
                     FileOutputStream output = new FileOutputStream(partial)) {
                    if (input == null) throw new IOException("Cannot open selected video");
                    byte[] bytes = new byte[1024 * 1024]; int n;
                    while ((n = input.read(bytes)) != -1) {
                        if (destroyed || Thread.currentThread().isInterrupted()) throw new IOException("Import interrupted");
                        copied += n;
                        if (copied > MOVIE_BYTES) throw new IOException("The selected video has an unexpected size");
                        output.write(bytes, 0, n);
                        int percent = (int)(copied * 100 / MOVIE_BYTES);
                        if (percent != previousPercent) {
                            previousPercent = percent;
                            runOnUiThread(() -> { if (!destroyed) { progress.setProgress(percent); label.setText("Importing game video… " + percent + "%"); } });
                        }
                    }
                    if (copied != MOVIE_BYTES) throw new IOException("The copy was incomplete. Please select the original MCMV.mp4 again.");
                    output.getFD().sync();
                }
                if (destroyed) throw new IOException("Import interrupted");
                File destination = new File(getFilesDir(), "MCMV.mp4");
                Files.move(partial.toPath(), destination.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
                runOnUiThread(() -> {
                    if (destroyed) return;
                    importing = false; movie = Uri.fromFile(destination);
                    getPreferences(0).edit().remove("movie").apply();
                    new AlertDialog.Builder(this).setTitle("Import complete")
                        .setMessage("The app now has its own video copy. You can delete MCMV.mp4 from Downloads. Uninstalling the app or clearing its data removes the imported video and saves.")
                        .setCancelable(false).setPositiveButton("Play", (dialog, which) -> launchGame()).show();
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    if (destroyed) return;
                    importing = false;
                    showSetup("Import failed: " + e.getMessage() + " Your original video is unchanged. Select it again to retry.");
                });
            } finally { if (partial != null) partial.delete(); }
        }, "VideoImport");
        importThread.start();
    }
    private void launchGame() {
        if (movieServer == null) startMovieServer();
        setContentView(web); loaded = true;
        web.loadUrl("https://" + HOST + "/index.html");
    }
    private WebResourceResponse resource(Uri url, Map<String,String> requestHeaders) throws IOException {
        String path = url.getPath();
        if (path == null || path.contains("..")) throw new IOException("Invalid path");
        path = path.substring(1);
        path = assetIndex.getProperty(path.toLowerCase(Locale.ROOT), path);
        if (path.equals("index.html")) {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            try (InputStream input = getAssets().open("game/index.html")) {
                byte[] bytes = new byte[8192]; int n;
                while ((n = input.read(bytes)) != -1) buffer.write(bytes, 0, n);
            }
            byte[] html = new String(buffer.toByteArray(), StandardCharsets.UTF_8)
                .replace("gfx/MCMV.mp4", movieUrl).getBytes(StandardCharsets.UTF_8);
            return new WebResourceResponse("text/html", "UTF-8", new ByteArrayInputStream(html));
        }
        String mime = URLConnectionMime(path);
        AssetFileDescriptor descriptor = path.equals("gfx/MCMV.mp4")
            ? getContentResolver().openAssetFileDescriptor(movie, "r")
            : getAssets().openFd("game/" + path);
        if (descriptor == null) throw new IOException("No descriptor");
        long length = descriptor.getLength();
        String range = null;
        for (Map.Entry<String,String> entry : requestHeaders.entrySet())
            if (entry.getKey().equalsIgnoreCase("Range")) range = entry.getValue();
        long start = 0, end = length - 1;
        if (range != null) {
            try {
                if (!range.startsWith("bytes=") || range.contains(",")) throw new IllegalArgumentException();
                String[] parts = range.substring(6).split("-", -1);
                if (parts.length != 2) throw new IllegalArgumentException();
                if (parts[0].isEmpty()) start = Math.max(0, length - Long.parseLong(parts[1]));
                else { start = Long.parseLong(parts[0]); if (!parts[1].isEmpty()) end = Math.min(end, Long.parseLong(parts[1])); }
                if (start < 0 || start >= length || end < start) throw new IllegalArgumentException();
            } catch (Exception e) {
                descriptor.close();
                Map<String,String> h = new HashMap<>(); h.put("Content-Range", "bytes */" + length);
                return response(416, "Range Not Satisfiable", 0, mime, h);
            }
        }
        long count = length == 0 ? 0 : end - start + 1;
        FileInputStream stream = descriptor.createInputStream();
        try { stream.getChannel().position(descriptor.getStartOffset() + start); }
        catch (IOException e) { stream.close(); descriptor.close(); throw e; }
        Map<String,String> headers = new HashMap<>();
        headers.put("Accept-Ranges", "bytes"); headers.put("Content-Length", Long.toString(count));
        headers.put("Cache-Control", path.equals("gfx/MCMV.mp4") ? "private, max-age=86400, immutable" : "no-cache");
        if (range != null) headers.put("Content-Range", "bytes " + start + "-" + end + "/" + length);
        final AssetFileDescriptor owner = descriptor;
        final long requestedCount = count;
        InputStream limited = new FilterInputStream(stream) {
            long remaining = requestedCount;
            @Override public int available() throws IOException { return (int)Math.min(remaining, Integer.MAX_VALUE); }
            @Override public int read() throws IOException { if (remaining <= 0) return -1; int b = in.read(); if (b >= 0) remaining--; return b; }
            @Override public int read(byte[] b, int off, int len) throws IOException {
                if (remaining <= 0) return -1;
                int n = in.read(b, off, (int)Math.min(len, remaining)); if (n > 0) remaining -= n; return n;
            }
            @Override public void close() throws IOException { try { super.close(); } finally { owner.close(); } }
        };
        return new WebResourceResponse(mime, mime.startsWith("text/") || mime.contains("javascript") ? "UTF-8" : null,
            range == null ? 200 : 206, range == null ? "OK" : "Partial Content", headers, limited);
    }
    private static String URLConnectionMime(String path) {
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".vtt")) return "text/vtt";
        String mime = java.net.URLConnection.guessContentTypeFromName(path);
        return mime == null ? "application/octet-stream" : mime;
    }
    // Chromium's intercepted-stream adapter applies ranges itself using int lengths.
    // A loopback HTTP transport preserves 64-bit lengths and ordinary HTTP seeking.
    private void startMovieServer() {
        try {
            movieServer = new ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"));
            String token = UUID.randomUUID().toString();
            movieUrl = "http://127.0.0.1:" + movieServer.getLocalPort() + "/" + token;
            Thread acceptor = new Thread(() -> {
                while (!movieServer.isClosed()) {
                    try {
                        Socket client = movieServer.accept();
                        movieWorkers.execute(() -> serveMovie(client, token));
                    } catch (IOException | RejectedExecutionException e) { break; }
                }
            }, "MovieHttp");
            acceptor.setDaemon(true); acceptor.start();
        } catch (IOException e) { throw new IllegalStateException("Cannot start video transport", e); }
    }
    private void serveMovie(Socket client, String token) {
        try (Socket socket = client) {
            socket.setSoTimeout(15000);
            BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.US_ASCII));
            String line = reader.readLine();
            if (line == null || !line.startsWith("GET /" + token + " HTTP/")) return;
            Map<String,String> headers = new HashMap<>(); int total = 0;
            while ((line = reader.readLine()) != null && !line.isEmpty()) {
                if ((total += line.length()) > 16384) return;
                int colon = line.indexOf(':');
                if (colon > 0) headers.put(line.substring(0, colon), line.substring(colon + 1).trim());
            }
            WebResourceResponse result = resource(Uri.parse("https://" + HOST + "/gfx/MCMV.mp4"), headers);
            OutputStream output = socket.getOutputStream();
            StringBuilder head = new StringBuilder("HTTP/1.1 " + result.getStatusCode() + " " + result.getReasonPhrase() + "\r\n");
            head.append("Content-Type: video/mp4\r\nConnection: close\r\nAccess-Control-Allow-Origin: https://" + HOST + "\r\n");
            for (Map.Entry<String,String> entry : result.getResponseHeaders().entrySet()) head.append(entry.getKey()).append(": ").append(entry.getValue()).append("\r\n");
            head.append("\r\n"); output.write(head.toString().getBytes(StandardCharsets.US_ASCII));
            try (InputStream input = result.getData()) {
                byte[] bytes = new byte[65536]; int n;
                while ((n = input.read(bytes)) != -1) output.write(bytes, 0, n);
            }
        } catch (IOException e) { /* The player closes connections when seeking. */ }
    }
    private static WebResourceResponse response(int code, String reason, long size, String mime, Map<String,String> headers) {
        return new WebResourceResponse(mime == null ? "text/plain" : mime, "UTF-8", code, reason,
            headers == null ? Collections.emptyMap() : headers, new ByteArrayInputStream(new byte[0]));
    }
    @Override public void onBackPressed() {
        if (importing) { Toast.makeText(this, "Video import in progress", Toast.LENGTH_SHORT).show(); return; }
        new AlertDialog.Builder(this).setTitle("Contradiction")
            .setItems(new String[]{"Resume", "Import video again", "Save and exit"}, (d, which) -> {
                if (which == 1) pickMovie();
                if (which == 2) {
                    web.evaluateJavascript("window.mobileSuspend && window.mobileSuspend()", value -> finish());
                }
            }).show();
    }
    @Override protected void onPause() {
        foreground = false;
        if (loaded) web.evaluateJavascript("window.mobileSuspend && window.mobileSuspend()", result -> { if (!foreground) web.pauseTimers(); });
        web.onPause(); super.onPause();
    }
    @Override protected void onResume() {
        super.onResume(); foreground = true; web.resumeTimers(); web.onResume(); immersive();
        if (loaded && !importing) web.evaluateJavascript("window.mobileResume && window.mobileResume()", null);
    }
    @Override protected void onDestroy() {
        destroyed = true;
        if (importThread != null) importThread.interrupt();
        web.destroy();
        try { if (movieServer != null) movieServer.close(); } catch (IOException ignored) {}
        movieWorkers.shutdownNow(); super.onDestroy();
    }
}
