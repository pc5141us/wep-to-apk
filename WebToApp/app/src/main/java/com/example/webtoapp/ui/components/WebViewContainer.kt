package com.example.webtoapp.ui.components

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebViewContainer(
    url: String,
    htmlContent: String?,
    onWebViewCreated: (WebView) -> Unit,
    enableZoom: Boolean = true,
    showProgressBar: Boolean = true,
    userAgent: String = "",
    modifier: Modifier = Modifier
) {
    var isLoading by remember { mutableStateOf(false) }
    var progress by remember { mutableStateOf(0f) }
    var webViewInstance by remember { mutableStateOf<WebView?>(null) }

    fun formatUrlRobust(rawUrl: String): String {
        if (rawUrl.isEmpty()) return ""
        var formatted = rawUrl.trim().replace("\\s+".toRegex(), "")
        if (formatted.isEmpty()) return ""
        
        if (!formatted.startsWith("http://", ignoreCase = true) && !formatted.startsWith("https://", ignoreCase = true)) {
            formatted = "https://$formatted"
        }
        
        val schemeLength = if (formatted.startsWith("https://", ignoreCase = true)) 8 else 7
        if (formatted.length > schemeLength) {
            val domainPart = formatted.substring(schemeLength)
            if (!domainPart.contains(".")) {
                formatted = "$formatted.com"
            }
        }
        return formatted
    }

    LaunchedEffect(url, htmlContent) {
        webViewInstance?.let { webView ->
            if (htmlContent != null) {
                webView.loadDataWithBaseURL(null, htmlContent, "text/html", "utf-8", null)
            } else if (url.isNotEmpty()) {
                webView.loadUrl(formatUrlRobust(url))
            }
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        AndroidView(
            factory = { context ->
                WebView(context).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.databaseEnabled = true
                    settings.useWideViewPort = true
                    settings.loadWithOverviewMode = true
                    settings.builtInZoomControls = enableZoom
                    settings.displayZoomControls = false
                    settings.allowFileAccess = true
                    settings.allowContentAccess = true
                    settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                    if (enableZoom) {
                        settings.supportZoom()
                    }
                    if (userAgent.isNotEmpty()) {
                        settings.userAgentString = userAgent
                    }

                    webViewClient = object : WebViewClient() {
                        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                            super.onPageStarted(view, url, favicon)
                            isLoading = true
                            progress = 0f
                        }

                        override fun onPageFinished(view: WebView?, url: String?) {
                            super.onPageFinished(view, url)
                            isLoading = false
                            progress = 1f
                        }

                        @SuppressLint("WebViewClientOnReceivedSslError")
                        override fun onReceivedSslError(
                            view: WebView?,
                            handler: android.webkit.SslErrorHandler?,
                            error: android.net.http.SslError?
                        ) {
                            handler?.proceed()
                        }

                        override fun shouldOverrideUrlLoading(
                            view: WebView?,
                            request: WebResourceRequest?
                        ): Boolean {
                            return false
                        }
                    }

                    webChromeClient = object : WebChromeClient() {
                        override fun onProgressChanged(view: WebView?, newProgress: Int) {
                            super.onProgressChanged(view, newProgress)
                            progress = newProgress / 100f
                            if (newProgress == 100) {
                                isLoading = false
                            }
                        }
                    }

                    onWebViewCreated(this)
                    webViewInstance = this

                    if (htmlContent != null) {
                        loadDataWithBaseURL(null, htmlContent, "text/html", "utf-8", null)
                    } else if (url.isNotEmpty()) {
                        loadUrl(formatUrlRobust(url))
                    }
                }
            },
            modifier = Modifier.fillMaxSize(),
            update = { }
        )

        if (isLoading && showProgressBar) {
            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.TopCenter)
            )
        }
    }
}
