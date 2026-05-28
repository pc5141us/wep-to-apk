package com.example.webtoapp.data

data class SidebarItem(
    val id: String,
    val title: String,
    val type: String, // "WEB_URL" or "CUSTOM_HTML"
    val urlOrContent: String,
    val iconName: String // "Home", "Info", "Link", "Settings", "Document", "Star", "Person"
)

data class AppConfig(
    val appName: String,
    val primaryUrl: String,
    val logoUrl: String = "",
    val splashImageUrl: String = "",
    val appPackage: String = "com.example.webtoapp",
    val themeColorHex: String = "#2196F3",
    val isDarkTheme: Boolean = false,
    val sidebarItems: List<SidebarItem> = emptyList(),
    val enableZoom: Boolean = true,
    val showProgressBar: Boolean = true,
    val userAgent: String = ""
)
