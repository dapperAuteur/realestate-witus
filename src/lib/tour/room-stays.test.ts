import { describe, expect, it } from "vitest";
import { MAX_STAY_SECONDS, RoomStayTracker, parseRoomStay, type RoomStay } from "./room-stays";

function setup() {
  let t = 0;
  const stays: RoomStay[] = [];
  const tracker = new RoomStayTracker(() => t, (stay) => stays.push(stay));
  return { tracker, stays, at: (seconds: number) => void (t = seconds * 1000) };
}

describe("RoomStayTracker", () => {
  it("ends a room's stay when the buyer walks into the next one", () => {
    const { tracker, stays, at } = setup();
    tracker.enter("hall");
    at(12);
    tracker.enter("kitchen");
    at(40);
    tracker.close();
    expect(stays).toEqual([
      { sceneId: "hall", seconds: 12, entered: true, exit: false },
      { sceneId: "kitchen", seconds: 28, entered: true, exit: true },
    ]);
  });

  it("counts hiding the tab as leaving, and a return as the same visit", () => {
    const { tracker, stays, at } = setup();
    tracker.enter("hall");
    at(5);
    tracker.hide();
    at(500); // away: not counted
    tracker.show();
    at(510);
    tracker.enter("den");
    expect(stays).toEqual([
      { sceneId: "hall", seconds: 5, entered: true, exit: true },
      { sceneId: "hall", seconds: 10, entered: false, exit: false },
    ]);
  });

  it("caps a stretch at ten minutes and ignores re-entering the room it's in", () => {
    const { tracker, stays, at } = setup();
    tracker.enter("hall");
    tracker.enter("hall");
    at(3600);
    tracker.close();
    expect(stays).toEqual([{ sceneId: "hall", seconds: MAX_STAY_SECONDS, entered: true, exit: true }]);
  });

  it("sends nothing twice: a close after a hide, or a hide before any room", () => {
    const { tracker, stays, at } = setup();
    tracker.hide();
    tracker.enter("hall");
    at(2);
    tracker.hide();
    tracker.close();
    expect(stays).toHaveLength(1);
  });
});

describe("parseRoomStay", () => {
  const id = "0b8f0d5e-5d0a-4c55-9a43-1f2d3c4b5a69";
  it("accepts a stay and caps its seconds", () => {
    expect(parseRoomStay({ sceneId: id, seconds: 9000.4, entered: true, exit: "yes" })).toEqual({
      sceneId: id,
      seconds: MAX_STAY_SECONDS,
      entered: true,
      exit: false,
    });
  });
  it("refuses what isn't one", () => {
    expect(parseRoomStay({ sceneId: "hall", seconds: 3 })).toBeNull();
    expect(parseRoomStay({ sceneId: id, seconds: -1 })).toBeNull();
    expect(parseRoomStay({ sceneId: id })).toBeNull();
  });
});
