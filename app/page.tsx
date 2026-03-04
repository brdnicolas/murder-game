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
}

interface RoleInfo {
  role: string;
  partners: string[];
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
  const [joined, setJoined] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [roleInfo, setRoleInfo] = useState<RoleInfo | null>(null);
  const [error, setError] = useState("");
  const [isDead, setIsDead] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const s = io();
    setSocket(s);

    s.on("joined", ({ isAdmin }: { isAdmin: boolean }) => {
      setJoined(true);
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
    });

    s.on("gameStarted", () => {
      // gameState update handles the rest
    });

    s.on("gameOver", () => {
      // gameState update carries the winner
    });

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

  const handleJoin = useCallback(() => {
    if (name.trim() && socket) {
      socket.emit("join", name.trim());
    }
  }, [name, socket]);

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

  // --- JOIN SCREEN ---
  if (!joined) {
    return (
      <div className="container fade-in">
        <h1>Murder Game</h1>
        <p className="subtitle">Meurtrier &middot; Innocent &middot; Justicier</p>
        <div className="card">
          <h2>Rejoindre la partie</h2>
          <div className="gap-12">
            <input
              type="text"
              placeholder="Ton prénom..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              autoFocus
            />
            <button
              className="btn-primary"
              onClick={handleJoin}
              disabled={!name.trim()}
            >
              Rejoindre
            </button>
          </div>
        </div>
        {error && <div className="error">{error}</div>}
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

  // --- IN-GAME SCREEN (timer started, roles hidden) ---
  if (roleInfo && gameState?.started) {
    const meta = ROLE_META[roleInfo.role];
    const deadPlayers = gameState.players.filter((p) => !p.alive);

    return (
      <div className="container fade-in">
        <div className="ingame-header">
          <span className="ingame-role-hint" title={roleInfo.role}>{meta.icon}</span>
          {timeLeft !== null && (
            <div className={`timer ${timeLeft <= 60 ? "urgent" : ""}`}>
              {formatTime(timeLeft)}
            </div>
          )}
        </div>

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

        {deadPlayers.length > 0 && (
          <div className="card">
            <h2>Joueurs éliminés ({deadPlayers.length})</h2>
            <ul className="player-list">
              {deadPlayers.map((p) => (
                <li key={p.id} className="player-item player-dead">
                  <div className="player-avatar dead-avatar">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  {p.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // --- ROLE REVEAL SCREEN (roles assigned, waiting for admin to start timer) ---
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

  // --- LOBBY ---
  const config = gameState?.config || { murderers: 1, innocents: 3, vigilantes: 1, timer: 5 };
  const total = config.murderers + config.innocents + config.vigilantes;
  const playerCount = gameState?.playerCount || 0;
  const isValid = total === playerCount && playerCount > 0;

  return (
    <div className="container fade-in">
      <h1>Murder Game</h1>
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
