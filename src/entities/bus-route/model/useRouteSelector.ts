'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import type { Area, TerminalData } from './types';
import { fetchAreas, fetchTerminals, fetchDestinations } from '../api';

interface UseRouteSelectorParams {
  departureAreaCd: string;
  departureTerminalCd: string;
  onDepartureAreaChange: (areaCd: string) => void;
  onDepartureTerminalChange: (terminalCd: string, terminalNm: string) => void;
  onArrivalTerminalChange: (terminalCd: string, terminalNm: string) => void;
}

type Loaded<T> = { key: string; data: T; error?: undefined } | { key: string; data?: undefined; error: string };

/**
 * key가 바뀌면 다시 불러온다. 응답은 요청 key와 함께 저장해, 조건을 빨리 바꿨을 때
 * 늦게 도착한 이전 응답이 현재 목록을 덮어쓰지 않게 한다.
 */
function useKeyedFetch<T>(key: string | null, load: (key: string) => Promise<T>, label: string) {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);

  useEffect(() => {
    if (key === null) return;
    let stale = false;
    load(key).then(
      (data) => {
        if (!stale) setLoaded({ key, data });
      },
      (err: unknown) => {
        if (stale) return;
        console.error(`Failed to load ${label}:`, err);
        setLoaded({ key, error: err instanceof Error ? err.message : `${label} 로드 실패` });
      }
    );
    return () => {
      stale = true;
    };
  }, [key, load, label]);

  const current = key !== null && loaded?.key === key ? loaded : null;
  return {
    data: current?.data,
    loading: key !== null && !current,
    error: current?.error ?? null,
  };
}

export function useRouteSelector({
  departureAreaCd,
  departureTerminalCd,
  onDepartureAreaChange,
  onDepartureTerminalChange,
  onArrivalTerminalChange,
}: UseRouteSelectorParams) {
  const areas = useKeyedFetch<Area[]>('all', fetchAreas, 'areas');
  const departure = useKeyedFetch<TerminalData[]>(departureAreaCd || null, fetchTerminals, 'terminals');
  const arrival = useKeyedFetch<TerminalData[]>(
    departureTerminalCd || null,
    fetchDestinations,
    'destinations'
  );

  const departureTerminals = useMemo(() => departure.data ?? [], [departure.data]);
  const arrivalTerminals = useMemo(() => arrival.data ?? [], [arrival.data]);

  const handleAreaChange = useCallback(
    (areaCd: string) => {
      onDepartureAreaChange(areaCd);
      onDepartureTerminalChange('', '');
      onArrivalTerminalChange('', '');
    },
    [onDepartureAreaChange, onDepartureTerminalChange, onArrivalTerminalChange]
  );

  const handleDepartureTerminalChange = useCallback(
    (terminalCd: string) => {
      const terminal = departureTerminals.find((t) => t.terminalCd === terminalCd);
      onDepartureTerminalChange(terminalCd, terminal?.terminalNm || '');
      onArrivalTerminalChange('', '');
    },
    [departureTerminals, onDepartureTerminalChange, onArrivalTerminalChange]
  );

  const handleArrivalTerminalChange = useCallback(
    (terminalCd: string) => {
      const terminal = arrivalTerminals.find((t) => t.terminalCd === terminalCd);
      onArrivalTerminalChange(terminalCd, terminal?.terminalNm || '');
    },
    [arrivalTerminals, onArrivalTerminalChange]
  );

  return {
    areas: areas.data ?? [],
    departureTerminals,
    arrivalTerminals,
    loading: {
      areas: areas.loading,
      departureTerminals: departure.loading,
      arrivalTerminals: arrival.loading,
    },
    error: areas.error ?? departure.error ?? arrival.error,
    handleAreaChange,
    handleDepartureTerminalChange,
    handleArrivalTerminalChange,
  };
}
