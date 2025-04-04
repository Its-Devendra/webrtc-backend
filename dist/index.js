"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const socket_io_1 = require("socket.io");
const UserManager_1 = require("./managers/UserManager");
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: { origin: "*" }
});
const userManager = new UserManager_1.UserManager(io);
io.on('connection', (socket) => {
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
server.listen(3000, '0.0.0.0', () => {
    console.log('Server is listening on port 3000');
});
