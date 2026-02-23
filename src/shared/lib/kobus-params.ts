import { KOBUS } from "@/shared/constants/kobus";

/**
 * Builds the URLSearchParams for Kobus route search POST requests.
 * Used by both the seat-check worker and the schedule update script.
 */
export function buildRouteSearchParams(
  deprCd: string,
  deprNm: string,
  arvlCd: string,
  arvlNm: string,
  ymd: string,
  formatted: string
): URLSearchParams {
  const params = new URLSearchParams();
  params.append("deprCd", deprCd);
  params.append("deprNm", deprNm);
  params.append("arvlCd", arvlCd);
  params.append("arvlNm", arvlNm);
  params.append("pathDvs", KOBUS.FORM.PATH_DVS);
  params.append("pathStep", KOBUS.FORM.PATH_STEP);
  params.append("crchDeprArvlYn", KOBUS.FORM.CRCH_DEPR_ARVL_YN);
  params.append("deprDtm", ymd);
  params.append("deprDtmAll", formatted);
  params.append("arvlDtm", ymd);
  params.append("arvlDtmAll", formatted);
  params.append("busClsCd", KOBUS.FORM.BUS_CLS_CD);
  params.append("prmmDcYn", KOBUS.FORM.PRMM_DC_YN);
  params.append("tfrCd", KOBUS.FORM.TFR_CD);
  params.append("tfrNm", KOBUS.FORM.TFR_NM);
  params.append("tfrArvlFullNm", KOBUS.FORM.TFR_ARVL_FULL_NM);
  params.append("abnrData", KOBUS.FORM.ABNR_DATA);
  return params;
}
