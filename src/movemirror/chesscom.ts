import type {
  ChessGame,
  FetchGamesResult,
  FetchProgress,
  GameFilter,
  PlayerProfile,
} from "./types"

const API_ROOT = "https://api.chess.com/pub"
const MAX_ARCHIVES_TO_SCAN = 120

interface ArchiveIndex {
  archives: string[]
}

interface GameArchive {
  games: ChessGame[]
}

export class ChessComApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = "ChessComApiError"
    this.status = status
  }
}

function abortError() {
  return new DOMException("The analysis was cancelled.", "AbortError")
}

function wait(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }

    const timeout = globalThis.setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve() }, milliseconds)
    const onAbort = () => { globalThis.clearTimeout(timeout); reject(abortError()) }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

export function validChessComApiUrl(value: string, username?: string) {
  try {
    const url = new URL(value)
    const match = url.pathname.match(/^\/pub\/player\/([a-z0-9_-]{2,30})(?:\/games\/(?:archives|\d{4}\/(?:0[1-9]|1[0-2])))?$/)
    return url.protocol === "https:" && url.hostname === "api.chess.com" &&
      !url.port && !url.username && !url.password && !url.search && !url.hash &&
      !!match && (!username || match[1] === username.toLowerCase())
  } catch { return false }
}

// Chess.com's JSONP fallback runs in an opaque-origin sandbox. Its scripts must
// never execute in the app document, which contains the user's study data.
function jsonp<T>(url: string, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      reject(new ChessComApiError("The Chess.com API is unavailable here."))
      return
    }

    if (signal?.aborted) {
      reject(abortError())
      return
    }

    if (!validChessComApiUrl(url)) {
      reject(new ChessComApiError("Chess.com returned an invalid archive address."))
      return
    }
    const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("")
    const frame = document.createElement("iframe")
    frame.sandbox.add("allow-scripts")
    frame.referrerPolicy = "no-referrer"
    frame.hidden = true
    frame.title = "Chess.com data bridge"
    let settled = false
    const timeout = globalThis.setTimeout(() => finish(() => reject(new ChessComApiError("Chess.com took too long to respond."))), 20000)
    const cleanUp = () => {
      globalThis.clearTimeout(timeout)
      frame.onload = null
      frame.onerror = null
      frame.remove()
      window.removeEventListener("message", onMessage)
      signal?.removeEventListener("abort", onAbort)
    }

    const finish = (action: () => void) => {
      if (settled) return
      settled = true
      cleanUp()
      action()
    }

    const onAbort = () => finish(() => reject(abortError()))
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.origin !== "null" || event.data?.token !== token) return
      if (!event.data.ok) {
        finish(() => reject(new ChessComApiError("Chess.com did not return data. Try again shortly.")))
        return
      }
      const payload = event.data.payload as T & { message?: string }
      if (payload?.message && !("games" in (payload as object))) {
        finish(() => reject(new ChessComApiError(payload.message)))
        return
      }
      finish(() => resolve(payload))
    }
    frame.onload = () => frame.contentWindow?.postMessage({ token, url }, "*")
    frame.onerror = () => finish(() => reject(new ChessComApiError("Unable to load the Chess.com data bridge.")))
    signal?.addEventListener("abort", onAbort, { once: true })
    window.addEventListener("message", onMessage)
    frame.src = `${import.meta.env.BASE_URL}chesscom-bridge.html`
    document.body.appendChild(frame)
  })
}

async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  if (!validChessComApiUrl(url)) throw new ChessComApiError("Chess.com returned an invalid archive address.")
  let fetchFailure: unknown
  const headers: Record<string, string> = { Accept: "application/json" }
  if (typeof window === "undefined") {
    headers["User-Agent"] = "MoveMirror/1.0 (+https://chess.leglord.com)"
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const timeoutController = new AbortController()
    const timeout = globalThis.setTimeout(() => timeoutController.abort(), 12000)
    const onAbort = () => timeoutController.abort()
    signal?.addEventListener("abort", onAbort, { once: true })
    try {
      const response = await fetch(url, {
        headers,
        signal: timeoutController.signal,
      })

      if (response.status === 429 && attempt < 2) {
        await wait(900 * (attempt + 1), signal)
        continue
      }

      if (!response.ok) {
        if (response.status === 404 || response.status === 410) {
          throw new ChessComApiError(
            "That Chess.com username could not be found.",
            response.status,
          )
        }
        if (response.status === 429) {
          throw new ChessComApiError(
            "Chess.com is rate-limiting requests. Wait a moment and try again.",
            429,
          )
        }
        throw new ChessComApiError(
          `Chess.com returned an error (${response.status}).`,
          response.status,
        )
      }

      return (await response.json()) as T
    } catch (error) {
      if (error instanceof ChessComApiError || signal?.aborted) throw error
      fetchFailure = error
      break
    } finally {
      globalThis.clearTimeout(timeout)
      signal?.removeEventListener("abort", onAbort)
    }
  }

  try {
    return await jsonp<T>(url, signal)
  } catch (jsonpFailure) {
    if (signal?.aborted) throw abortError()
    if (jsonpFailure instanceof ChessComApiError) throw jsonpFailure
    throw new ChessComApiError(
      fetchFailure instanceof Error
        ? fetchFailure.message
        : "Unable to reach Chess.com right now.",
    )
  }
}

