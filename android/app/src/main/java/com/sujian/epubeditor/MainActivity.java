package com.sujian.epubeditor;

import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (bridge == null) return;

        // Own all edge-to-edge insets, including the IME. Capacitor 7's forced
        // margins handle only system bars and consume the remaining insets.
        // A smaller WebView also gives native selection handles the correct
        // bottom edge for auto-scroll; JS padding alone cannot do that.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WebView webView = bridge.getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout()
                    | WindowInsetsCompat.Type.ime()
            );
            ViewGroup.MarginLayoutParams margins = (ViewGroup.MarginLayoutParams) view.getLayoutParams();
            if (margins.leftMargin != insets.left || margins.topMargin != insets.top
                || margins.rightMargin != insets.right || margins.bottomMargin != insets.bottom) {
                margins.setMargins(insets.left, insets.top, insets.right, insets.bottom);
                view.setLayoutParams(margins);
            }
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(webView);
    }
}
