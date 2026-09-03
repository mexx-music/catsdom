package com.example.catsdom

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import com.example.catsdom.ui.CatsdomApp
import com.example.catsdom.ui.theme.CatsdomTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            CatsdomTheme {
                var gameStarted by rememberSaveable { mutableStateOf(false) }
                CatsdomApp(
                    gameStarted = gameStarted,
                    onStartGame = { gameStarted = true },
                    onBackToStart = { gameStarted = false },
                )
            }
        }
    }
}
