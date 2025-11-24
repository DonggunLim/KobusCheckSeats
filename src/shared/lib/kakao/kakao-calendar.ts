import axios from "axios";
import prisma from "../prisma";

interface KakaoEventData {
  departureCd: string;
  arrivalCd: string;
  time: string | null;
}

export async function createKakaoEvent(
  userAccessToken: string,
  messageData: KakaoEventData
): Promise<boolean> {
  try {
    // 터미널 코드를 이름으로 변환
    const terminals = await prisma.terminal.findMany({
      where: {
        terminalCd: { in: [messageData.departureCd, messageData.arrivalCd] },
      },
      select: { terminalCd: true, terminalNm: true },
    });
    const terminalMap = new Map(
      terminals.map((t) => [t.terminalCd, t.terminalNm])
    );
    const departure =
      terminalMap.get(messageData.departureCd) || messageData.departureCd;
    const arrival =
      terminalMap.get(messageData.arrivalCd) || messageData.arrivalCd;

    // 시간 설정: 리마인더(5분전)가 현재시간 이후가 되도록 설정
    // 예: 16:02 → start=16:10 → 리마인더=16:05 (현재 이후라 알림 옴)
    const now = new Date();
    const futureTime = new Date(now.getTime() + 5 * 60 * 1000); // 5분 후 (최소)
    const minutes = Math.ceil(futureTime.getMinutes() / 5) * 5;
    const startTime = new Date(futureTime);
    startTime.setMinutes(minutes, 0, 0);
    // 종료 시간은 시작 시간으로부터 1시간 뒤
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

    const eventData = {
      title: `${departure} → ${arrival} 좌석 발견! 바로 예매하세요!`,
      time: {
        start_at: startTime.toISOString(),
        end_at: endTime.toISOString(),
        time_zone: "Asia/Seoul",
      },
      description: `kobusCheckSeats에서 빈 좌석을 발견하였습니다. 누군가 예매하기 전에 서두르세요!`,
      location: {
        name: "코버스 예매하기",
        location_id: 123,
        address: "https://www.kobus.co.kr",
      },
      // 알림 설정 (5분 전 알림)
      reminders: [5],
      color: "RED",
    };

    // 일정 생성 API 호출
    await axios.post(
      "https://kapi.kakao.com/v2/api/calendar/create/event",
      new URLSearchParams({
        event: JSON.stringify(eventData),
      }),
      {
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log("[Kakao] 톡캘린더 일정 등록 성공");
    return true;
  } catch (error) {
    console.error("[Kakao] 일정 등록 실패:", error);
    return false;
  }
}
