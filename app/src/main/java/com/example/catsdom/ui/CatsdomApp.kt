package com.example.catsdom.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.catsdom.game.GameEngine
import com.example.catsdom.game.Position
import com.example.catsdom.game.TileType
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val Cream = Color(0xFFFFF8E8)
private val Ink = Color(0xFF3E3150)
private val Plum = Color(0xFF7A4E8E)
private val Coral = Color(0xFFFF806D)
private val Mint = Color(0xFF83D6B2)
private val BoardBlue = Color(0xFF5E86B3)

@Composable
fun CatsdomApp(
    gameStarted: Boolean,
    onStartGame: () -> Unit,
    onBackToStart: () -> Unit,
) {
    Surface(modifier = Modifier.fillMaxSize(), color = Cream) {
        if (gameStarted) {
            GameScreen(onBackToStart = onBackToStart)
        } else {
            StartScreen(onStartGame = onStartGame)
        }
    }
}

@Composable
private fun StartScreen(onStartGame: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(Color(0xFFFFE3C6), Cream, Color(0xFFDDF4E8)),
                ),
            )
            .safeDrawingPadding()
            .padding(horizontal = 28.dp),
    ) {
        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .widthIn(max = 460.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "CATSDOM",
                color = Plum,
                fontWeight = FontWeight.Black,
                fontSize = 17.sp,
                letterSpacing = 4.sp,
            )
            Spacer(Modifier.height(14.dp))
            StartLogo()
            Spacer(Modifier.height(24.dp))
            Text(
                text = "Pfoten-Puzzle",
                color = Ink,
                style = MaterialTheme.typography.displaySmall,
                fontWeight = FontWeight.Black,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                text = "Tausche süße Katzensachen und bilde Reihen aus drei oder mehr Teilen.",
                color = Ink.copy(alpha = 0.76f),
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(34.dp))
            Button(
                onClick = onStartGame,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(58.dp),
                shape = RoundedCornerShape(20.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Coral),
            ) {
                Text("Losspielen", fontSize = 19.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(16.dp))
            Text(
                text = "25 Züge · 6 Symboltypen · endlose Kombinationen",
                color = Plum,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun StartLogo() {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf(TileType.YARN, TileType.CAT, TileType.PAW).forEachIndexed { index, tile ->
            PuzzleTile(
                tile = tile,
                selected = index == 1,
                enabled = false,
                onClick = {},
                modifier = Modifier.size(if (index == 1) 82.dp else 70.dp),
            )
        }
    }
}

@Composable
private fun GameScreen(onBackToStart: () -> Unit) {
    BackHandler(onBack = onBackToStart)
    val engine = remember { GameEngine() }
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf(engine.newGame()) }
    var selected by remember { mutableStateOf<Position?>(null) }
    var resolving by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf("Wähle zwei benachbarte Felder") }

    fun restart() {
        state = engine.newGame()
        selected = null
        resolving = false
        message = "Wähle zwei benachbarte Felder"
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(listOf(Color(0xFFFFE6C9), Color(0xFFE5F5EC))),
            )
            .safeDrawingPadding(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 14.dp, vertical = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            GameHeader(onBackToStart = onBackToStart, onRestart = ::restart)
            Spacer(Modifier.height(12.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 560.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                ScoreCard(label = "PUNKTE", value = state.score.toString(), modifier = Modifier.weight(1f))
                ScoreCard(label = "ZÜGE", value = state.movesLeft.toString(), modifier = Modifier.weight(1f))
            }
            Spacer(Modifier.height(12.dp))
            PuzzleBoard(
                board = state.board,
                selected = selected,
                enabled = !resolving && state.movesLeft > 0,
                onTileTap = { position ->
                    val currentSelection = selected
                    when {
                        currentSelection == null -> {
                            selected = position
                            message = "Jetzt ein Nachbarfeld wählen"
                        }
                        currentSelection == position -> {
                            selected = null
                            message = "Auswahl aufgehoben"
                        }
                        else -> {
                            val result = engine.trySwap(state, currentSelection, position)
                            if (!result.accepted) {
                                selected = position
                                message = "Nur Nachbarn tauschen – die Reihe muss 3+ ergeben"
                            } else {
                                selected = null
                                resolving = true
                                val gainedPoints = result.finalState.score - state.score
                                scope.launch {
                                    result.frames.forEach { frame ->
                                        state = frame
                                        val hasGap = frame.board.any { row -> row.any { it == null } }
                                        delay(if (hasGap) 190 else 130)
                                    }
                                    message = "+$gainedPoints Punkte · ${result.removedTiles} Teile entfernt"
                                    resolving = false
                                }
                            }
                        }
                    }
                },
            )
            Spacer(Modifier.height(12.dp))
            Text(
                text = if (resolving) "Miau! Kombination läuft …" else message,
                color = Ink.copy(alpha = 0.78f),
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.Center,
                minLines = 2,
            )
        }
    }

    if (state.movesLeft == 0 && !resolving) {
        AlertDialog(
            onDismissRequest = {},
            title = { Text("Runde geschafft!", fontWeight = FontWeight.Bold) },
            text = { Text("Du hast ${state.score} Punkte gesammelt.") },
            confirmButton = {
                Button(onClick = ::restart) { Text("Noch einmal") }
            },
            dismissButton = {
                TextButton(onClick = onBackToStart) { Text("Zum Start") }
            },
        )
    }
}

