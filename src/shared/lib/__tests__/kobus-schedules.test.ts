import { describe, expect, it } from "vitest";
import { parseKobusScheduleHtml } from "../kobus-schedules";

describe("parseKobusScheduleHtml", () => {
  it("extracts departure time, bus class, company, and via location", () => {
    const html = `
      <div>
        <a onclick="fnSatsChc('1')">
          <span class="start_time">08 : 30</span>
          <span class="grade">우등 <span class="via">(천안)</span></span>
          <span class="bus_com"><span>금호고속</span></span>
        </a>
      </div>
    `;

    expect(parseKobusScheduleHtml(html)).toEqual([
      {
        departureTime: "08:30",
        busClass: "우등",
        busCompany: "금호고속",
        isViaRoute: true,
        viaLocation: "천안",
      },
    ]);
  });

  it("ignores schedule links without a departure time", () => {
    const html = `
      <a onclick="fnSatsChc('1')">
        <span class="grade">고속</span>
      </a>
    `;

    expect(parseKobusScheduleHtml(html)).toEqual([]);
  });
});
