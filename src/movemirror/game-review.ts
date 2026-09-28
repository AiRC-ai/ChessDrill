import { Chess, type Move } from "chess.js"

import type { ChessGame, EngineMoveClassification, EnginePhase } from "./types"

export interface ReviewPly {
  ply: number
  number: number
  color: "w" | "b"
  san: string
  uci: string
  beforeFen: string
  afterFen: string
  phase: EnginePhase
  bestMove?: string
  bestSan?: string
  bestLine?: string[]
  replySan?: string
  replyMove?: string
  replyTactic?: "mate" | "capture" | "check"
  evalBefore?: number // White's perspective, in centipawns.
  evalAfter?: number
  loss?: number // The moving side's perspective.
  mateThreat?: boolean
  classification?: EngineMoveClassification
  insight?: string
}

export interface GameReview {
  id: string
  pgn: string
  username: string
  opponent: string
  opening: string
  color: "w" | "b"
  plies: ReviewPly[]
  depth?: number
  checkedPlies?: number
  completedAt?: number
}

function phaseFor(ply: number, fen: string): EnginePhase {
  if (ply < 20) return "Opening"
  const chess = new Chess(fen)
  const nonPawn = chess.board().flat().reduce((total, piece) => {
    if (!piece || piece.type === "p" || piece.type === "k") return total
    return total + ({ n: 3, b: 3, r: 5, q: 9 }[piece.type] ?? 0)
  }, 0)
  return nonPawn <= 13 ? "Endgame" : "Middlegame"
}

export function reviewFromGame(game: ChessGame, username: string): GameReview {
  const chess = new Chess()
  try { chess.loadPgn(game.pgn, { strict: false }) }
  catch { throw new Error("This game does not contain a playable standard-chess PGN.") }
  const history = chess.history({ verbose: true })
  if (!history.length) throw new Error("This PGN has no moves to review.")
  const headers = chess.getHeaders()
  const white = game.white.username || headers.White || "White"
  const black = game.black.username || headers.Black || "Black"
  const color = black.toLowerCase() === username.toLowerCase() ? "b" : "w"
  const opponent = color === "w" ? black : white
  let ecoName = game.eco
  if (ecoName?.startsWith("https://")) {
    try { ecoName = decodeURIComponent(ecoName.split("/").pop() || "").replace(/-/g, " ") }
    catch { ecoName = "Your game" }
  }
  const opening = headers.Opening || ecoName || "Your game"
  return {
    id: game.url || `pgn:${pgnId(game.pgn)}`,
    pgn: game.pgn,
    username,
    opponent,
    color,
    opening,
    plies: history.map((move: Move, index: number) => ({
      ply: index + 1,
      number: Math.floor(index / 2) + 1,
      color: move.color,
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion || ""}`,
      beforeFen: move.before,
      afterFen: move.after,
      phase: phaseFor(index, move.before),
    })),
  }
}

export function pgnId(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function reviewFromPgn(pgn: string, color: "w" | "b"): GameReview {
  if (pgn.length > 200_000) throw new Error("This PGN is too large. Paste one game at a time.")
  const chess = new Chess()
  try { chess.loadPgn(pgn, { strict: false }) }
  catch { throw new Error("The PGN could not be parsed. Paste a complete standard chess game.") }
  const headers = chess.getHeaders()
  const username = (color === "w" ? headers.White : headers.Black) || "You"
  const opponent = (color === "w" ? headers.Black : headers.White) || "Opponent"
  const game: ChessGame = {
    url: `pgn:${pgnId(pgn)}`,
    pgn,
    end_time: 0,
    time_control: "-",
    time_class: "rapid",
    rules: "chess",
    white: { username: color === "w" ? username : opponent, rating: 0, result: "unknown" },
    black: { username: color === "b" ? username : opponent, rating: 0, result: "unknown" },
    eco: headers.Opening,
  }
  const review = reviewFromGame(game, username)
  // A PGN can use identical or missing player names. The selected side is authoritative.
  review.color = color
  review.username = username
  review.opponent = opponent
  return review
}

export function uciLineToSan(fen: string, line: string[], limit = 6) {
  const chess = new Chess(fen)
  const san: string[] = []
  for (const uci of line.slice(0, limit)) {
    try {
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4),
        ...(uci.length > 4 ? { promotion: uci.slice(4, 5) } : {}) })
      san.push(move.san)
    } catch { break }
  }
  return san
}

export function moveInsight(ply: ReviewPly) {
  const loss = ply.loss ?? 0
  const best = ply.bestSan || "the engine's choice"
  const line = ply.bestLine?.length ? ` A sample continuation is ${ply.bestLine.join(" ")}.` : ""
  if (ply.classification === "Best") return `${ply.san} matched the engine's top choice at this depth.${line}`
  if (ply.classification === "Good") return `${ply.san} kept the evaluation close to ${best}. Look at both plans before choosing.${line}`
  const shift = `${(loss / 100).toFixed(1)} pawns`
  const reply = ply.replySan && ply.replyTactic
    ? ` The strongest reply is ${ply.replySan}, ${ply.replyTactic === "mate" ? "which ends the game" : ply.replyTactic === "capture" ? "a capture" : "a check"}.`
    : ""
  if (ply.classification === "Inaccuracy") return `${ply.san} gave up about ${shift} of evaluation. Compare it with ${best}.${line}`
  if (ply.mateThreat) return `${ply.san} allowed a forced mate at this search depth. ${best} avoided it.${reply}${line}`
  if (ply.classification === "Mistake" || ply.classification === "Blunder") {
    const edge = ply.evalBefore !== undefined && ply.evalAfter !== undefined
      && (ply.color === "w" ? ply.evalBefore >= 200 && ply.evalAfter < 80 : ply.evalBefore <= -200 && ply.evalAfter > -80)
      ? " It also gave up a substantial advantage." : ""
    return `${ply.san} lost about ${shift} at this search depth. ${best} was stronger.${edge}${reply}${line}`
  }
  return "Run the engine to see a move insight."
}

export function reviewSummary(review: GameReview) {
  const checked = review.plies.filter(ply => ply.classification && ply.color === review.color)
  const errors = checked.filter(ply => (ply.loss ?? 0) >= 60)
  const numeric = checked.filter(ply => !ply.mateThreat)
  const sorted = [...errors].sort((a, b) => (b.loss ?? 0) - (a.loss ?? 0))
  const phases = (["Opening", "Middlegame", "Endgame"] as EnginePhase[]).map(phase => ({
    phase,
    checked: checked.filter(ply => ply.phase === phase).length,
    errors: errors.filter(ply => ply.phase === phase).length,
  }))
  return {
    checked: checked.length,
    inaccuracies: checked.filter(ply => ply.classification === "Inaccuracy").length,
    mistakes: checked.filter(ply => ply.classification === "Mistake").length,
    blunders: checked.filter(ply => ply.classification === "Blunder").length,
    mateThreats: checked.filter(ply => ply.mateThreat).length,
    averageLoss: numeric.length ? Math.round(numeric.reduce((sum, ply) => sum + (ply.loss ?? 0), 0) / numeric.length) : null,
    turningPoints: sorted.slice(0, 5),
    phases,
  }
}
