import { Socket } from "socket.io";
import http from "http";
import express from 'express';
import { Server } from 'socket.io';
import { UserManager } from "./managers/UserManager";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket"], // Force WebSocket transport

});


const userManager = new UserManager(io);

io.on('connection', (socket: Socket) => {
  console.log('A user connected:', socket.id);
  userManager.addUser("randomName", socket);
  
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    userManager.removeUser(socket.id);
  });
});
app.get('/', (req, res) => {
  res.send('Server is working!');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});

