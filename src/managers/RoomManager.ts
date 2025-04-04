import { User } from "./UserManager";

let GLOBAL_ROOM_ID = 1;

interface Room {
  user1: User;
  user2: User;
}

export class RoomManager {
  private rooms: Map<string, Room>;

  constructor() {
    this.rooms = new Map<string, Room>();
  }

  /**
   * Creates a room and adds both users to the Socket.io room.
   */
  createRoom(user1: User, user2: User) {
    const roomId = this.generate().toString();
    this.rooms.set(roomId, { user1, user2 });

    // Both users join the Socket.io room for easier broadcasting.
    user1.socket.join(roomId);
    user2.socket.join(roomId);
    console.log(`Users ${user1.socket.id} and ${user2.socket.id} joined room ${roomId}`);

    // Notify both users to start the signaling process.
    user1.socket.emit("send-offer", { roomId });
    user2.socket.emit("send-offer", { roomId });
    
    return roomId;
  }

  /**
   * Forwards the SDP offer to the receiving user.
   */
  onOffer(roomId: string, sdp: string, senderSocketId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const receivingUser = room.user1.socket.id === senderSocketId ? room.user2 : room.user1;
    receivingUser.socket.emit("offer", { sdp, roomId });
  }

  /**
   * Forwards the SDP answer to the receiving user.
   */
  onAnswer(roomId: string, sdp: string, senderSocketId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const receivingUser = room.user1.socket.id === senderSocketId ? room.user2 : room.user1;
    receivingUser.socket.emit("answer", { sdp, roomId });
  }

  /**
   * Forwards ICE candidates to the receiving user.
   */
  onIceCandidates(roomId: string, senderSocketId: string, candidate: any, type: "sender" | "receiver") {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const receivingUser = room.user1.socket.id === senderSocketId ? room.user2 : room.user1;
    receivingUser.socket.emit("add-ice-candidate", { candidate, type });
  }

  /**
   * Handles a user skipping their current chat partner.
   * Returns the socket ID of the other user.
   */
  handleSkip(roomId: string, skipperSocketId: string): string | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    
    // Identify the other user.
    const otherUser = room.user1.socket.id === skipperSocketId ? room.user2 : room.user1;
    
    // Clean up the room.
    this.rooms.delete(roomId);
    
    // Have both users leave the Socket.io room.
    room.user1.socket.leave(roomId);
    room.user2.socket.leave(roomId);
    
    console.log(`User ${skipperSocketId} skipped user ${otherUser.socket.id} in room ${roomId}`);
    
    return otherUser.socket.id;
  }

  /**
   * Generates a unique room id.
   */
  generate() {
    return GLOBAL_ROOM_ID++;
  }

  /**
   * Checks if a user is in a room.
   */
  getUserRoom(socketId: string): string | null {
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.user1.socket.id === socketId || room.user2.socket.id === socketId) {
        return roomId;
      }
    }
    return null;
  }

  /**
   * Removes a user from any room they're in.
   * Returns the other user's socket ID if present.
   */
  removeUser(socketId: string): string | null {
    let otherUserId = null;
    
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.user1.socket.id === socketId || room.user2.socket.id === socketId) {
        // Identify the other user.
        otherUserId = room.user1.socket.id === socketId ? room.user2.socket.id : room.user1.socket.id;
        
        // Clean up the room.
        room.user1.socket.leave(roomId);
        room.user2.socket.leave(roomId);
        this.rooms.delete(roomId);
        
        console.log(`User ${socketId} removed from room ${roomId}`);
        break;
      }
    }
    
    return otherUserId;
  }
}