@Composable
private fun GameHeader(onBackToStart: () -> Unit, onRestart: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .widthIn(max = 560.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        TextButton(onClick = onBackToStart) { Text("‹ Start", color = Plum) }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("PFOTEN-PUZZLE", color = Plum, fontWeight = FontWeight.Black, letterSpacing = 1.sp)
            Text("Bilde Reihen aus 3+", color = Ink.copy(alpha = 0.66f), fontSize = 12.sp)
        }
        TextButton(onClick = onRestart) { Text("Neu", color = Plum) }
    }
}

@Composable
private fun ScoreCard(label: String, value: String, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        color = Color.White.copy(alpha = 0.82f),
        shape = RoundedCornerShape(18.dp),
        shadowElevation = 2.dp,
    ) {
        Column(
            modifier = Modifier.padding(vertical = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(label, color = Plum, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
            Text(value, color = Ink, fontSize = 24.sp, fontWeight = FontWeight.Black)
        }
    }
}

@Composable
private fun PuzzleBoard(
    board: List<List<TileType?>>,
    selected: Position?,
    enabled: Boolean,
    onTileTap: (Position) -> Unit,
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .widthIn(max = 560.dp)
            .aspectRatio(1f),
        color = BoardBlue,
        shape = RoundedCornerShape(22.dp),
        shadowElevation = 7.dp,
    ) {
        Column(
            modifier = Modifier.padding(7.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            board.forEachIndexed { rowIndex, row ->
                Row(
                    modifier = Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    row.forEachIndexed { columnIndex, tile ->
                        PuzzleTile(
                            tile = tile,
                            selected = selected == Position(rowIndex, columnIndex),
                            enabled = enabled,
                            onClick = { onTileTap(Position(rowIndex, columnIndex)) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PuzzleTile(
    tile: TileType?,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tileColor = tile?.backgroundColor() ?: Color.Transparent
    Box(
        modifier = modifier
            .aspectRatio(1f)
            .clip(RoundedCornerShape(10.dp))
            .background(tileColor)
            .then(
                if (selected) Modifier.border(3.dp, Color.White, RoundedCornerShape(10.dp))
                else Modifier,
            )
            .clickable(enabled = enabled && tile != null, onClick = onClick)
            .semantics { contentDescription = tile?.description() ?: "Leeres Feld" }
            .padding(5.dp),
        contentAlignment = Alignment.Center,
    ) {
        AnimatedVisibility(
            visible = tile != null,
            enter = fadeIn() + scaleIn(initialScale = 0.55f),
            exit = fadeOut() + scaleOut(targetScale = 0.55f),
        ) {
            if (tile != null) TileDrawing(tile)
        }
    }
}

@Composable
private fun TileDrawing(tile: TileType) {
    Canvas(modifier = Modifier.fillMaxSize()) {
        when (tile) {
            TileType.CAT -> drawCat()
            TileType.PAW -> drawPaw()
            TileType.FISH -> drawFish()
            TileType.YARN -> drawYarn()
            TileType.MOUSE -> drawMouse()
            TileType.BELL -> drawBell()
        }
    }
}

private fun TileType.backgroundColor(): Color = when (this) {
    TileType.CAT -> Color(0xFFFFA45B)
    TileType.PAW -> Color(0xFFE98EA6)
    TileType.FISH -> Color(0xFF57B6D9)
    TileType.YARN -> Color(0xFF9B78D1)
    TileType.MOUSE -> Color(0xFF8CB7A2)
    TileType.BELL -> Color(0xFFF2C94C)
}

private fun TileType.description(): String = when (this) {
    TileType.CAT -> "Katze"
    TileType.PAW -> "Pfote"
    TileType.FISH -> "Fisch"
    TileType.YARN -> "Wollknäuel"
    TileType.MOUSE -> "Maus"
    TileType.BELL -> "Glöckchen"
}

private fun DrawScope.drawCat() {
    val white = Color(0xFFFFF8ED)
    val outline = Color(0xFF5D3A3A)
    val earPath = Path().apply {
        moveTo(size.width * .22f, size.height * .35f)
        lineTo(size.width * .27f, size.height * .08f)
        lineTo(size.width * .45f, size.height * .27f)
        moveTo(size.width * .55f, size.height * .27f)
        lineTo(size.width * .73f, size.height * .08f)
        lineTo(size.width * .78f, size.height * .35f)
    }
    drawPath(earPath, white, style = Stroke(width = size.minDimension * .16f, cap = StrokeCap.Round))
    drawCircle(white, radius = size.minDimension * .32f, center = Offset(size.width * .5f, size.height * .55f))
    drawCircle(outline, radius = size.minDimension * .035f, center = Offset(size.width * .39f, size.height * .52f))
    drawCircle(outline, radius = size.minDimension * .035f, center = Offset(size.width * .61f, size.height * .52f))
    drawCircle(Coral, radius = size.minDimension * .035f, center = Offset(size.width * .5f, size.height * .62f))
}

private fun DrawScope.drawPaw() {
    val color = Color(0xFFFFF6EA)
    drawCircle(color, size.minDimension * .20f, Offset(size.width * .5f, size.height * .62f))
    listOf(.28f to .36f, .43f to .25f, .59f to .25f, .73f to .38f).forEach { (x, y) ->
        drawCircle(color, size.minDimension * .10f, Offset(size.width * x, size.height * y))
    }
}

private fun DrawScope.drawFish() {
    val color = Color(0xFFFFF7DC)
    drawOval(color, topLeft = Offset(size.width * .20f, size.height * .30f), size = Size(size.width * .55f, size.height * .40f))
    val tail = Path().apply {
        moveTo(size.width * .24f, size.height * .50f)
        lineTo(size.width * .05f, size.height * .27f)
        lineTo(size.width * .05f, size.height * .73f)
        close()
    }
    drawPath(tail, color)
    drawCircle(Ink, size.minDimension * .035f, Offset(size.width * .62f, size.height * .44f))
}

private fun DrawScope.drawYarn() {
    val color = Color(0xFFFFF4E6)
    val stroke = size.minDimension * .055f
    drawCircle(color, size.minDimension * .31f, Offset(size.width * .48f, size.height * .50f))
    drawArc(
        color = Plum,
        startAngle = 15f,
        sweepAngle = 150f,
        useCenter = false,
        topLeft = Offset(size.width * .20f, size.height * .32f),
        size = Size(size.width * .52f, size.height * .33f),
        style = Stroke(stroke),
    )
    drawArc(
        color = Plum,
        startAngle = 190f,
        sweepAngle = 130f,
        useCenter = false,
        topLeft = Offset(size.width * .28f, size.height * .25f),
        size = Size(size.width * .37f, size.height * .50f),
        style = Stroke(stroke),
    )
    drawLine(color, Offset(size.width * .67f, size.height * .68f), Offset(size.width * .88f, size.height * .82f), stroke, StrokeCap.Round)
}

private fun DrawScope.drawMouse() {
    val color = Color(0xFFFFF6E8)
    drawCircle(color, size.minDimension * .13f, Offset(size.width * .35f, size.height * .30f))
    drawCircle(color, size.minDimension * .13f, Offset(size.width * .58f, size.height * .29f))
    drawOval(color, Offset(size.width * .22f, size.height * .27f), Size(size.width * .53f, size.height * .49f))
    drawCircle(Ink, size.minDimension * .035f, Offset(size.width * .57f, size.height * .48f))
    drawCircle(Coral, size.minDimension * .04f, Offset(size.width * .74f, size.height * .58f))
    val tail = Path().apply {
        moveTo(size.width * .27f, size.height * .65f)
        cubicTo(size.width * .07f, size.height * .71f, size.width * .13f, size.height * .90f, size.width * .02f, size.height * .84f)
    }
    drawPath(tail, color, style = Stroke(size.minDimension * .055f, cap = StrokeCap.Round))
}

private fun DrawScope.drawBell() {
    val color = Color(0xFFFFFAE8)
    val bell = Path().apply {
        moveTo(size.width * .24f, size.height * .67f)
        quadraticTo(size.width * .34f, size.height * .56f, size.width * .35f, size.height * .34f)
        quadraticTo(size.width * .50f, size.height * .13f, size.width * .65f, size.height * .34f)
        quadraticTo(size.width * .66f, size.height * .56f, size.width * .76f, size.height * .67f)
        close()
    }
    drawPath(bell, color)
    drawCircle(color, size.minDimension * .075f, Offset(size.width * .5f, size.height * .75f))
    drawLine(Ink.copy(alpha = .35f), Offset(size.width * .25f, size.height * .68f), Offset(size.width * .75f, size.height * .68f), size.minDimension * .035f, StrokeCap.Round)
}
