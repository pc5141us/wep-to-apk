package com.example.webtoapp.data

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

class AppConfigRepository(private val context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("app_config_prefs", Context.MODE_PRIVATE)

    fun loadConfig(): AppConfig {
        val configStr = prefs.getString("app_config", null)
        if (configStr.isNullOrEmpty()) {
            val assetsConfig = loadConfigFromAssets()
            if (assetsConfig != null) {
                saveConfig(assetsConfig)
                return assetsConfig
            }
            return getDefaultConfig()
        }
        return try {
            parseConfigJson(configStr)
        } catch (e: Exception) {
            e.printStackTrace()
            getDefaultConfig()
        }
    }

    private fun loadConfigFromAssets(): AppConfig? {
        return try {
            val inputStream = context.assets.open("app_config.json")
            val size = inputStream.available()
            val buffer = ByteArray(size)
            inputStream.read(buffer)
            inputStream.close()
            val jsonStr = String(buffer, Charsets.UTF_8)
            parseConfigJson(jsonStr)
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    private fun parseConfigJson(jsonStr: String): AppConfig {
        val json = JSONObject(jsonStr)
        val appName = json.optString("appName", "جوجل")
        val primaryUrl = json.optString("primaryUrl", "https://www.google.com")
        val logoUrl = json.optString("logoUrl", "")
        val splashImageUrl = json.optString("splashImageUrl", "")
        val appPackage = json.optString("appPackage", "com.example.webtoapp")
        val themeColorHex = json.optString("themeColorHex", "#2196F3")
        val isDarkTheme = json.optBoolean("isDarkTheme", false)
        
        val itemsList = mutableListOf<SidebarItem>()
        val itemsArray = json.optJSONArray("sidebarItems")
        if (itemsArray != null) {
            for (i in 0 until itemsArray.length()) {
                val itemJson = itemsArray.getJSONObject(i)
                itemsList.add(
                    SidebarItem(
                        id = itemJson.getString("id"),
                        title = itemJson.getString("title"),
                        type = itemJson.getString("type"),
                        urlOrContent = itemJson.getString("urlOrContent"),
                        iconName = itemJson.optString("iconName", "Link")
                    )
                )
            }
        }
        return AppConfig(appName, primaryUrl, logoUrl, splashImageUrl, appPackage, themeColorHex, isDarkTheme, itemsList)
    }

    fun saveConfig(config: AppConfig) {
        try {
            val json = JSONObject()
            json.put("appName", config.appName)
            json.put("primaryUrl", config.primaryUrl)
            json.put("logoUrl", config.logoUrl)
            json.put("splashImageUrl", config.splashImageUrl)
            json.put("appPackage", config.appPackage)
            json.put("themeColorHex", config.themeColorHex)
            json.put("isDarkTheme", config.isDarkTheme)

            val itemsArray = JSONArray()
            for (item in config.sidebarItems) {
                val itemJson = JSONObject()
                itemJson.put("id", item.id)
                itemJson.put("title", item.title)
                itemJson.put("type", item.type)
                itemJson.put("urlOrContent", item.urlOrContent)
                itemJson.put("iconName", item.iconName)
                itemsArray.put(itemJson)
            }
            json.put("sidebarItems", itemsArray)

            prefs.edit().putString("app_config", json.toString()).apply()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun getDefaultConfig(): AppConfig {
        return AppConfig(
            appName = "جوجل",
            primaryUrl = "https://www.google.com",
            logoUrl = "https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_92x30dp.png",
            appPackage = "com.example.webtoapp.google",
            themeColorHex = "#2196F3",
            isDarkTheme = false,
            sidebarItems = listOf(
                SidebarItem("home", "الرئيسية (جوجل)", "WEB_URL", "https://www.google.com", "Home"),
                SidebarItem("wiki", "ويكيبيديا", "WEB_URL", "https://ar.wikipedia.org", "Link"),
                SidebarItem("about", "حول التطبيق", "CUSTOM_HTML", """
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1">
                        <style>
                            body {
                                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                                padding: 20px;
                                line-height: 1.6;
                                color: #333;
                                background-color: #f9f9f9;
                                direction: rtl;
                            }
                            h1 { color: #2196F3; border-bottom: 2px solid #2196F3; padding-bottom: 10px; }
                            .card {
                                background: white;
                                padding: 20px;
                                border-radius: 8px;
                                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                                margin-top: 20px;
                            }
                        </style>
                    </head>
                    <body>
                        <h1>حول التطبيق</h1>
                        <div class="card">
                            <p>مرحباً بك في تطبيق محول المواقع الذكي!</p>
                            <p>تم تصميم هذا التطبيق ليتيح لك تحويل أي موقع ويب إلى تطبيق أندرويد متكامل مع لوحة جانبية وقدرة كاملة على التحكم بالصفحات والمحتوى ديناميكياً.</p>
                        </div>
                    </body>
                    </html>
                """.trimIndent(), "Info")
            )
        )
    }
}
