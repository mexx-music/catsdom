package com.example.catsdom.game

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

class GameEngineTest {
    private val engine = GameEngine(Random(7))

    @Test
    fun newGameCreatesCleanPlayableEightByEightBoard() {
        repeat(30) {
            val state = engine.newGame()

            assertEquals(8, state.board.size)
            assertTrue(state.board.all { it.size == 8 })
            assertEquals(6, state.board.flatten().filterNotNull().distinct().size)
            assertTrue(engine.findMatches(state.board).isEmpty())
            assertTrue(engine.hasPossibleMove(state.board))
            assertEquals(25, state.movesLeft)
            assertEquals(0, state.score)
        }
    }

    @Test
    fun adjacentSwapThatBuildsThreeConsumesMoveAndScores() {
        val board = cleanPattern().map { it.toMutableList() }.toMutableList()
        board[0][0] = TileType.CAT
        board[0][1] = TileType.PAW
        board[0][2] = TileType.CAT
        board[1][1] = TileType.CAT
        val state = GameState(board.map { it.toList() })

        assertTrue(engine.findMatches(state.board).isEmpty())
        val result = engine.trySwap(state, Position(0, 1), Position(1, 1))

        assertTrue(result.accepted)
        assertEquals(24, result.finalState.movesLeft)
        assertTrue(result.finalState.score >= 30)
        assertTrue(result.removedTiles >= 3)
        assertTrue(engine.findMatches(result.finalState.board).isEmpty())
    }

    @Test
    fun nonAdjacentAndUnproductiveSwapsAreRejectedWithoutCost() {
        val state = GameState(cleanPattern())

        val farSwap = engine.trySwap(state, Position(0, 0), Position(3, 3))
        val unproductiveSwap = engine.trySwap(state, Position(6, 6), Position(6, 7))

        assertFalse(farSwap.accepted)
        assertFalse(unproductiveSwap.accepted)
        assertEquals(state, farSwap.finalState)
        assertEquals(state, unproductiveSwap.finalState)
    }

    @Test
    fun overlappingHorizontalAndVerticalMatchesCountEachTileOnce() {
        val board = cleanPattern().map { it.toMutableList() }.toMutableList()
        board[3][2] = TileType.BELL
        board[3][3] = TileType.BELL
        board[3][4] = TileType.BELL
        board[2][3] = TileType.BELL
        board[4][3] = TileType.BELL

        val matches = engine.findMatches(board)

        assertEquals(5, matches.size)
        assertTrue(Position(3, 3) in matches)
    }

    private fun cleanPattern(): List<List<TileType?>> =
        List(8) { row ->
            List(8) { column -> TileType.entries[(row + column) % TileType.entries.size] }
        }
}
