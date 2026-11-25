// src/net/friendsBoardClient.ts — the only module that talks to Convex for friends boards (SPEC §6.2).
import type { ConvexClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import type { BoardPost, BoardSnapshot, MyBoardEntry } from '../rules/friendsBoard';

/** What the board controller needs from the server; tests pass a fake. */
export interface BoardBackend {
  createBoard(name: string): Promise<string>;
  joinBoard(code: string, name: string): Promise<void>;
  leaveBoard(code: string): Promise<void>;
  /** `stored: false` means the server already had this day (first post wins). */
  postResult(post: BoardPost): Promise<{ stored: boolean }>;
  myBoards(): Promise<MyBoardEntry[]>;
  /** Live board for `day` (my local day number) and the day before. Returns the unsubscribe function. */
  watchBoard(code: string, day: number, onUpdate: (snapshot: BoardSnapshot | null) => void, onError: (error: unknown) => void): () => void;
}

export class ConvexBoardBackend implements BoardBackend {
  constructor(private readonly client: ConvexClient, private readonly token: string) {}

  createBoard(name: string): Promise<string> {
    return this.client.mutation(api.boards.createBoard, { token: this.token, name });
  }

  async joinBoard(code: string, name: string): Promise<void> {
    await this.client.mutation(api.boards.joinBoard, { code, token: this.token, name });
  }

  async leaveBoard(code: string): Promise<void> {
    await this.client.mutation(api.boards.leaveBoard, { code, token: this.token });
  }

  postResult(post: BoardPost): Promise<{ stored: boolean }> {
    return this.client.mutation(api.boards.postResult, { token: this.token, day: post.day, stars: post.stars, shots: post.shots, streak: post.streak });
  }

  myBoards(): Promise<MyBoardEntry[]> {
    return this.client.query(api.boards.myBoards, { token: this.token });
  }

  watchBoard(code: string, day: number, onUpdate: (snapshot: BoardSnapshot | null) => void, onError: (error: unknown) => void): () => void {
    return this.client.onUpdate(api.boards.getBoard, { code, token: this.token, day }, onUpdate, onError);
  }
}