export function normalizeUsername(input: string) {
  const trimmed = input.trim()
  const fromUrl = trimmed.match(/chess\.com\/(?:member|player)\/([^/?#]+)/i)?.[1]
  try { return decodeURIComponent(fromUrl ?? trimmed).replace(/^@/, "").trim() }
  catch { return trimmed }
}

export function validateUsername(username: string) {
  return /^[a-zA-Z0-9_-]{2,30}$/.test(username)
}

export async function fetchRecentGames({
  username,
  count,
  filter,
  signal,
  onProgress,
}: {
  username: string
  count: number
  filter: GameFilter
  signal?: AbortSignal
  onProgress?: (progress: FetchProgress) => void
}): Promise<FetchGamesResult> {
  const encodedUsername = encodeURIComponent(username.toLowerCase())

  onProgress?.({
    stage: "profile",
    label: "Finding the player profile…",
    percent: 6,
  })
  const profileResponse = await requestJson<Omit<PlayerProfile, "platform">>(
    `${API_ROOT}/player/${encodedUsername}`,
    signal,
  )
  if (!profileResponse || typeof profileResponse.username !== "string") {
    throw new ChessComApiError("Chess.com returned an incomplete profile. Try again later.")
  }
  const profile: PlayerProfile = { ...profileResponse, platform: "chesscom" }

  onProgress?.({
    stage: "archives",
    label: "Checking available game archives…",
    percent: 14,
  })
  const archiveIndex = await requestJson<ArchiveIndex>(
    `${API_ROOT}/player/${encodedUsername}/games/archives`,
    signal,
  )
  if (!archiveIndex || !Array.isArray(archiveIndex.archives)) {
    throw new ChessComApiError("Chess.com returned an incomplete game archive. Try again later.")
  }

  const archiveUrls = [...(Array.isArray(archiveIndex.archives) ? archiveIndex.archives : [])]
    .reverse()
    .slice(0, MAX_ARCHIVES_TO_SCAN)
  const matchingGames: ChessGame[] = []
  let monthsScanned = 0

  for (const archiveUrl of archiveUrls) {
    if (signal?.aborted) throw abortError()
    if (typeof archiveUrl !== "string" || !validChessComApiUrl(archiveUrl, username) ||
        !/^\/pub\/player\/[a-z0-9_-]+\/games\/\d{4}\/(?:0[1-9]|1[0-2])$/.test(new URL(archiveUrl).pathname)) {
      throw new ChessComApiError("Chess.com returned an invalid archive address.")
    }

    onProgress?.({
      stage: "games",
      label: `Loading recent games · ${matchingGames.length}/${count} found`,
      percent: Math.min(68, 18 + Math.round((matchingGames.length / count) * 50)),
    })

    const archive = await requestJson<GameArchive>(archiveUrl, signal)
    monthsScanned += 1

    const games = (Array.isArray(archive.games) ? archive.games : []).filter(
      (game) =>
        !!game &&
        game.rules === "chess" &&
        Boolean(game.pgn) &&
        Boolean(game.white?.username) &&
        Boolean(game.black?.username) &&
        (filter === "all" || game.time_class === filter),
    )
    matchingGames.push(...games)

    if (matchingGames.length >= count) break
  }

  const games = matchingGames
    .sort((a, b) => b.end_time - a.end_time)
    .slice(0, count)

  if (games.length === 0) {
    const filterLabel = filter === "all" ? "standard" : filter
    throw new ChessComApiError(
      `No completed ${filterLabel} chess games were found for this player.`,
    )
  }

  return {
    profile,
    games,
    sourcesScanned: monthsScanned,
  }
}
