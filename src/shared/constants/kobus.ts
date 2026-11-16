// 코버스(KOBUS) API 관련 통합 상수
export const KOBUS = {
  // API 엔드포인트
  URLS: {
    MASTER_DATA: "https://www.kobus.co.kr/mrs/readRotLinInf.ajax", // 마스터 데이터(노선, 지역 정보)
    SESSION_COOKIE: "https://www.kobus.co.kr/mrs/rotinf.do", // 세션 쿠키 획득
    ROUTE_INFO: "https://www.kobus.co.kr/mrs/alcnSrch.do", // 노선 정보 조회
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
    },
  },

  // 노선 조회 폼 기본 파라미터
  FORM: {
    PATH_DVS: "sngl", // 경로 구분 (단일)
    PATH_STEP: "1", // 경로 단계
    CRCH_DEPR_ARVL_YN: "N", // 교차 출발/도착 여부
    BUS_CLS_CD: "0", // 버스 등급 코드 (전체)
    PRMM_DC_YN: "N", // 프리미엄 할인 여부
    TFR_CD: "", // 환승 코드
    TFR_NM: "", // 환승 이름
    TFR_ARVL_FULL_NM: "", // 환승 도착지 전체 이름
    ABNR_DATA: "", // 비정상 데이터
  },

  // HTML 파싱용 CSS 셀렉터
  SELECTORS: {
    SCHEDULE_TABLE: "div.bustime_wrap div.bus_time", // 배차 조회 결과 표 (배차 0건이어도 존재)
    BUS_ROWS: 'div.bus_time p[role="row"]', // 버스 시간표 행 (매진·출발임박 포함)
    START_TIME: "span.start_time", // 출발 시간
    REMAIN_SEATS: "span.remain", // 잔여 좌석
    STATUS: "span.status", // 좌석 상태
    BUS_GRADE: "span.grade", // 버스 등급
    VIA_LOCATION: "span.grade span.via", // 경유지
    BUS_COMPANY: "span.bus_com span", // 버스 회사
  },

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
