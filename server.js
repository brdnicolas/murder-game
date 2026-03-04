const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

let game = {
  players: new Map(),
  adminId: null,
  config: { murderers: 1, innocents: 3, vigilantes: 1 },
  started: false,
};

function resetGame() {
  game = {
    players: new Map(),
    adminId: null,
    config: { murderers: 1, innocents: 3, vigilantes: 1 },
    started: false,
  };
}

function broadcastState(io) {
  const players = [];
  for (const [id, p] of game.players) {
    players.push({ id, name: p.name, isAdmin: id === game.adminId });
  }
  io.emit("gameState", {
    players,
    config: game.config,
    started: game.started,
    playerCount: game.players.size,
  });
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function assignRoles() {
  const roles = [];
  for (let i = 0; i < game.config.murderers; i++) roles.push("meurtrier");
  for (let i = 0; i < game.config.innocents; i++) roles.push("innocent");
  for (let i = 0; i < game.config.vigilantes; i++) roles.push("justicier");
  shuffle(roles);

  let idx = 0;
  for (const [, player] of game.players) {
    player.role = roles[idx++];
  }
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  });

  const io = new Server(server);

  io.on("connection", (socket) => {
    socket.on("join", (name) => {
      if (game.started) {
        socket.emit("error", "Une partie est déjà en cours.");
        return;
      }

      const isAdmin = game.players.size === 0;
      game.players.set(socket.id, { name, role: null });
      if (isAdmin) game.adminId = socket.id;

      socket.emit("joined", { isAdmin });
      broadcastState(io);
    });

    socket.on("updateConfig", (config) => {
      if (socket.id !== game.adminId || game.started) return;
      game.config = {
        murderers: Math.max(0, config.murderers || 0),
        innocents: Math.max(0, config.innocents || 0),
        vigilantes: Math.max(0, config.vigilantes || 0),
      };
      broadcastState(io);
    });

    socket.on("startGame", () => {
      if (socket.id !== game.adminId) return;

      const total =
        game.config.murderers + game.config.innocents + game.config.vigilantes;
      if (total !== game.players.size) {
        socket.emit(
          "error",
          `Le total des rôles (${total}) ne correspond pas au nombre de joueurs (${game.players.size}).`
        );
        return;
      }

      assignRoles();
      game.started = true;

      for (const [id, player] of game.players) {
        const partners = [];
        if (player.role === "meurtrier") {
          for (const [mid, mp] of game.players) {
            if (mp.role === "meurtrier" && mid !== id) {
              partners.push(mp.name);
            }
          }
        }
        io.to(id).emit("roleAssigned", {
          role: player.role,
          partners,
        });
      }

      broadcastState(io);
    });

    socket.on("restartGame", () => {
      if (socket.id !== game.adminId) return;
      for (const [, player] of game.players) {
        player.role = null;
      }
      game.started = false;
      io.emit("gameRestarted");
      broadcastState(io);
    });

    socket.on("disconnect", () => {
      const wasAdmin = socket.id === game.adminId;
      game.players.delete(socket.id);

      if (game.players.size === 0) {
        resetGame();
        return;
      }

      if (wasAdmin) {
        game.adminId = game.players.keys().next().value;
        io.to(game.adminId).emit("promoted");
      }

      broadcastState(io);
    });
  });

  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
