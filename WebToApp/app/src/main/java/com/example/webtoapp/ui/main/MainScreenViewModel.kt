package com.example.webtoapp.ui.main

import androidx.lifecycle.ViewModel
import com.example.webtoapp.data.AppConfig
import com.example.webtoapp.data.AppConfigRepository
import com.example.webtoapp.data.SidebarItem
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class MainScreenViewModel(private val repository: AppConfigRepository) : ViewModel() {
    private val _uiState = MutableStateFlow<MainScreenUiState>(MainScreenUiState.Loading)
    val uiState: StateFlow<MainScreenUiState> = _uiState.asStateFlow()

    private val _activeItem = MutableStateFlow<SidebarItem?>(null)
    val activeItem: StateFlow<SidebarItem?> = _activeItem.asStateFlow()

    private val _isConfiguratorMode = MutableStateFlow(false)
    val isConfiguratorMode: StateFlow<Boolean> = _isConfiguratorMode.asStateFlow()

    init {
        loadConfig()
    }

    private fun loadConfig() {
        try {
            val config = repository.loadConfig()
            _uiState.value = MainScreenUiState.Success(config)
            _activeItem.value = null
        } catch (e: Exception) {
            _uiState.value = MainScreenUiState.Error(e)
        }
    }

    fun saveConfig(newConfig: AppConfig) {
        repository.saveConfig(newConfig)
        _uiState.value = MainScreenUiState.Success(newConfig)
        _isConfiguratorMode.value = false
        _activeItem.value = null
    }

    fun selectSidebarItem(item: SidebarItem?) {
        _activeItem.value = item
        _isConfiguratorMode.value = false
    }

    fun setConfiguratorMode(enabled: Boolean) {
        _isConfiguratorMode.value = enabled
    }
}

sealed interface MainScreenUiState {
    object Loading : MainScreenUiState
    data class Error(val throwable: Throwable) : MainScreenUiState
    data class Success(val config: AppConfig) : MainScreenUiState
}
