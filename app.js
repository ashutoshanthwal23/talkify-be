import express from "express";
import { Server } from "socket.io";
import { createServer } from "http";
import dotenv from "dotenv";

dotenv.config();
const app = express();

const server = createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const socketUserMap = new Map();
const userSocketMap = new Map();
let screenSharers = [];

io.on("connection", (socket) => {
  console.log("connected", socket.id);

  socket.on("join-room", ({ roomId, user }) => {
    socketUserMap.set(socket.id, user);
    userSocketMap.set(user.id, socket.id);
    socket.roomId = roomId;
    console.log("joined room", user);

    const sockets = Array.from(io.sockets.adapter.rooms.get(roomId) || []);

    sockets.forEach((socketId) => {
      socket.emit("joined", {
        socketId,
        user: socketUserMap.get(socketId),
        createOffer: true,
        activeScreens: screenSharers,
      });
    });

    sockets.forEach((socketId) => {
      socket.to(socketId).emit("joined", {
        user,
        socketId: socket.id,
        createOffer: false,
      });
    });

    socket.join(roomId);
  });

  socket.on("sdp-offer", ({ offer, to }) => {
    socket
      .to(to)
      .emit("sdp-offer", {
        offer,
        from: socketUserMap.get(socket.id)?.id,
        socketId: socket.id,
      });
  });

  socket.on("sdp-answer", ({ answer, to }) => {
    socket
      .to(to)
      .emit("sdp-answer", { answer, from: socketUserMap.get(socket.id)?.id });
  });

  socket.on("ice-candidate", ({ iceCandidate, to }) => {
    socket
      .to(to)
      .emit("ice-candidate", {
        iceCandidate,
        from: socketUserMap.get(socket.id)?.id,
      });
  });

  socket.on("toggle-video", ({ roomId, userId, disabled }) => {
    const socketId = userSocketMap.get(userId);
    if (!socketId) return;

    const user = socketUserMap.get(socketId);
    if (!user) return;

    const updatedUser = {
      ...user,
      isVideo: !disabled,
    };

    socketUserMap.set(socketId, updatedUser);

    socket.to(roomId).emit("toggle-video", { userId, disabled });
  });

  socket.on("toggle-audio", ({ roomId, disabled, userId }) => {
    const socketId = userSocketMap.get(userId);
    if (!socketId) return;

    const user = socketUserMap.get(socketId);
    if (!user) return;

    const updatedUser = {
      ...user,
      isAudio: !disabled,
    };
    socketUserMap.set(socketId, updatedUser);

    socket.to(roomId).emit("toggle-audio", { disabled, userId });
  });

  socket.on("screen-share", ({ roomId, disabled }) => {
    const user = socketUserMap.get(socket.id);
    if (!user) return;

    if (!disabled) {
      screenSharers.push(user.id);
    } else {
      screenSharers = screenSharers.filter((i) => i !== user.id);
    }

    const updateUser = {
      ...user,
      isScreenShare: !disabled,
    };
    socketUserMap.set(socket.id, updateUser);

    socket
      .to(roomId)
      .emit("screen-share", {
        userId: socketUserMap.get(socket.id)?.id,
        disabled,
      });
  });

  socket.on("disconnect", () => {
    console.log("disconnect", socket.id);
    const user = socketUserMap.get(socket.id);
    if (user) {
      socket.to(socket.roomId).emit("user-left", user.id);
      if (screenSharers.includes(user.id)) {
        screenSharers = screenSharers.filter((i) => i !== user.id);
      }
    }
    socket.leaveAll();

    socketUserMap.delete(socket.id);
    if (user) {
      userSocketMap.delete(user.id);
    }
  });
});

server.listen(process.env.PORT, () => {
  console.log("server is listening at:", process.env.PORT);
});