package com.example.webtoapp.ui.splash

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Language
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.webtoapp.R
import com.example.webtoapp.data.AppConfigRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.net.URL

private fun drawableToBitmap(drawable: Drawable): Bitmap {
    if (drawable is BitmapDrawable && drawable.bitmap != null) {
        return drawable.bitmap
    }
    val width = if (drawable.intrinsicWidth > 0) drawable.intrinsicWidth else 512
    val height = if (drawable.intrinsicHeight > 0) drawable.intrinsicHeight else 512
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    drawable.setBounds(0, 0, canvas.width, canvas.height)
    drawable.draw(canvas)
    return bitmap
}

@Composable
fun SplashScreen(
    onTimeout: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val config = remember { AppConfigRepository(context).loadConfig() }

    val parsedColor = remember(config.themeColorHex) {
        try {
            Color(android.graphics.Color.parseColor(config.themeColorHex))
        } catch (e: Exception) {
            Color(0xFF2196F3)
        }
    }

    val backgroundColor = if (config.isDarkTheme) Color(0xFF121212) else Color.White
    val textColor = if (config.isDarkTheme) Color.White else Color(0xFF1E1E1E)

    // Try loading logo from config.logoUrl first (user-uploaded icon)
    // If empty or fails, fall back to the compiled app launcher icon
    var logoBitmap by remember { mutableStateOf<ImageBitmap?>(null) }

    // Priority: splashImageUrl > logoUrl > compiled app icon
    // This lets users set a separate bigger splash image independent of the app icon.
    val splashUrl = when {
        config.splashImageUrl.isNotEmpty() -> config.splashImageUrl
        config.logoUrl.isNotEmpty()        -> config.logoUrl
        else                               -> ""
    }

    LaunchedEffect(splashUrl) {
        withContext(Dispatchers.IO) {
            // Attempt 1: Download from splashUrl (splashImageUrl or logoUrl)
            if (splashUrl.isNotEmpty() && splashUrl.startsWith("http")) {
                try {
                    val stream = URL(splashUrl).openStream()
                    val bmp = BitmapFactory.decodeStream(stream)
                    if (bmp != null) {
                        logoBitmap = bmp.asImageBitmap()
                        return@withContext
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }

            // Attempt 2: Fall back to compiled launcher icon from PackageManager
            try {
                val drawable = context.packageManager.getApplicationIcon(context.packageName)
                logoBitmap = drawableToBitmap(drawable).asImageBitmap()
            } catch (e: Exception) {
                e.printStackTrace()
                try {
                    @Suppress("DEPRECATION")
                    val fallback = context.resources.getDrawable(R.mipmap.ic_launcher)
                    logoBitmap = drawableToBitmap(fallback).asImageBitmap()
                } catch (e2: Exception) {
                    // logoBitmap stays null — fallback icon shown in UI
                }
            }
        }
    }

    LaunchedEffect(Unit) {
        delay(3000)
        onTimeout()
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(backgroundColor),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.padding(24.dp)
        ) {
            // App Logo
            val bmp = logoBitmap
            if (bmp != null) {
                Image(
                    bitmap = bmp,
                    contentDescription = "App Logo",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(110.dp)
                        .clip(RoundedCornerShape(24.dp))
                        .border(3.dp, parsedColor, RoundedCornerShape(24.dp))
                )
            } else {
                Icon(
                    imageVector = Icons.Default.Language,
                    contentDescription = "Fallback Logo",
                    tint = parsedColor,
                    modifier = Modifier
                        .size(110.dp)
                        .clip(RoundedCornerShape(24.dp))
                        .background(if (config.isDarkTheme) Color(0xFF1E1E1E) else Color(0xFFF9F9F9))
                        .border(3.dp, parsedColor, RoundedCornerShape(24.dp))
                        .padding(12.dp)
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            Text(
                text = config.appName,
                fontSize = 26.sp,
                fontWeight = FontWeight.Bold,
                color = textColor
            )

            Spacer(modifier = Modifier.height(48.dp))

            CircularProgressIndicator(
                color = parsedColor,
                strokeWidth = 3.dp,
                modifier = Modifier.size(36.dp)
            )
        }
    }
}
