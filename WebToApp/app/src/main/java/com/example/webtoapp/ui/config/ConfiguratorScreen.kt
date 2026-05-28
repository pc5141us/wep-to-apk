package com.example.webtoapp.ui.config

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.example.webtoapp.data.AppConfig
import com.example.webtoapp.data.SidebarItem
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConfiguratorScreen(
    appConfig: AppConfig,
    onSaveConfig: (AppConfig) -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier
) {
    var appName by remember { mutableStateOf(appConfig.appName) }
    var primaryUrl by remember { mutableStateOf(appConfig.primaryUrl) }
    var logoUrl by remember { mutableStateOf(appConfig.logoUrl) }
    var themeColorHex by remember { mutableStateOf(appConfig.themeColorHex) }
    var isDarkTheme by remember { mutableStateOf(appConfig.isDarkTheme) }
    var sidebarItems by remember { mutableStateOf(appConfig.sidebarItems) }

    var showItemDialog by remember { mutableStateOf(false) }
    var editingItem by remember { mutableStateOf<SidebarItem?>(null) }

    val presetColors = listOf(
        "#2196F3" to "أزرق",
        "#6200EE" to "بنفسجي",
        "#4CAF50" to "أخضر",
        "#F44336" to "أحمر",
        "#FF9800" to "برتقالي",
        "#E91E63" to "وردي",
        "#3F51B5" to "نيلي",
        "#333333" to "رمادي داكن"
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("لوحة التحكم وإعدادات التطبيق", style = MaterialTheme.typography.titleMedium) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer
                ),
                actions = {
                    TextButton(onClick = onCancel) {
                        Text("إلغاء", color = MaterialTheme.colorScheme.error)
                    }
                }
            )
        },
        modifier = modifier
    ) { paddingValues ->
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // General Settings Card
            item {
                Card(
                    shape = RoundedCornerShape(12.dp),
                    elevation = CardDefaults.cardElevation(2.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier
                            .padding(16.dp)
                            .fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            text = "إعدادات الهوية والعلامة التجارية",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.primary
                        )
                        HorizontalDivider()

                        OutlinedTextField(
                            value = appName,
                            onValueChange = { appName = it },
                            label = { Text("اسم التطبيق") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )

                        OutlinedTextField(
                            value = primaryUrl,
                            onValueChange = { primaryUrl = it },
                            label = { Text("رابط الموقع الأساسي (URL)") },
                            placeholder = { Text("https://example.com") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )

                        OutlinedTextField(
                            value = logoUrl,
                            onValueChange = { logoUrl = it },
                            label = { Text("رابط صورة شعار التطبيق (Logo URL)") },
                            placeholder = { Text("https://example.com/logo.png") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )
                    }
                }
            }

            // Theme Settings Card
            item {
                Card(
                    shape = RoundedCornerShape(12.dp),
                    elevation = CardDefaults.cardElevation(2.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier
                            .padding(16.dp)
                            .fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            text = "تخصيص المظهر والألوان",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.primary
                        )
                        HorizontalDivider()

                        Text("اختر لون التطبيق الرئيسي:")
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            presetColors.forEach { (hex, name) ->
                                val color = Color(android.graphics.Color.parseColor(hex))
                                Box(
                                    modifier = Modifier
                                        .size(36.dp)
                                        .clip(CircleShape)
                                        .background(color)
                                        .border(
                                            width = if (themeColorHex == hex) 3.dp else 0.dp,
                                            color = if (themeColorHex == hex) MaterialTheme.colorScheme.outline else Color.Transparent,
                                            shape = CircleShape
                                        )
                                        .clickable { themeColorHex = hex }
                                )
                            }
                        }

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("تشغيل المظهر الداكن (Dark Mode)", modifier = Modifier.weight(1f))
                            Switch(
                                checked = isDarkTheme,
                                onCheckedChange = { isDarkTheme = it }
                            )
                        }
                    }
                }
            }

            // Sidebar Items Management Card
            item {
                Card(
                    shape = RoundedCornerShape(12.dp),
                    elevation = CardDefaults.cardElevation(2.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier
                            .padding(16.dp)
                            .fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = "صفحات القائمة الجانبية",
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.weight(1f)
                            )
                            Button(
                                onClick = {
                                    editingItem = null
                                    showItemDialog = true
                                },
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                            ) {
                                Icon(Icons.Default.Add, contentDescription = "إضافة")
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("إضافة صفحة")
                            }
                        }
                        HorizontalDivider()

                        if (sidebarItems.isEmpty()) {
                            Text(
                                "لا توجد صفحات إضافية حالياً. سيتم عرض الرابط الأساسي فقط.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = Color.Gray,
                                modifier = Modifier.padding(vertical = 8.dp)
                            )
                        }
                    }
                }
            }

            items(sidebarItems) { item ->
                Card(
                    shape = RoundedCornerShape(8.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 4.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .padding(12.dp)
                            .fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = getIconForName(item.iconName),
                            contentDescription = item.title,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(item.title, style = MaterialTheme.typography.bodyLarge)
                            Text(
                                text = if (item.type == "WEB_URL") "رابط ويب خارجي" else "صفحة HTML مخصصة",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color.Gray
                            )
                        }
                        IconButton(onClick = {
                            editingItem = item
                            showItemDialog = true
                        }) {
                            Icon(Icons.Default.Edit, contentDescription = "تعديل", tint = MaterialTheme.colorScheme.secondary)
                        }
                        IconButton(onClick = {
                            sidebarItems = sidebarItems.filter { it.id != item.id }
                        }) {
                            Icon(Icons.Default.Delete, contentDescription = "حذف", tint = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }

            // Save Action Card
            item {
                Button(
                    onClick = {
                        val newConfig = AppConfig(
                            appName = appName.trim(),
                            primaryUrl = primaryUrl.trim(),
                            logoUrl = logoUrl.trim(),
                            themeColorHex = themeColorHex,
                            isDarkTheme = isDarkTheme,
                            sidebarItems = sidebarItems
                        )
                        onSaveConfig(newConfig)
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text("حفظ التغييرات وتطبيقها", style = MaterialTheme.typography.titleMedium)
                }
                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }

    if (showItemDialog) {
        SidebarItemDialog(
            item = editingItem,
            onDismiss = { showItemDialog = false },
            onSave = { newItem ->
                if (editingItem == null) {
                    sidebarItems = sidebarItems + newItem
                } else {
                    sidebarItems = sidebarItems.map { if (it.id == newItem.id) newItem else it }
                }
                showItemDialog = false
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SidebarItemDialog(
    item: SidebarItem?,
    onDismiss: () -> Unit,
    onSave: (SidebarItem) -> Unit
) {
    var title by remember { mutableStateOf(item?.title ?: "") }
    var type by remember { mutableStateOf(item?.type ?: "WEB_URL") }
    var urlOrContent by remember { mutableStateOf(item?.urlOrContent ?: "") }
    var iconName by remember { mutableStateOf(item?.iconName ?: "Link") }

    val iconsList = listOf("Home", "Info", "Link", "Settings", "Document", "Star", "Person")

    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                item {
                    Text(
                        text = if (item == null) "إضافة صفحة جديدة" else "تعديل الصفحة",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                }

                item {
                    OutlinedTextField(
                        value = title,
                        onValueChange = { title = it },
                        label = { Text("عنوان الصفحة") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                }

                item {
                    Text("نوع الصفحة:", style = MaterialTheme.typography.bodyMedium)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(
                                selected = type == "WEB_URL",
                                onClick = { type = "WEB_URL" }
                            )
                            Text("رابط ويب")
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(
                                selected = type == "CUSTOM_HTML",
                                onClick = { type = "CUSTOM_HTML" }
                            )
                            Text("صفحة HTML")
                        }
                    }
                }

                item {
                    if (type == "WEB_URL") {
                        OutlinedTextField(
                            value = urlOrContent,
                            onValueChange = { urlOrContent = it },
                            label = { Text("رابط الصفحة (URL)") },
                            placeholder = { Text("https://example.com/page") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )
                    } else {
                        OutlinedTextField(
                            value = urlOrContent,
                            onValueChange = { urlOrContent = it },
                            label = { Text("كود HTML للصفحة") },
                            placeholder = { Text("<html><body><h1>عنوان</h1></body></html>") },
                            modifier = Modifier.fillMaxWidth(),
                            minLines = 6,
                            maxLines = 10,
                            textStyle = LocalTextStyle.current.copy(fontFamily = FontFamily.Monospace)
                        )
                    }
                }

                item {
                    Text("اختر أيقونة الصفحة:", style = MaterialTheme.typography.bodyMedium)
                    Spacer(modifier = Modifier.height(4.dp))
                }

                item {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        iconsList.forEach { name ->
                            Box(
                                contentAlignment = Alignment.Center,
                                modifier = Modifier
                                    .size(36.dp)
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(
                                        if (iconName == name) MaterialTheme.colorScheme.primaryContainer
                                        else Color.Transparent
                                    )
                                    .border(
                                        width = 1.dp,
                                        color = if (iconName == name) MaterialTheme.colorScheme.primary else Color.LightGray,
                                        shape = RoundedCornerShape(4.dp)
                                    )
                                    .clickable { iconName = name }
                            ) {
                                Icon(
                                    imageVector = getIconForName(name),
                                    contentDescription = name,
                                    tint = if (iconName == name) MaterialTheme.colorScheme.onPrimaryContainer else Color.DarkGray,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }
                    }
                }

                item {
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        TextButton(
                            onClick = onDismiss,
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("إلغاء")
                        }
                        Button(
                            onClick = {
                                if (title.trim().isNotEmpty()) {
                                    val id = item?.id ?: UUID.randomUUID().toString()
                                    val newItem = SidebarItem(
                                        id = id,
                                        title = title.trim(),
                                        type = type,
                                        urlOrContent = urlOrContent.trim(),
                                        iconName = iconName
                                    )
                                    onSave(newItem)
                                }
                            },
                            enabled = title.trim().isNotEmpty(),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("حفظ")
                        }
                    }
                }
            }
        }
    }
}

fun getIconForName(name: String): ImageVector {
    return when (name) {
        "Home" -> Icons.Default.Home
        "Info" -> Icons.Default.Info
        "Link" -> Icons.Default.Link
        "Settings" -> Icons.Default.Settings
        "Document" -> Icons.Default.Article
        "Star" -> Icons.Default.Star
        "Person" -> Icons.Default.Person
        else -> Icons.Default.Language
    }
}
