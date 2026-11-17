'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Area, TerminalData } from './types';
import { fetchAreas, fetchTerminals, fetchDestinations } from '../api';

interface UseRouteSelectorParams {
  departureAreaCd: string;
  departureTerminalCd: string;
  onDepartureAreaChange: (areaCd: string) => void;
  onDepartureTerminalChange: (terminalCd: string, terminalNm: string) => void;
  onArrivalTerminalChange: (terminalCd: string, terminalNm: string) => void;
}

export function useRouteSelector({
  departureAreaCd,
  departureTerminalCd,
  onDepartureAreaChange,
  onDepartureTerminalChange,
  onArrivalTerminalChange,
}: UseRouteSelectorParams) {
  const [areas, setAreas] = useState<Area[]>([]);
  const [departureTerminals, setDepartureTerminals] = useState<TerminalData[]>([]);
  const [arrivalTerminals, setArrivalTerminals] = useState<TerminalData[]>([]);
  const [loading, setLoading] = useState({
    areas: false,
    departureTerminals: false,
    arrivalTerminals: false,
  });
  const [error, setError] = useState<string | null>(null);

  // 지역 정보 가져오기
  useEffect(() => {
    async function loadAreas() {
      setLoading((prev) => ({ ...prev, areas: true }));
      setError(null);
      try {
        const data = await fetchAreas();
        setAreas(data);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '지역 정보 로드 실패';
        console.error('Failed to load areas:', err);
        setError(errorMsg);
      } finally {
        setLoading((prev) => ({ ...prev, areas: false }));
      }
    }
    loadAreas();
  }, []);

  // 출발 터미널 정보 가져오기
  useEffect(() => {
    setDepartureTerminals([]);
    setLoading((prev) => ({ ...prev, departureTerminals: false }));
    if (!departureAreaCd) {
      return;
    }

    // 지역을 빠르게 바꿀 때 늦게 온 이전 응답이 목록을 덮어쓰지 않게 한다.
    let stale = false;

    async function loadDepartureTerminals() {
      setLoading((prev) => ({ ...prev, departureTerminals: true }));
      setError(null);
      try {
        const data = await fetchTerminals(departureAreaCd);
        if (!stale) setDepartureTerminals(data);
      } catch (err) {
        if (stale) return;
        const errorMsg = err instanceof Error ? err.message : '출발 터미널 로드 실패';
        console.error('Failed to load departure terminals:', err);
        setError(errorMsg);
      } finally {
        if (!stale) setLoading((prev) => ({ ...prev, departureTerminals: false }));
      }
    }
    loadDepartureTerminals();

    return () => {
      stale = true;
    };
  }, [departureAreaCd]);

  // 도착 터미널 정보 가져오기
  useEffect(() => {
    setArrivalTerminals([]);
    setLoading((prev) => ({ ...prev, arrivalTerminals: false }));
    if (!departureTerminalCd) {
      return;
    }

    let stale = false;

    async function loadArrivalTerminals() {
      setLoading((prev) => ({ ...prev, arrivalTerminals: true }));
      setError(null);
      try {
        const data = await fetchDestinations(departureTerminalCd);
        if (!stale) setArrivalTerminals(data);
      } catch (err) {
        if (stale) return;
        const errorMsg = err instanceof Error ? err.message : '도착 터미널 로드 실패';
        console.error('Failed to load arrival terminals:', err);
        setError(errorMsg);
      } finally {
        if (!stale) setLoading((prev) => ({ ...prev, arrivalTerminals: false }));
      }
    }
    loadArrivalTerminals();

    return () => {
      stale = true;
    };
  }, [departureTerminalCd]);

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
    areas,
    departureTerminals,
    arrivalTerminals,
    loading,
    error,
    handleAreaChange,
    handleDepartureTerminalChange,
    handleArrivalTerminalChange,
  };
}
