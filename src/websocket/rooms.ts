import WebSocket from 'ws';

class RoomManager {
  // symbol -> set of clients
  private rooms = new Map<string, Set<WebSocket>>();
  // client -> set of symbols
  private clientRooms = new Map<WebSocket, Set<string>>();

  subscribe(client: WebSocket, symbol: string): void {
    const s = symbol.toUpperCase();

    if (!this.rooms.has(s)) {
      this.rooms.set(s, new Set());
    }
    this.rooms.get(s)!.add(client);

    if (!this.clientRooms.has(client)) {
      this.clientRooms.set(client, new Set());
    }
    this.clientRooms.get(client)!.add(s);
  }

  unsubscribe(client: WebSocket, symbol: string): void {
    const s = symbol.toUpperCase();

    this.rooms.get(s)?.delete(client);
    if (this.rooms.get(s)?.size === 0) {
      this.rooms.delete(s);
    }

    this.clientRooms.get(client)?.delete(s);
  }

  removeClient(client: WebSocket): string[] {
    const symbols = this.clientRooms.get(client);
    const orphanedSymbols: string[] = [];

    if (symbols) {
      for (const symbol of symbols) {
        this.rooms.get(symbol)?.delete(client);
        if (this.rooms.get(symbol)?.size === 0) {
          this.rooms.delete(symbol);
          orphanedSymbols.push(symbol);
        }
      }
    }

    this.clientRooms.delete(client);
    return orphanedSymbols;
  }

  getClientsForSymbol(symbol: string): Set<WebSocket> {
    return this.rooms.get(symbol.toUpperCase()) ?? new Set();
  }

  getSymbolsForClient(client: WebSocket): string[] {
    return Array.from(this.clientRooms.get(client) ?? []);
  }

  getAllSubscribedSymbols(): string[] {
    return Array.from(this.rooms.keys());
  }

  getClientCount(): number {
    return this.clientRooms.size;
  }

  getRoomCount(): number {
    return this.rooms.size;
  }
}

export const roomManager = new RoomManager();
