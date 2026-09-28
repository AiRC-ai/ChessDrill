package com.leglerisaac.chessstudio;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.view.WindowInsets;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.webkit.WebMessageCompat;

import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

public class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String HOME = ORIGIN + "/assets/web/index.html";
    private static final String WASM_PATH = "/assets/web/stockfish/stockfish-19-lite-single.wasm";
    private static final int PICK_FILE = 10;
    private static final int SAVE_FILE = 11;
    private WebView webView;
    private ValueCallback<Uri[]> pendingFile;
    private byte[] pendingExport;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(17, 23, 22));
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(245, 244, 238));
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        if (Build.VERSION.SDK_INT >= 30) {
            webView.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
        }
        setContentView(root);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setBuiltInZoomControls(false);

        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (ORIGIN.equals(uri.getScheme() + "://" + uri.getAuthority()) && WASM_PATH.equals(uri.getPath())) {
                    try {
                        return new WebResourceResponse("application/wasm", null,
                            getAssets().open("web/stockfish/stockfish-19-lite-single.wasm"));
                    } catch (IOException ignored) { return null; }
                }
                return assets.shouldInterceptRequest(uri);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri uri = request.getUrl();
                if (HOME.equals(uri.toString())) return false;
                openExternal(uri);
                return true;
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                ((FrameLayout) view.getParent()).removeView(view);
                view.destroy();
                Toast.makeText(MainActivity.this, "Chess Studio stopped. Reopen it to continue.", Toast.LENGTH_LONG).show();
                finish();
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (pendingFile != null) pendingFile.onReceiveValue(null);
                pendingFile = callback;
                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES,
                        new String[]{"application/json", "application/x-chess-pgn", "text/plain", "application/octet-stream"});
                    startActivityForResult(intent, PICK_FILE);
                    return true;
                } catch (ActivityNotFoundException error) {
                    pendingFile.onReceiveValue(null);
                    pendingFile = null;
                    return false;
                }
            }
        });

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView, "ChessStudioNative",
                Collections.singleton(ORIGIN), (view, message, sourceOrigin, isMainFrame, reply) -> {
                    if (isMainFrame && ORIGIN.equals(sourceOrigin.toString()) &&
                        message.getType() == WebMessageCompat.TYPE_STRING) {
                        String data = message.getData();
                        if (data != null && data.length() <= 4_000_000) runOnUiThread(() -> handleMessage(data));
                    }
                });
        }
        webView.loadUrl(HOME);
    }

    private void handleMessage(String data) {
        try {
            JSONObject request = new JSONObject(data);
            if ("open".equals(request.optString("action"))) {
                openExternal(Uri.parse(request.getString("url")));
            } else if ("save".equals(request.optString("action"))) {
                String name = request.getString("name");
                String type = request.getString("type");
                if (!name.matches("[A-Za-z0-9._-]{1,80}\\.(json|pgn)") ||
                    !("application/json".equals(type) || "application/x-chess-pgn".equals(type))) return;
                byte[] bytes = request.getString("text").getBytes(StandardCharsets.UTF_8);
                if (bytes.length > 3_000_000) {
                    Toast.makeText(this, "That export is too large to save.", Toast.LENGTH_LONG).show();
                    return;
                }
                pendingExport = bytes;
                Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                save.addCategory(Intent.CATEGORY_OPENABLE);
                save.setType(type);
                save.putExtra(Intent.EXTRA_TITLE, name);
                startActivityForResult(save, SAVE_FILE);
            }
        } catch (Exception error) {
            Toast.makeText(this, "Could not open this file action.", Toast.LENGTH_SHORT).show();
        }
    }

    private void openExternal(Uri uri) {
        String host = uri.getHost();
        if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null ||
            !("chess.com".equalsIgnoreCase(host) || "www.chess.com".equalsIgnoreCase(host) ||
              "lichess.org".equalsIgnoreCase(host) || "www.lichess.org".equalsIgnoreCase(host))) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "No browser is available for this link.", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_FILE && pendingFile != null) {
            pendingFile.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            pendingFile = null;
        } else if (requestCode == SAVE_FILE) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingExport != null) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData(), "w")) {
                    if (out == null) throw new IOException("No document stream");
                    out.write(pendingExport);
                    Toast.makeText(this, "Saved to your chosen location.", Toast.LENGTH_SHORT).show();
                } catch (IOException error) {
                    Toast.makeText(this, "Could not save the file.", Toast.LENGTH_LONG).show();
                }
            }
            pendingExport = null;
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        webView.evaluateJavascript("window.chessStudioBack ? window.chessStudioBack() : false",
            result -> { if (!"true".equals(result)) finish(); });
    }

    @Override
    protected void onDestroy() {
        if (pendingFile != null) pendingFile.onReceiveValue(null);
        if (webView != null && webView.getParent() != null) {
            ((FrameLayout) webView.getParent()).removeView(webView);
            webView.destroy();
        }
        super.onDestroy();
    }
}
