"use client";

import { useEffect, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

interface Player {
  id: string;
  name: string;
  isAdmin: boolean;
}

interface GameState {
  players: Player[];
  config: { murderers: number; innocents: number; vigilantes: number };
  started: boolean;
  playerCount: number;
}

interface RoleInfo {
  role: string;
  partners: string[];
}

const ROLE_META: Record<string, { icon: string; description: string }> = {
  meurtrier: {
    icon: "\uD83D\uDD2A",
    description: "Tu es un meurtrier. Élimine les autres sans te faire repérer.",
  },
  innocent: {
    icon: "\uD83D\uDE07",
    description: "Tu es innocent. Survis et trouve les meurtriers.",
  },
  justicier: {
    icon: "\uD83D\uDEE1\uFE0F",
    description: "Tu es le justicier. Protège les innocents et démasque les meurtriers.",
  },
};

export default function Home() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [roleInfo, setRoleInfo] = useState<RoleInfo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const s = io();
    setSocket(s);

    s.on("joined", ({ isAdmin }: { isAdmin: boolean }) => {
      setJoined(true);
      setIsAdmin(isAdmin);
    });

    s.on("gameState", (state: GameState) => {
      setGameState(state);
    });

    s.on("roleAssigned", (info: RoleInfo) => {
      setRoleInfo(info);
    });

    s.on("gameRestarted", () => {
      setRoleInfo(null);
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
        [key]: Math.max(0, gameState.config[key as keyof typeof gameState.config] + delta),
      };
      socket.emit("updateConfig", newConfig);
    },
    [socket, gameState]
  );

  // Join screen
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

  // Role reveal
  if (roleInfo && gameState?.started) {
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
        {isAdmin && (
          <button
            className="btn-danger"
            onClick={() => socket?.emit("restartGame")}
          >
            Nouvelle partie
          </button>
        )}
      </div>
    );
  }

  // Lobby
  const config = gameState?.config || { murderers: 1, innocents: 3, vigilantes: 1 };
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
          </div>

          <button
            className="btn-primary"
            disabled={!isValid}
            onClick={() => socket?.emit("startGame")}
          >
            Lancer la partie
          </button>
        </>
      )}
    </div>
  );
}
