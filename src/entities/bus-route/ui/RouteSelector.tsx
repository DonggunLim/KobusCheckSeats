"use client";

import { useState, type ReactNode } from "react";
import { useRouteSelector } from "../model/useRouteSelector";

interface RouteChangeData {
  departureTerminalCd: string;
  departureTerminalNm: string;
  arrivalTerminalCd: string;
  arrivalTerminalNm: string;
}

interface RouteSelectorProps {
  onRouteChange: (route: RouteChangeData) => void;
}

export function RouteSelector({ onRouteChange }: RouteSelectorProps) {
  const [departureAreaCd, setDepartureAreaCd] = useState("");
  const [departureTerminalCd, setDepartureTerminalCd] = useState("");
  const [departureTerminalNm, setDepartureTerminalNm] = useState("");
  const [arrivalTerminalCd, setArrivalTerminalCd] = useState("");

  const {
    areas,
    departureTerminals,
    arrivalTerminals,
    loading,
    error,
    handleAreaChange,
    handleDepartureTerminalChange,
    handleArrivalTerminalChange,
  } = useRouteSelector({
    departureAreaCd,
    departureTerminalCd,
    onDepartureAreaChange: setDepartureAreaCd,
    onDepartureTerminalChange: (terminalCd, terminalNm) => {
      setDepartureTerminalCd(terminalCd);
      setDepartureTerminalNm(terminalNm);
      onRouteChange({
        departureTerminalCd: terminalCd,
        departureTerminalNm: terminalNm,
        arrivalTerminalCd: "",
        arrivalTerminalNm: "",
      });
    },
    onArrivalTerminalChange: (terminalCd, terminalNm) => {
      setArrivalTerminalCd(terminalCd);
      onRouteChange({
        departureTerminalCd,
        departureTerminalNm,
        arrivalTerminalCd: terminalCd,
        arrivalTerminalNm: terminalNm,
      });
    },
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <SelectField
        id="departure-area"
        label="출발 지역"
        value={departureAreaCd}
        onChange={handleAreaChange}
        disabled={loading.areas}
        placeholder={loading.areas ? "불러오는 중..." : "지역을 선택하세요"}
      >
        {areas.map((area) => (
          <option key={area.areaCd} value={area.areaCd}>
            {area.areaNm}
          </option>
        ))}
      </SelectField>

      <SelectField
        id="departure-terminal"
        label="출발 터미널"
        value={departureTerminalCd}
        onChange={handleDepartureTerminalChange}
        disabled={!departureAreaCd || loading.departureTerminals}
        placeholder={
          !departureAreaCd
            ? "지역을 먼저 선택하세요"
            : loading.departureTerminals
              ? "불러오는 중..."
              : "터미널을 선택하세요"
        }
        hint={
          departureAreaCd && departureTerminals.length === 0 && !loading.departureTerminals
            ? "이 지역에는 출발 가능한 터미널이 없습니다"
            : undefined
        }
      >
        {departureTerminals.map((terminal) => (
          <option key={terminal.terminalCd} value={terminal.terminalCd}>
            {terminal.terminalNm}
          </option>
        ))}
      </SelectField>

      <div className="sm:col-span-2">
        <SelectField
          id="arrival-terminal"
          label="도착 터미널"
          value={arrivalTerminalCd}
          onChange={handleArrivalTerminalChange}
          disabled={!departureTerminalCd || loading.arrivalTerminals}
          placeholder={
            !departureTerminalCd
              ? "출발 터미널을 먼저 선택하세요"
              : loading.arrivalTerminals
                ? "불러오는 중..."
                : "도착 터미널을 선택하세요"
          }
          hint={
            departureTerminalCd && arrivalTerminals.length === 0 && !loading.arrivalTerminals
              ? "이 출발지에서 갈 수 있는 목적지가 없습니다"
              : undefined
          }
        >
          {arrivalTerminals.map((terminal) => (
            <option key={terminal.terminalCd} value={terminal.terminalCd}>
              {terminal.terminalNm}
            </option>
          ))}
        </SelectField>
      </div>

      {error && (
        <p className="sm:col-span-2 text-sm text-red-accent">
          노선 정보를 불러오지 못했습니다. 잠시 후 다시 선택해주세요.
        </p>
      )}
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  disabled,
  placeholder,
  hint,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  placeholder: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-text-primary">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required
          className="h-11 w-full appearance-none rounded-lg border border-beige-light bg-white pl-3 pr-9 text-text-primary transition-all focus:outline-none focus:ring-2 focus:ring-green-primary disabled:bg-cream-bg/60 disabled:text-text-secondary"
        >
          <option value="">{placeholder}</option>
          {children}
        </select>
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {hint && <p className="mt-1 text-xs text-text-secondary">{hint}</p>}
    </div>
  );
}
