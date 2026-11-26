package com.poordrops.app;

import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private final Object shareLock = new Object();
    private String pendingShareJson = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().addJavascriptInterface(new ShareBridge(), "PoorDropsShareBridge");
        }
        handleShareIntent(getIntent(), false);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleShareIntent(intent, true);
    }

    private void handleShareIntent(Intent intent, boolean notifyRunningWebView) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            return;
        }

        String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
        if ((sharedText == null || sharedText.isEmpty()) && intent.hasExtra(Intent.EXTRA_SUBJECT)) {
            sharedText = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        }

        Set<Uri> uris = new LinkedHashSet<>();
        if (Intent.ACTION_SEND.equals(action)) {
            Uri single = getParcelableStream(intent);
            if (single != null) uris.add(single);
        } else {
            ArrayList<Uri> list = getParcelableStreamList(intent);
            if (list != null) {
                for (Uri u : list) {
                    if (u != null) uris.add(u);
                }
            }
        }

        ClipData clipData = intent.getClipData();
        if (clipData != null) {
            for (int i = 0; i < clipData.getItemCount(); i++) {
                ClipData.Item item = clipData.getItemAt(i);
                if (item.getUri() != null) {
                    uris.add(item.getUri());
                }
                if ((sharedText == null || sharedText.isEmpty()) && item.getText() != null) {
                    sharedText = item.getText().toString();
                }
            }
        }

        JSONArray filesArray = new JSONArray();
        if (!uris.isEmpty()) {
            File inboxDir = new File(getCacheDir(), "shared_inbox");
            if (!inboxDir.exists()) {
                inboxDir.mkdirs();
            }
            cleanupOldCache(inboxDir);

            for (Uri uri : uris) {
                JSONObject copied = copyUriToInbox(uri, inboxDir);
                if (copied != null) {
                    filesArray.put(copied);
                }
            }
        }

        if ((sharedText == null || sharedText.isEmpty()) && filesArray.length() == 0) {
            return;
        }

        try {
            JSONObject payload = new JSONObject();
            payload.put("text", sharedText != null ? sharedText : "");
            payload.put("files", filesArray);

            synchronized (shareLock) {
                pendingShareJson = payload.toString();
            }

            if (notifyRunningWebView && this.bridge != null && this.bridge.getWebView() != null) {
                WebView webView = this.bridge.getWebView();
                webView.post(() -> webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('poordrops:native-share'));",
                    null
                ));
            }
        } catch (Exception ignored) {
        }
    }

    @SuppressWarnings("deprecation")
    private Uri getParcelableStream(Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);
        }
        return intent.getParcelableExtra(Intent.EXTRA_STREAM);
    }

    @SuppressWarnings("deprecation")
    private ArrayList<Uri> getParcelableStreamList(Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class);
        }
        return intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
    }

    private JSONObject copyUriToInbox(Uri uri, File inboxDir) {
        ContentResolver resolver = getContentResolver();
        String displayName = resolveDisplayName(resolver, uri);
        String mimeType = resolver.getType(uri);
        if (mimeType == null || mimeType.isEmpty()) {
            mimeType = "application/octet-stream";
        }

        String safeBase = displayName.replaceAll("[^a-zA-Z0-9._-]", "_");
        if (safeBase.isEmpty()) {
            safeBase = "parcel_" + System.currentTimeMillis();
        }
        File outFile = new File(inboxDir, System.currentTimeMillis() + "_" + safeBase);

        long totalBytes = 0;
        try (InputStream in = resolver.openInputStream(uri);
             FileOutputStream out = new FileOutputStream(outFile)) {
            if (in == null) return null;
            byte[] buffer = new byte[65536];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
                totalBytes += read;
            }
            out.flush();

            JSONObject obj = new JSONObject();
            obj.put("name", displayName);
            obj.put("mime", mimeType);
            obj.put("size", totalBytes);
            obj.put("filePath", outFile.getAbsolutePath());
            return obj;
        } catch (Exception e) {
            if (outFile.exists()) outFile.delete();
            return null;
        }
    }

    private String resolveDisplayName(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) {
                    String name = cursor.getString(idx);
                    if (name != null && !name.trim().isEmpty()) {
                        return name.trim();
                    }
                }
            }
        } catch (Exception ignored) {
        }
        String lastSeg = uri.getLastPathSegment();
        if (lastSeg != null && !lastSeg.trim().isEmpty()) {
            int slash = lastSeg.lastIndexOf('/');
            return slash >= 0 ? lastSeg.substring(slash + 1) : lastSeg;
        }
        return "shared-parcel-" + System.currentTimeMillis();
    }

    private void cleanupOldCache(File inboxDir) {
        File[] files = inboxDir.listFiles();
        if (files == null) return;
        long cutoff = System.currentTimeMillis() - 86_400_000L;
        for (File f : files) {
            if (f.lastModified() < cutoff) {
                f.delete();
            }
        }
    }

    public class ShareBridge {
        @JavascriptInterface
        public String consumePendingShare() {
            synchronized (shareLock) {
                String out = pendingShareJson;
                pendingShareJson = null;
                return out != null ? out : "";
            }
        }
    }
}
