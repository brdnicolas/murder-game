"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";

interface Player {
  id: string;
  name: string;
  isAdmin: boolean;
  alive: boolean;
  role?: string;
}

interface GameState {
  players: Player[];
  config: { murderers: number; innocents: number; vigilantes: number; timer: number };
  started: boolean;
  rolesRevealed: boolean;
  playerCount: number;
  endTime: number | null;
  winner: string | null;
  lobbyCode: string;
  lobbyName: string;
}

interface RoleInfo {
  role: string;
  partners: string[];
}

interface LobbyInfo {
  code: string;
  name: string;
  playerCount: number;
  started: boolean;
}

const ROLE_META: Record<string, { icon: string; description: string; color: string }> = {
  meurtrier: {
    icon: "\uD83D\uDD2A",
    description: "Tu es un meurtrier. Élimine les autres sans te faire repérer.",
    color: "var(--red)",
  },
  innocent: {
    icon: "\uD83D\uDE07",
    description: "Tu es innocent. Survis et trouve les meurtriers.",
    color: "var(--green)",
  },
  justicier: {
    icon: "\uD83D\uDEE1\uFE0F",
    description: "Tu es le justicier. Protège les innocents et démasque les meurtriers.",
    color: "var(--gold)",
  },
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function Home() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [name, setName] = useState("");
  const [lobbyCode, setLobbyCode] = useState<string | null>(null);
  const [lobbyList, setLobbyList] = useState<LobbyInfo[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [roleInfo, setRoleInfo] = useState<RoleInfo | null>(null);
  const [error, setError] = useState("");
  const [isDead, setIsDead] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [deathFlash, setDeathFlash] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadCountRef = useRef(0);

  useEffect(() => {
    const s = io();
    setSocket(s);

    s.on("lobbyList", (list: LobbyInfo[]) => {
      setLobbyList(list);
    });

    s.on("joinedLobby", ({ code, isAdmin }: { code: string; isAdmin: boolean }) => {
      setLobbyCode(code);
      setIsAdmin(isAdmin);
    });

    s.on("gameState", (state: GameState) => {
      setGameState(state);
      if (state.endTime && state.started && !state.winner) {
        const remaining = Math.max(0, Math.ceil((state.endTime - Date.now()) / 1000));
        setTimeLeft(remaining);
      } else if (state.winner) {
        setTimeLeft(0);
      }
    });

    s.on("roleAssigned", (info: RoleInfo) => {
      setRoleInfo(info);
    });

    s.on("gameRestarted", () => {
      setRoleInfo(null);
      setIsDead(false);
      setTimeLeft(null);
      setDeathFlash(false);
      deadCountRef.current = 0;
    });

    s.on("gameStarted", () => {});
    s.on("gameOver", () => {});

    s.on("promoted", () => {
      setIsAdmin(true);
    });

    s.on("error", (msg: string) => {
      setError(msg);
      setTimeout(() => setError(""), 4000);
    });

    return () => {
      s.disconnect();
    };
  }, []);

  // Death sound detection
  useEffect(() => {
    if (!gameState?.started || gameState.winner) return;
    const currentDeadCount = gameState.players.filter((p) => !p.alive).length;
    if (currentDeadCount > deadCountRef.current) {
      const audio = new Audio("/death.mp3");
      audio.play().catch(() => {});
      setDeathFlash(true);
      setTimeout(() => setDeathFlash(false), 2000);
    }
    deadCountRef.current = currentDeadCount;
  }, [gameState?.players, gameState?.started, gameState?.winner]);

  // Client-side countdown
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (gameState?.started && gameState.endTime && !gameState.winner) {
      timerRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((gameState.endTime! - Date.now()) / 1000));
        setTimeLeft(remaining);
        if (remaining <= 0 && timerRef.current) {
          clearInterval(timerRef.current);
        }
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState?.started, gameState?.endTime, gameState?.winner]);

  const updateConfig = useCallback(
    (key: string, delta: number) => {
      if (!socket || !gameState) return;
      const newConfig = {
        ...gameState.config,
        [key]: key === "timer"
          ? Math.min(60, Math.max(1, gameState.config.timer + delta))
          : Math.max(0, gameState.config[key as keyof typeof gameState.config] + delta),
      };
      socket.emit("updateConfig", newConfig);
    },
    [socket, gameState]
  );

  // --- HOME SCREEN (no lobby joined) ---
  if (!lobbyCode) {
    const availableLobbies = lobbyList.filter((l) => !l.started);

    return (
      <div className="container fade-in">
        <h1>Murder Game</h1>
        <p className="subtitle">Meurtrier &middot; Innocent &middot; Justicier</p>

        {error && <div className="error">{error}</div>}

        <div className="card">
          <h2>Ton prénom</h2>
          <input
            type="text"
            placeholder="Ton prénom..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <button
          className="btn-primary"
          disabled={!name.trim()}
          onClick={() => {
            if (name.trim() && socket) {
              socket.emit("createLobby", { playerName: name.trim(), lobbyName: "" });
            }
          }}
        >
          Créer un lobby
        </button>

        {availableLobbies.length > 0 && (
          <div className="card lobby-list-card">
            <h2>Lobbies disponibles</h2>
            <ul className="lobby-list">
              {availableLobbies.map((l) => (
                <li key={l.code} className="lobby-item">
                  <div className="lobby-item-info">
                    <span className="lobby-item-name">{l.name}</span>
                    <span className="lobby-item-players">{l.playerCount} joueur{l.playerCount > 1 ? "s" : ""}</span>
                  </div>
                  <button
                    className="btn-join"
                    disabled={!name.trim()}
                    onClick={() => {
                      if (name.trim() && socket) {
                        socket.emit("joinLobby", { code: l.code, playerName: name.trim() });
                      }
                    }}
                  >
                    Rejoindre
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // --- VICTORY SCREEN ---
  if (gameState?.winner) {
    const isMurdererWin = gameState.winner === "meurtriers";
    return (
      <div className="container fade-in">
        <div className="card victory-screen">
          <div className="victory-icon">{isMurdererWin ? "\uD83D\uDD2A" : "\uD83C\uDF89"}</div>
          <div className={`victory-title ${isMurdererWin ? "meurtrier" : "innocent"}`}>
            {isMurdererWin ? "Les meurtriers ont gagné !" : "Les innocents ont survécu !"}
          </div>
          <p className="victory-subtitle">
            {isMurdererWin
              ? "Tous les innocents et justiciers ont été éliminés."
              : "Le temps est écoulé, les meurtriers n'ont pas réussi."}
          </p>
        </div>

        <div className="card">
          <h2>Résultats</h2>
          <ul className="player-list">
            {gameState.players.map((p) => {
              const meta = p.role ? ROLE_META[p.role] : null;
              return (
                <li key={p.id} className={`player-item ${!p.alive ? "player-dead" : ""}`}>
                  <div className="player-avatar" style={meta ? { background: meta.color } : undefined}>
                    {meta ? meta.icon : p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="player-result-info">
                    <span className="player-result-name">{p.name}</span>
                    <span className="player-result-role" style={meta ? { color: meta.color } : undefined}>
                      {p.role || "inconnu"}
                    </span>
                  </div>
                  {!p.alive && <span className="dead-badge">Mort</span>}
                </li>
              );
            })}
          </ul>
        </div>

        {isAdmin && (
          <button
            className="btn-primary"
            onClick={() => socket?.emit("restartGame")}
          >
            Nouvelle partie
          </button>
        )}
      </div>
    );
  }

  // --- IN-GAME SCREEN ---
  if (roleInfo && gameState?.started) {
    const meta = ROLE_META[roleInfo.role];

    return (
      <div className={`container fade-in ${deathFlash ? "death-flash" : ""}`}>
        <div className="ingame-header">
          <span className="ingame-role-hint" title={roleInfo.role}>{meta.icon}</span>
          {timeLeft !== null && (
            <div className={`timer ${timeLeft <= 60 ? "urgent" : ""}`}>
              {formatTime(timeLeft)}
            </div>
          )}
        </div>

        {deathFlash && (
          <div className="death-alert">Quelqu&#39;un est mort...</div>
        )}

        {isDead ? (
          <div className="dead-message">Tu es mort...</div>
        ) : (
          <button
            className="btn-dead"
            onClick={() => {
              socket?.emit("declareDead");
              setIsDead(true);
            }}
          >
            Je suis mort
          </button>
        )}
      </div>
    );
  }

  // --- ROLE REVEAL SCREEN ---
  if (roleInfo && gameState?.rolesRevealed && !gameState.started) {
    const meta = ROLE_META[roleInfo.role];
    return (
      <div className="container fade-in">
        <div className="card role-reveal">
          <div className="role-icon">{meta.icon}</div>
          <div className={`role-name ${roleInfo.role}`}>{roleInfo.role}</div>
          <p className="role-description">{meta.description}</p>
          {roleInfo.partners.length > 0 && (
            <div className="partners">
              <h3>Tes complices</h3>
              <ul>
                {roleInfo.partners.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {isAdmin ? (
          <button
            className="btn-primary"
            onClick={() => socket?.emit("startGame")}
          >
            Lancer la partie
          </button>
        ) : (
          <p className="subtitle">En attente du lancement...</p>
        )}
      </div>
    );
  }

  // --- LOBBY SCREEN ---
  const config = gameState?.config || { murderers: 1, innocents: 3, vigilantes: 1, timer: 5 };
  const total = config.murderers + config.innocents + config.vigilantes;
  const playerCount = gameState?.playerCount || 0;
  const isValid = total === playerCount && playerCount > 0;

  return (
    <div className="container fade-in">
      <h1>Murder Game</h1>
      <div className="lobby-code-display">
        <span className="lobby-code-label">Code du lobby</span>
        <span className="lobby-code-value">{lobbyCode}</span>
      </div>
      <p className="subtitle">
        {isAdmin ? "Tu es l'admin" : "En attente du lancement..."}
      </p>

      {error && <div className="error">{error}</div>}

      <div className="card">
        <h2>Joueurs ({playerCount})</h2>
        <ul className="player-list">
          {gameState?.players.map((p) => (
            <li key={p.id} className="player-item">
              <div className="player-avatar">
                {p.name.charAt(0).toUpperCase()}
              </div>
              {p.name}
              {p.isAdmin && <span className="admin-badge">Admin</span>}
            </li>
          ))}
        </ul>
      </div>

      <button
        className={`btn-test-audio ${audioPlaying ? "playing" : ""}`}
        disabled={audioPlaying}
        onClick={() => {
          const a = new Audio("/death.mp3");
          setAudioPlaying(true);
          a.play().catch(() => {});
          a.onended = () => setAudioPlaying(false);
        }}
      >
        {audioPlaying ? "Son en cours..." : "Tester l'audio"}
      </button>

      {isAdmin && (
        <>
          <div className="card">
            <h2>Configuration</h2>
            {(
              [
                ["murderers", "Meurtriers", "\uD83D\uDD2A"],
                ["innocents", "Innocents", "\uD83D\uDE07"],
                ["vigilantes", "Justiciers", "\uD83D\uDEE1\uFE0F"],
              ] as const
            ).map(([key, label, icon]) => (
              <div className="config-row" key={key}>
                <span className="config-label">
                  {icon} {label}
                </span>
                <div className="config-controls">
                  <button
                    className="btn-secondary"
                    onClick={() => updateConfig(key, -1)}
                  >
                    &minus;
                  </button>
                  <span>{config[key]}</span>
                  <button
                    className="btn-secondary"
                    onClick={() => updateConfig(key, 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
            <div className={`config-total ${isValid ? "valid" : "invalid"}`}>
              {total} rôles / {playerCount} joueurs
              {isValid ? " \u2714" : " \u2716"}
            </div>

            <div className="config-row config-timer">
              <span className="config-label">
                {"⏱️"} Timer
              </span>
              <div className="config-controls">
                <button
                  className="btn-secondary"
                  onClick={() => updateConfig("timer", -1)}
                >
                  &minus;
                </button>
                <span>{config.timer} min</span>
                <button
                  className="btn-secondary"
                  onClick={() => updateConfig("timer", 1)}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <button
            className="btn-primary"
            disabled={!isValid}
            onClick={() => socket?.emit("revealRoles")}
          >
            Révéler les rôles
          </button>
        </>
      )}
    </div>
  );
}
