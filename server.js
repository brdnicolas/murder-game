const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const lobbies = new Map();
const playerLobby = new Map();

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = "";
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (lobbies.has(code));
  return code;
}

function createLobbyObj(code, name) {
  return {
    code,
    name,
    players: new Map(),
    adminId: null,
    config: { murderers: 1, innocents: 3, vigilantes: 1, timer: 5 },
    started: false,
    rolesRevealed: false,
    endTime: null,
    winner: null,
    timerInterval: null,
  };
}

function broadcastState(io, lobby) {
  const players = [];
  for (const [id, p] of lobby.players) {
    players.push({
      id,
      name: p.name,
      isAdmin: id === lobby.adminId,
      alive: p.alive,
      role: lobby.winner ? p.role : undefined,
    });
  }
  io.to(lobby.code).emit("gameState", {
    players,
    config: lobby.config,
    started: lobby.started,
    rolesRevealed: lobby.rolesRevealed,
    playerCount: lobby.players.size,
    endTime: lobby.endTime,
    winner: lobby.winner,
    lobbyCode: lobby.code,
    lobbyName: lobby.name,
  });
}

function broadcastLobbyList(io) {
  const list = [];
  for (const [, lobby] of lobbies) {
    list.push({
      code: lobby.code,
      name: lobby.name,
      playerCount: lobby.players.size,
      started: lobby.started,
    });
  }
  io.emit("lobbyList", list);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function assignRoles(lobby) {
  const roles = [];
  for (let i = 0; i < lobby.config.murderers; i++) roles.push("meurtrier");
  for (let i = 0; i < lobby.config.innocents; i++) roles.push("innocent");
  for (let i = 0; i < lobby.config.vigilantes; i++) roles.push("justicier");
  shuffle(roles);

  let idx = 0;
  for (const [, player] of lobby.players) {
    player.role = roles[idx++];
    player.alive = true;
  }
}

function checkWinCondition(io, lobby) {
  if (!lobby.started || lobby.winner) return;

  const players = [...lobby.players.values()];
  const aliveMurderers = players.filter((p) => p.alive && p.role === "meurtrier");
  const aliveNonMurderers = players.filter((p) => p.alive && p.role !== "meurtrier");

  let winner = null;
  if (aliveNonMurderers.length === 0) {
    winner = "meurtriers";
  } else if (aliveMurderers.length === 0) {
    winner = "innocents";
  }

  if (winner) {
    lobby.winner = winner;
    if (lobby.timerInterval) {
      clearInterval(lobby.timerInterval);
      lobby.timerInterval = null;
    }
    io.to(lobby.code).emit("gameOver", { winner });
    broadcastState(io, lobby);
  }
}

function startTimer(io, lobby) {
  lobby.endTime = Date.now() + lobby.config.timer * 60 * 1000;
  lobby.timerInterval = setInterval(() => {
    if (lobby.winner) {
      clearInterval(lobby.timerInterval);
      lobby.timerInterval = null;
      return;
    }
    if (Date.now() >= lobby.endTime) {
      clearInterval(lobby.timerInterval);
      lobby.timerInterval = null;
      lobby.winner = "innocents";
      io.to(lobby.code).emit("gameOver", { winner: "innocents" });
      broadcastState(io, lobby);
    }
  }, 1000);
}

function deleteLobby(lobby) {
  if (lobby.timerInterval) clearInterval(lobby.timerInterval);
  lobbies.delete(lobby.code);
}

function getLobby(socketId) {
  const code = playerLobby.get(socketId);
  if (!code) return null;
  return lobbies.get(code) || null;
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  });

  const io = new Server(server);

  io.on("connection", (socket) => {

    // Send lobby list on connect
    const list = [];
    for (const [, lobby] of lobbies) {
      list.push({
        code: lobby.code,
        name: lobby.name,
        playerCount: lobby.players.size,
        started: lobby.started,
      });
    }
    socket.emit("lobbyList", list);

    socket.on("createLobby", ({ playerName, lobbyName }) => {
      if (playerLobby.has(socket.id)) return;

      const code = generateCode();
      const lobby = createLobbyObj(code, lobbyName || "Lobby " + code);
      lobbies.set(code, lobby);

      lobby.players.set(socket.id, { name: playerName, role: null, alive: true });
      lobby.adminId = socket.id;
      playerLobby.set(socket.id, code);
      socket.join(code);

      socket.emit("joinedLobby", { code, isAdmin: true });
      broadcastState(io, lobby);
      broadcastLobbyList(io);
    });

    socket.on("joinLobby", ({ code, playerName }) => {
      if (playerLobby.has(socket.id)) return;

      const lobby = lobbies.get(code);
      if (!lobby) {
        socket.emit("error", "Lobby introuvable.");
        return;
      }
      if (lobby.started || lobby.rolesRevealed) {
        socket.emit("error", "La partie a déjà commencé.");
        return;
      }

      lobby.players.set(socket.id, { name: playerName, role: null, alive: true });
      playerLobby.set(socket.id, code);
      socket.join(code);

      socket.emit("joinedLobby", { code, isAdmin: false });
      broadcastState(io, lobby);
      broadcastLobbyList(io);
    });

    socket.on("listLobbies", () => {
      const list = [];
      for (const [, lobby] of lobbies) {
        list.push({
          code: lobby.code,
          name: lobby.name,
          playerCount: lobby.players.size,
          started: lobby.started,
        });
      }
      socket.emit("lobbyList", list);
    });

    socket.on("updateConfig", (config) => {
      const lobby = getLobby(socket.id);
      if (!lobby || socket.id !== lobby.adminId || lobby.started) return;
      lobby.config = {
        murderers: Math.max(0, config.murderers || 0),
        innocents: Math.max(0, config.innocents || 0),
        vigilantes: Math.max(0, config.vigilantes || 0),
        timer: Math.min(60, Math.max(1, config.timer || 5)),
      };
      broadcastState(io, lobby);
    });

    socket.on("revealRoles", () => {
      const lobby = getLobby(socket.id);
      if (!lobby || socket.id !== lobby.adminId) return;
      if (lobby.rolesRevealed || lobby.started) return;

      const total = lobby.config.murderers + lobby.config.innocents + lobby.config.vigilantes;
      if (total !== lobby.players.size) {
        socket.emit("error", `Le total des rôles (${total}) ne correspond pas au nombre de joueurs (${lobby.players.size}).`);
        return;
      }

      assignRoles(lobby);
      lobby.rolesRevealed = true;

      for (const [id, player] of lobby.players) {
        const partners = [];
        if (player.role === "meurtrier") {
          for (const [mid, mp] of lobby.players) {
            if (mp.role === "meurtrier" && mid !== id) {
              partners.push(mp.name);
            }
          }
        }
        io.to(id).emit("roleAssigned", { role: player.role, partners });
      }

      broadcastState(io, lobby);
      broadcastLobbyList(io);
    });

    socket.on("startGame", () => {
      const lobby = getLobby(socket.id);
      if (!lobby || socket.id !== lobby.adminId) return;
      if (!lobby.rolesRevealed || lobby.started) return;

      lobby.started = true;
      startTimer(io, lobby);
      io.to(lobby.code).emit("gameStarted");
      broadcastState(io, lobby);
      broadcastLobbyList(io);
    });

    socket.on("declareDead", () => {
      const lobby = getLobby(socket.id);
      if (!lobby || !lobby.started || lobby.winner) return;
      const player = lobby.players.get(socket.id);
      if (!player || !player.alive) return;

      player.alive = false;
      broadcastState(io, lobby);
      checkWinCondition(io, lobby);
    });

    socket.on("restartGame", () => {
      const lobby = getLobby(socket.id);
      if (!lobby || socket.id !== lobby.adminId) return;

      if (lobby.timerInterval) {
        clearInterval(lobby.timerInterval);
        lobby.timerInterval = null;
      }
      for (const [, player] of lobby.players) {
        player.role = null;
        player.alive = true;
      }
      lobby.started = false;
      lobby.rolesRevealed = false;
      lobby.endTime = null;
      lobby.winner = null;
      io.to(lobby.code).emit("gameRestarted");
      broadcastState(io, lobby);
      broadcastLobbyList(io);
    });

    socket.on("disconnect", () => {
      const lobby = getLobby(socket.id);
      if (!lobby) return;

      const wasAdmin = socket.id === lobby.adminId;
      lobby.players.delete(socket.id);
      playerLobby.delete(socket.id);

      if (lobby.players.size === 0) {
        deleteLobby(lobby);
        broadcastLobbyList(io);
        return;
      }

      if (wasAdmin) {
        lobby.adminId = lobby.players.keys().next().value;
        io.to(lobby.adminId).emit("promoted");
      }

      if (lobby.started && !lobby.winner) {
        checkWinCondition(io, lobby);
      }

      broadcastState(io, lobby);
      broadcastLobbyList(io);
    });
  });

  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
