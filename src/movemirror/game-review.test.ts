import { afterEach, expect, it } from "vitest"

import { moveInsight, reviewFromGame, reviewFromPgn, reviewSummary, uciLineToSan } from "./game-review"
import { analyzeFullGame } from "./stockfish"

const pgn = `[Event "Fool's mate"]
[White "Me"]
[Black "Opponent"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1`

const game = {
  url: "https://www.chess.com/game/live/123",
  pgn,
  end_time: 1,
  time_control: "600",
  time_class: "rapid" as const,
  rules: "chess",
  white: {username:"Me",rating:1200,result:"checkmated"},
  black: {username:"Opponent",rating:1300,result:"win"},
}

const previousWindow = globalThis.window
const previousWorker = globalThis.Worker
afterEach(() => {
  if (previousWindow === undefined) delete (globalThis as { window?: Window }).window
  else globalThis.window = previousWindow
  if (previousWorker === undefined) delete (globalThis as { Worker?: typeof Worker }).Worker
  else globalThis.Worker = previousWorker
})

it("replays PGNs from either perspective and preserves each position", () => {
  const white = reviewFromGame(game,"Me")
  const black = reviewFromPgn(pgn,"b")
  expect(white.plies).toHaveLength(4)
  expect(black.color).toBe("b")
  expect(black.opponent).toBe("Me")
  expect(white.plies[0].beforeFen).toContain(" w KQkq ")
  expect(white.plies[3].san).toBe("Qh4#")
  expect(uciLineToSan(white.plies[0].beforeFen,["e2e4","e7e5"])).toEqual(["e4","e5"])
})

it("scores adjacent positions from the moving side and handles terminal mate", async () => {
  const scores = [50,100,-80,400]
  const moves = ["e2e4","e7e5","g2g3","d8h4"]
  let searches = 0
  let terminated = false
  class FakeWorker {
    private listeners: Array<(event: {data:string})=>void> = []
    addEventListener(_name:string, callback:(event:{data:string})=>void) { this.listeners.push(callback) }
    emit(line:string) { for(const listener of this.listeners) listener({data:line}) }
    postMessage(command:string) {
      if (command === "uci") queueMicrotask(()=>this.emit("uciok"))
      if (command === "isready") queueMicrotask(()=>this.emit("readyok"))
      if (command.startsWith("go depth")) {
        const index = searches++
        queueMicrotask(() => {
          this.emit(`info depth 8 score cp ${scores[index]} pv ${moves[index]}`)
          this.emit(`bestmove ${moves[index]}`)
        })
      }
    }
    terminate() { terminated = true }
  }
  globalThis.window = globalThis as unknown as Window & typeof globalThis
  globalThis.Worker = FakeWorker as unknown as typeof Worker
  const result = await analyzeFullGame(reviewFromGame(game,"Me"),{depth:8})
  expect(searches).toBe(4) // The final checkmate is scored without an extra search.
  expect(terminated).toBe(true)
  expect(result.plies[0]).toMatchObject({loss:150,classification:"Mistake",evalBefore:50,evalAfter:-100,bestSan:"e4"})
  expect(result.plies[2]).toMatchObject({loss:320,classification:"Blunder",evalAfter:-400})
  expect(result.plies[3]).toMatchObject({loss:0,classification:"Best",evalAfter:-100000})
  expect(reviewSummary(result)).toMatchObject({checked:2,mistakes:1,blunders:1})
})

it("labels a forced mate without presenting a capped mate score as ordinary pawn loss", () => {
  const review = reviewFromGame(game,"Me")
  review.plies[2] = {...review.plies[2], loss:2000,mateThreat:true,
    classification:"Blunder",bestSan:"e4",bestLine:["e4","Nf6"],replySan:"Qh4#",replyTactic:"mate"}
  expect(moveInsight(review.plies[2])).toContain("allowed a forced mate")
  expect(moveInsight(review.plies[2])).not.toContain("20.0 pawns")
  const summary = reviewSummary(review)
  expect(summary.mateThreats).toBe(1)
  expect(summary.averageLoss).toBe(null)
})
