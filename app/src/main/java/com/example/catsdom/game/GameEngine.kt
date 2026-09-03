package com.example.catsdom.game

import kotlin.math.abs
import kotlin.random.Random

const val BOARD_SIZE = 8
const val STARTING_MOVES = 25

enum class TileType {
    CAT,
    PAW,
    FISH,
    YARN,
    MOUSE,
    BELL,
}

data class Position(val row: Int, val column: Int)

data class GameState(
    val board: List<List<TileType?>>,
    val score: Int = 0,
    val movesLeft: Int = STARTING_MOVES,
)

data class MoveResult(
    val accepted: Boolean,
    val frames: List<GameState>,
    val removedTiles: Int = 0,
) {
    val finalState: GameState get() = frames.last()
}

/** Pure puzzle rules. Keeping these outside Compose makes the board easy to test. */
class GameEngine(private val random: Random = Random.Default) {

    fun newGame(): GameState {
        repeat(200) {
            val board = createBoardWithoutMatches()
            if (hasPossibleMove(board)) return GameState(board = board)
        }

        // The fallback is extraordinarily unlikely, but still returns a valid board.
        return GameState(board = createBoardWithoutMatches())
    }

    fun trySwap(state: GameState, first: Position, second: Position): MoveResult {
        if (state.movesLeft <= 0 || !isInside(state.board, first) || !isInside(state.board, second)) {
            return MoveResult(false, listOf(state))
        }
        if (abs(first.row - second.row) + abs(first.column - second.column) != 1) {
            return MoveResult(false, listOf(state))
        }

        val board = mutableBoard(state.board)
        swap(board, first, second)
        var matches = findMatchesMutable(board)
        if (matches.isEmpty()) return MoveResult(false, listOf(state))

        val movesLeft = state.movesLeft - 1
        var score = state.score
        var combo = 0
        var removedTiles = 0
        val frames = mutableListOf(
            state.copy(board = immutableBoard(board), movesLeft = movesLeft),
        )

        // Each clear and refill is exposed as a frame so the UI can show the cascade.
        while (matches.isNotEmpty() && combo < 100) {
            combo += 1
            removedTiles += matches.size
            score += matches.size * 10 * combo

            matches.forEach { board[it.row][it.column] = null }
            frames += GameState(immutableBoard(board), score, movesLeft)

            collapseAndRefill(board)
            frames += GameState(immutableBoard(board), score, movesLeft)
            matches = findMatchesMutable(board)
        }

        if (!hasPossibleMove(board)) {
            frames += GameState(createBoardWithoutMatches(), score, movesLeft)
        }

        return MoveResult(true, frames, removedTiles)
    }

    fun findMatches(board: List<List<TileType?>>): Set<Position> =
        findMatchesMutable(board.map { it.toMutableList() }.toMutableList())

    fun hasPossibleMove(board: List<List<TileType?>>): Boolean {
        val mutable = mutableBoard(board)
        for (row in mutable.indices) {
            for (column in mutable[row].indices) {
                val current = Position(row, column)
                val neighbours = listOf(Position(row, column + 1), Position(row + 1, column))
                for (neighbour in neighbours) {
                    if (!isInside(board, neighbour)) continue
                    swap(mutable, current, neighbour)
                    val createsMatch = findMatchesMutable(mutable).isNotEmpty()
                    swap(mutable, current, neighbour)
                    if (createsMatch) return true
                }
            }
        }
        return false
    }

    private fun createBoardWithoutMatches(): List<List<TileType?>> {
        val board = MutableList(BOARD_SIZE) { MutableList<TileType?>(BOARD_SIZE) { null } }
        for (row in 0 until BOARD_SIZE) {
            for (column in 0 until BOARD_SIZE) {
                val candidates = TileType.entries.filter { tile ->
                    val horizontalMatch = column >= 2 &&
                        board[row][column - 1] == tile && board[row][column - 2] == tile
                    val verticalMatch = row >= 2 &&
                        board[row - 1][column] == tile && board[row - 2][column] == tile
                    !horizontalMatch && !verticalMatch
                }
                board[row][column] = candidates[random.nextInt(candidates.size)]
            }
        }
        return immutableBoard(board)
    }

    private fun findMatchesMutable(board: MutableList<MutableList<TileType?>>): Set<Position> {
        val matches = mutableSetOf<Position>()
        val rows = board.size
        val columns = board.firstOrNull()?.size ?: 0

        for (row in 0 until rows) {
            var start = 0
            while (start < columns) {
                val tile = board[row][start]
                var end = start + 1
                while (end < columns && tile != null && board[row][end] == tile) end++
                if (tile != null && end - start >= 3) {
                    for (column in start until end) matches += Position(row, column)
                }
                start = end
            }
        }

        for (column in 0 until columns) {
            var start = 0
            while (start < rows) {
                val tile = board[start][column]
                var end = start + 1
                while (end < rows && tile != null && board[end][column] == tile) end++
                if (tile != null && end - start >= 3) {
                    for (row in start until end) matches += Position(row, column)
                }
                start = end
            }
        }
        return matches
    }

    private fun collapseAndRefill(board: MutableList<MutableList<TileType?>>) {
        val rows = board.size
        val columns = board.firstOrNull()?.size ?: 0
        for (column in 0 until columns) {
            var destinationRow = rows - 1
            for (row in rows - 1 downTo 0) {
                val tile = board[row][column]
                if (tile != null) {
                    board[destinationRow][column] = tile
                    if (destinationRow != row) board[row][column] = null
                    destinationRow--
                }
            }
            while (destinationRow >= 0) {
                board[destinationRow][column] = TileType.entries[random.nextInt(TileType.entries.size)]
                destinationRow--
            }
        }
    }

    private fun swap(
        board: MutableList<MutableList<TileType?>>,
        first: Position,
        second: Position,
    ) {
        val temporary = board[first.row][first.column]
        board[first.row][first.column] = board[second.row][second.column]
        board[second.row][second.column] = temporary
    }

    private fun isInside(board: List<List<TileType?>>, position: Position): Boolean =
        position.row in board.indices && position.column >= 0 &&
            board.firstOrNull()?.let { position.column < it.size } == true

    private fun mutableBoard(board: List<List<TileType?>>): MutableList<MutableList<TileType?>> =
        board.map { it.toMutableList() }.toMutableList()

    private fun immutableBoard(board: List<List<TileType?>>): List<List<TileType?>> =
        board.map { it.toList() }
}
