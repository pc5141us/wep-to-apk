package com.example.webtoapp.ui.main

import android.graphics.BitmapFactory
import android.webkit.WebView
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Home
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation3.runtime.NavKey
import com.example.webtoapp.data.AppConfig
import com.example.webtoapp.data.AppConfigRepository
import com.example.webtoapp.ui.components.WebViewContainer
import com.example.webtoapp.ui.config.ConfiguratorScreen
import com.example.webtoapp.ui.config.getIconForName
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.URL

@Composable
fun MainScreen(
    onItemClick: (NavKey) -> Unit,
    onWebViewCreated: (WebView?) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val viewModel: MainScreenViewModel = viewModel {
        MainScreenViewModel(AppConfigRepository(context))
    }
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val activeItem by viewModel.activeItem.collectAsStateWithLifecycle()

    when (val state = uiState) {
        MainScreenUiState.Loading -> {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        }
        is MainScreenUiState.Success -> {
            // Apply dynamic Theme wrapper
            DynamicTheme(config = state.config) {
                MainAppContent(
                    config = state.config,
                    activeItem = activeItem,
                    viewModel = viewModel,
                    onWebViewCreated = onWebViewCreated,
                    modifier = modifier
                )
            }
        }
        is MainScreenUiState.Error -> {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("حدث خطأ في تحميل البيانات: ${state.throwable.localizedMessage}")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainAppContent(
    config: AppConfig,
    activeItem: com.example.webtoapp.data.SidebarItem?,
    viewModel: MainScreenViewModel,
    onWebViewCreated: (WebView?) -> Unit,
    modifier: Modifier = Modifier
) {
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val scope = rememberCoroutineScope()

    // Force RTL layout direction for Arabic experience
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
        ModalNavigationDrawer(
            drawerState = drawerState,
            drawerContent = {
                ModalDrawerSheet(
                    drawerContainerColor = MaterialTheme.colorScheme.surface,
                    modifier = Modifier.width(300.dp)
                ) {
                    Spacer(modifier = Modifier.height(16.dp))

                    // Home (الرئيسية) item
                    NavigationDrawerItem(
                        icon = { Icon(Icons.Default.Home, contentDescription = "الرئيسية") },
                        label = { Text("الرئيسية") },
                        selected = activeItem == null,
                        onClick = {
                            viewModel.selectSidebarItem(null)
                            scope.launch { drawerState.close() }
                        },
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp)
                    )

                    config.sidebarItems.forEach { item ->
                        NavigationDrawerItem(
                            icon = { Icon(getIconForName(item.iconName), contentDescription = item.title) },
                            label = { Text(item.title) },
                            selected = activeItem?.id == item.id,
                            onClick = {
                                viewModel.selectSidebarItem(item)
                                scope.launch { drawerState.close() }
                            },
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp)
                        )
                    }
                }
            }
        ) {
            Scaffold(
                modifier = modifier
            ) { paddingValues ->
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues)
                ) {
                    // Render WebView content
                    val url = activeItem?.urlOrContent ?: config.primaryUrl
                    val isHtml = activeItem?.type == "CUSTOM_HTML"

                    WebViewContainer(
                        url = if (isHtml) "" else url,
                        htmlContent = if (isHtml) url else null,
                        onWebViewCreated = onWebViewCreated,
                        enableZoom = config.enableZoom,
                        showProgressBar = config.showProgressBar,
                        userAgent = config.userAgent,
                        modifier = Modifier.fillMaxSize()
                    )
                }
            }
        }
    }
}

@Composable
fun DynamicTheme(config: AppConfig, content: @Composable () -> Unit) {
    val parsedColor = remember(config.themeColorHex) {
        try {
            Color(android.graphics.Color.parseColor(config.themeColorHex))
        } catch (e: Exception) {
            Color(0xFF2196F3)
        }
    }

    val dynamicColorScheme = if (config.isDarkTheme) {
        darkColorScheme(
            primary = parsedColor,
            secondary = parsedColor,
            background = Color(0xFF121212),
            surface = Color(0xFF1E1E1E),
            primaryContainer = parsedColor.copy(alpha = 0.3f),
            onPrimaryContainer = Color.White
        )
    } else {
        lightColorScheme(
            primary = parsedColor,
            secondary = parsedColor,
            background = Color(0xFFF5F5F5),
            surface = Color.White,
            primaryContainer = parsedColor,
            onPrimaryContainer = Color.White
        )
    }

    MaterialTheme(
        colorScheme = dynamicColorScheme,
        content = content
    )
}

@Composable
fun NetworkImage(url: String, modifier: Modifier = Modifier) {
    var bitmap by remember(url) { mutableStateOf<ImageBitmap?>(null) }

    LaunchedEffect(url) {
        if (url.isNotEmpty()) {
            withContext(Dispatchers.IO) {
                try {
                    val stream = URL(url).openStream()
                    val bmp = BitmapFactory.decodeStream(stream)
                    bitmap = bmp?.asImageBitmap()
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
    }

    val bmp = bitmap
    if (bmp != null) {
        Image(
            bitmap = bmp,
            contentDescription = "Logo",
            modifier = modifier,
            contentScale = ContentScale.Fit
        )
    } else {
        Icon(
            imageVector = Icons.Default.Language,
            contentDescription = "Default Logo",
            tint = MaterialTheme.colorScheme.primary,
            modifier = modifier
        )
    }
}
