package com.example.webtoapp.ui.components

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.view.ViewGroup
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.core.content.ContextCompat

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

    var uploadMessage by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }
    var pendingPermissionRequest by remember { mutableStateOf<PermissionRequest?>(null) }

    val fileChooserLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val uris = if (result.resultCode == android.app.Activity.RESULT_OK) {
            val data = result.data
            if (data?.data != null) {
                arrayOf(data.data!!)
            } else if (data?.clipData != null) {
                val clipData = data.clipData!!
                Array(clipData.itemCount) { i -> clipData.getItemAt(i).uri }
            } else {
                null
            }
        } else {
            null
        }
        uploadMessage?.onReceiveValue(uris)
        uploadMessage = null
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val request = pendingPermissionRequest
        if (request != null) {
            val grantedList = mutableListOf<String>()
            permissions.forEach { (perm, isGranted) ->
                if (isGranted) {
                    if (perm == Manifest.permission.CAMERA) {
                        grantedList.add(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                    }
                    if (perm == Manifest.permission.RECORD_AUDIO) {
                        grantedList.add(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                    }
                }
            }
            if (grantedList.isNotEmpty()) {
                request.grant(grantedList.toTypedArray())
            } else {
                request.deny()
            }
            pendingPermissionRequest = null
        }
    }

    LaunchedEffect(pendingPermissionRequest) {
        val request = pendingPermissionRequest
        if (request != null) {
            val neededPermissions = mutableListOf<String>()
            for (res in request.resources) {
                if (res == PermissionRequest.RESOURCE_VIDEO_CAPTURE) {
                    neededPermissions.add(Manifest.permission.CAMERA)
                }
                if (res == PermissionRequest.RESOURCE_AUDIO_CAPTURE) {
                    neededPermissions.add(Manifest.permission.RECORD_AUDIO)
                }
            }

            if (neededPermissions.isNotEmpty()) {
                val context = webViewInstance?.context
                if (context != null) {
                    val allGranted = neededPermissions.all { perm ->
                        ContextCompat.checkSelfPermission(context, perm) == PackageManager.PERMISSION_GRANTED
                    }
                    if (allGranted) {
                        request.grant(request.resources)
                        pendingPermissionRequest = null
                    } else {
                        permissionLauncher.launch(neededPermissions.toTypedArray())
                    }
                } else {
                    request.deny()
                    pendingPermissionRequest = null
                }
            } else {
                request.grant(request.resources)
                pendingPermissionRequest = null
            }
        }
    }

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

                        override fun onPermissionRequest(request: PermissionRequest?) {
                            pendingPermissionRequest = request
                        }

                        override fun onShowFileChooser(
                            webView: WebView?,
                            filePathCallback: ValueCallback<Array<Uri>>?,
                            fileChooserParams: FileChooserParams?
                        ): Boolean {
                            uploadMessage?.onReceiveValue(null)
                            uploadMessage = filePathCallback

                            val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                                addCategory(Intent.CATEGORY_OPENABLE)
                                type = "*/*"
                                fileChooserParams?.acceptTypes?.let { types ->
                                    val validTypes = types.filter { it.isNotEmpty() }
                                    if (validTypes.isNotEmpty()) {
                                        type = validTypes[0]
                                        if (validTypes.size > 1) {
                                            putExtra(Intent.EXTRA_MIME_TYPES, validTypes.toTypedArray())
                                        }
                                    }
                                }
                                if (fileChooserParams?.mode == FileChooserParams.MODE_OPEN_MULTIPLE) {
                                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                                }
                            }

                            try {
                                fileChooserLauncher.launch(intent)
                            } catch (e: Exception) {
                                uploadMessage?.onReceiveValue(null)
                                uploadMessage = null
                                return false
                            }
                            return true
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
