package com.example.webtoapp

import android.webkit.WebView
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import com.example.webtoapp.ui.main.MainScreen
import com.example.webtoapp.ui.splash.SplashScreen

@Composable
fun MainNavigation(onWebViewCreated: (WebView?) -> Unit) {
  var showSplash by remember { mutableStateOf(true) }

  if (showSplash) {
    SplashScreen(
      onTimeout = { showSplash = false }
    )
  } else {
    val backStack = rememberNavBackStack(Main)

    NavDisplay(
      backStack = backStack,
      onBack = { backStack.removeLastOrNull() },
      entryProvider =
        entryProvider {
          entry<Main> {
            MainScreen(
              onItemClick = { navKey -> backStack.add(navKey) },
              onWebViewCreated = onWebViewCreated,
              modifier = Modifier.safeDrawingPadding()
            )
          }
        },
    )
  }
}
