// 코버스(KOBUS) API 관련 통합 상수
export const KOBUS = {
  // API 엔드포인트
  URLS: {
    MASTER_DATA: "https://www.kobus.co.kr/mrs/readRotLinInf.ajax", // 마스터 데이터(노선, 지역 정보)
    TIMETABLE_PAGE: "https://www.kobus.co.kr/oprninf/alcninqr/oprnAlcnPage.do", // 시간표 조회 화면 (세션 쿠키 획득)
    TIMETABLE_SEARCH: "https://www.kobus.co.kr/oprninf/alcninqr/readAlcnSrch.ajax", // 날짜별 배차·잔여석 JSON
  },

  // HTTP 클라이언트 설정
  HTTP: {
    USER_AGENT:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36",
    TIMEOUT: 30000, // axios timeout (ms)
    CRAWL_DELAY_MS: 500, // API 서버 부하 방지 대기 시간
    HEADERS: {
      CONTENT_TYPE_FORM: "application/x-www-form-urlencoded",
      ACCEPT_HTML:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      ACCEPT_JSON: "application/json, text/javascript, */*; q=0.01",
    },
  },

  // 배차 조회 폼 기본 파라미터
  FORM: {
    BUS_CLS_CD: "0", // 버스 등급 코드 (전체)
  },

  // 배차별 예매 상태 코드 (ALCN_CHC) → 표시 문자열
  SEAT_STATUS: {
    chc: "예매가능",
    cnt0: "매진",
    time0: "출발임박",
  } as Record<string, string>,

  // 좌석 상태 문자열
  STATUS: {
    SOLDOUT: "매진", // 매진 상태
    NOT_AVAILABLE: "N/A", // 정보 없음
    NO_INFO: "정보 없음", // 정보 없음 (한글)
  },
} as const;

// 지역 코드 매핑
export const AREA_CODE_MAP: Record<string, string> = {
  "48": "경남",
  "47": "경북",
  "46": "전남",
  "45": "전북",
  "44": "충남",
  "43": "충북",
  "42": "강원",
  "41": "경기",
  "36": "세종",
  "31": "울산",
  "30": "대전",
  "29": "광주",
  "28": "인천",
  "27": "대구",
  "26": "부산",
  "11": "서울",
};
