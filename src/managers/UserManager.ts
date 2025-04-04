import { Socket, Server } from "socket.io";
import { RoomManager } from "./RoomManager";

export interface User {
  socket: Socket;
  name: string;
  inQueue: boolean;
}

export class UserManager {
  private users: User[];
  private queue: string[];
  private roomManager: RoomManager;
  private io: Server;
  private skippedUsers: Map<string, number>; // Track last skip timestamp per socketId.
  private skipCooldown: number = 1000; // 1 second cooldown.
  private skipLocks: Set<string>; // Prevent concurrent skip processing for a room.

  constructor(io: Server) {
    this.io = io;
    this.users = [];
    this.queue = [];
    this.roomManager = new RoomManager();
    this.skippedUsers = new Map();
    this.skipLocks = new Set();
  }

  /**
   * Adds a user and attempts to match with a waiting user.
   */
  addUser(name: string, socket: Socket) {
    this.users.push({ name, socket, inQueue: true });
    this.queue.push(socket.id);
    socket.emit("lobby");
    this.clearQueue();
    this.initHandlers(socket);
  }

  removeUser(socketId: string) {
    // Check if the user is in a room.
    const otherUserId = this.roomManager.removeUser(socketId);
    if (otherUserId) {
      const otherUser = this.getUserBySocketId(otherUserId);
      if (otherUser) {
        otherUser.socket.emit("user-skipped");
        // Put the other user back in the queue.
        this.addToQueue(otherUserId);
      }
    }

    // Remove user from the internal lists.
    this.users = this.users.filter(x => x.socket.id !== socketId);
    this.queue = this.queue.filter(id => id !== socketId);
    this.skippedUsers.delete(socketId);
  }

  /**
   * Adds a user back to the matchmaking queue.
   */
  addToQueue(socketId: string) {
    const user = this.getUserBySocketId(socketId);
    if (!user || user.inQueue) return;
    
    user.inQueue = true;
    this.queue.push(socketId);
    user.socket.emit("lobby");
    this.clearQueue();
  }

  /**
   * Retrieves a user by socket ID.
   */
  getUserBySocketId(socketId: string): User | undefined {
    return this.users.find(x => x.socket.id === socketId);
  }

  /**
   * Matches users when there are at least two waiting.
   */
  clearQueue() {
    console.log("inside clearQueue. Queue length:", this.queue.length);
    if (this.queue.length < 2) return;

    const id1 = this.queue.shift();
    const id2 = this.queue.shift();
    
    if (!id1 || !id2) return;
    console.log("Matching sockets:", id1, id2);
    
    const user1 = this.getUserBySocketId(id1);
    const user2 = this.getUserBySocketId(id2);
    
    if (!user1 || !user2) return;
    
    // Update user queue status.
    user1.inQueue = false;
    user2.inQueue = false;
    
    console.log("Creating room for users");
    this.roomManager.createRoom(user1, user2);
    
    // Recursively clear the queue.
    this.clearQueue();
  }

  /**
   * Clean up stale skip timestamps to prevent memory buildup.
   */
  private cleanupSkippedUsers() {
    const now = Date.now();
    for (const [socketId, timestamp] of this.skippedUsers.entries()) {
      if (now - timestamp > this.skipCooldown * 10) {
        this.skippedUsers.delete(socketId);
      }
    }
  }

  /**
   * Handles a user skipping their current chat partner.
   */
  handleSkip(socketId: string, roomId: string) {
    this.cleanupSkippedUsers();

    // If a skip is already processing for this room, ignore new requests.
    if (this.skipLocks.has(roomId)) {
      const user = this.getUserBySocketId(socketId);
      if (user) {
        user.socket.emit("skip-error", { message: "Skip in progress, please wait." });
      }
      return;
    }

    this.skipLocks.add(roomId);

    const now = Date.now();
    const lastSkipTime = this.skippedUsers.get(socketId) || 0;
    if (now - lastSkipTime < this.skipCooldown) {
      const user = this.getUserBySocketId(socketId);
      if (user) {
        user.socket.emit("skip-error", { message: "Please wait before skipping again" });
      }
      this.skipLocks.delete(roomId);
      return;
    }
    
    // Update skip timestamp.
    this.skippedUsers.set(socketId, now);

    // Process the skip.
    const otherUserId = this.roomManager.handleSkip(roomId, socketId);
    if (!otherUserId) {
      this.skipLocks.delete(roomId);
      return;
    }
    
    const skipper = this.getUserBySocketId(socketId);
    const skipped = this.getUserBySocketId(otherUserId);
    
    if (skipped) {
      skipped.socket.emit("user-skipped");
    }
    
    // Add both users back to the queue.
    this.addToQueue(socketId);
    this.addToQueue(otherUserId);

    this.skipLocks.delete(roomId);
  }

  /**
   * Initializes socket event handlers.
   */
  initHandlers(socket: Socket) {
    socket.on("offer", ({ sdp, roomId }: { sdp: string, roomId: string }) => {
      this.roomManager.onOffer(roomId, sdp, socket.id);
    });

    socket.on("answer", ({ sdp, roomId }: { sdp: string, roomId: string }) => {
      this.roomManager.onAnswer(roomId, sdp, socket.id);
    });

    socket.on("add-ice-candidate", ({ candidate, roomId, type }) => {
      this.roomManager.onIceCandidates(roomId, socket.id, candidate, type);
    });

    socket.on("chat-message", ({ roomId, message }: { roomId: string, message: string }) => {
      console.log(`Received chat-message from ${socket.id} for room ${roomId}: ${message}`);
      this.io.in(roomId).emit("chat-message", { message, sender: socket.id });
    });

    socket.on("skip-user", ({ roomId }: { roomId: string }) => {
      console.log(`User ${socket.id} wants to skip partner in room ${roomId}`);
      this.handleSkip(socket.id, roomId);
    });
  }
}
