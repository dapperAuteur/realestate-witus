// Which rooms hold buyers, and where they leave (plans/08 6.5 "Deeper tour
// analytics", the roadmap's next step after the seller report). Pure timing,
// no visitor: the browser measures how long the tour shows each room and
// sends one small count per stretch of time. The server adds them up per
// room per day; nothing says who.
//
// A stay is the time between walking into a room and walking out of it (or
// the tab hiding, or the tour closing). Hiding the tab ends the stretch and
// counts as leaving from that room; coming back starts a new stretch in the
// same room without counting a second visit.

/** A stretch longer than this is someone who walked away from the screen. */
export const MAX_STAY_SECONDS = 600;

export interface RoomStay {
  sceneId: string;
  /** Whole seconds the room was on screen in this stretch, capped. */
  seconds: number;
  /** The first stretch of a visit to the room (walking in), not a return to the tab. */
  entered: boolean;
  /** The buyer left the tour from this room (tab hidden, page left, tour closed). */
  exit: boolean;
}

export class RoomStayTracker {
  private sceneId: string | null = null;
  private since: number | null = null;
  private entered = false;

  constructor(
    private readonly now: () => number,
    private readonly emit: (stay: RoomStay) => void,
  ) {}

  /** The tour shows a room: the stay in the previous one ends. */
  enter(sceneId: string): void {
    if (sceneId === this.sceneId && this.since !== null) return;
    this.flush(false);
    this.sceneId = sceneId;
    this.since = this.now();
    this.entered = true;
  }

  /** The tab hid or the page is going: the buyer left from this room. */
  hide(): void {
    this.flush(true);
  }

  /** Back on the tab: time counts again, in the same room, as the same visit. */
  show(): void {
    if (this.sceneId && this.since === null) this.since = this.now();
  }

  /** The tour is going away for good. */
  close(): void {
    this.flush(true);
    this.sceneId = null;
  }

  private flush(exit: boolean): void {
    if (!this.sceneId || this.since === null) return;
    const seconds = Math.min(MAX_STAY_SECONDS, Math.max(0, Math.round((this.now() - this.since) / 1000)));
    this.emit({ sceneId: this.sceneId, seconds, entered: this.entered, exit });
    this.since = null;
    this.entered = false;
  }
}

/** Server-side check of a stay the browser sent. Null when it isn't one. */
export function parseRoomStay(body: Record<string, unknown>): RoomStay | null {
  const { sceneId, seconds, entered, exit } = body;
  if (typeof sceneId !== "string" || !/^[0-9a-f-]{36}$/i.test(sceneId)) return null;
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return null;
  return {
    sceneId,
    seconds: Math.min(MAX_STAY_SECONDS, Math.round(seconds)),
    entered: entered === true,
    exit: exit === true,
  };
}
