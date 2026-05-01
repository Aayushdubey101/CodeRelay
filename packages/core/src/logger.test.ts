import { describe, it, expect } from "vitest";
import { createLogger, log } from "./logger.js";

describe("createLogger", () => {
  it("log.info does not throw", () => {
    expect(() => log.info("hi")).not.toThrow();
  });

  it("named logger does not throw", () => {
    const l = createLogger("test-pkg");
    expect(() => l.info("named logger works")).not.toThrow();
  });
});
