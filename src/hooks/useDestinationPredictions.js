import { useState, useRef, useCallback, useEffect } from 'react';

const AUTOCOMPLETE_DELAY_MS = 300;
const REGION_AUTOCOMPLETE_TYPES = Object.freeze(['(regions)']);

export const useDestinationPredictions = ({ input, placesLibrary, includedPrimaryTypes = REGION_AUTOCOMPLETE_TYPES }) => {
  const [resultState, setResultState] = useState({ query: '', items: [], status: 'idle' });
  const requestIdRef = useRef(0);
  const sessionTokenRef = useRef(null);
  const query = String(input || '').trim();
  const autocompleteApi = placesLibrary?.AutocompleteSuggestion;
  const SessionToken = placesLibrary?.AutocompleteSessionToken;
  const canSearch = Boolean(
    autocompleteApi?.fetchAutocompleteSuggestions
    && SessionToken
    && query.length >= 2
  );

  const clearPredictions = useCallback(() => {
    requestIdRef.current += 1;
    setResultState({ query: '', items: [], status: 'idle' });
  }, []);

  const finishSession = useCallback(() => {
    sessionTokenRef.current = null;
  }, []);

  useEffect(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    if (!canSearch) return undefined;

    const timer = window.setTimeout(() => {
      if (!sessionTokenRef.current) {
        sessionTokenRef.current = new SessionToken();
      }

      void autocompleteApi.fetchAutocompleteSuggestions({
        input: query,
        includedPrimaryTypes,
        language: 'zh-TW',
        sessionToken: sessionTokenRef.current,
      }).then(({ suggestions }) => {
        if (requestId !== requestIdRef.current) return;
        const predictions = Array.isArray(suggestions)
          ? suggestions
            .map((suggestion) => suggestion?.placePrediction)
            .filter((prediction) => prediction?.placeId && prediction?.text)
          : [];
        setResultState({
          query,
          items: predictions,
          status: predictions.length > 0 ? 'ready' : 'empty',
        });
      }).catch(() => {
        if (requestId !== requestIdRef.current) return;
        setResultState({ query, items: [], status: 'error' });
      });
    }, AUTOCOMPLETE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [autocompleteApi, canSearch, query, SessionToken, includedPrimaryTypes]);

  const status = !canSearch
    ? 'idle'
    : (resultState.query === query ? resultState.status : 'loading');
  const visiblePredictions = status === 'ready' ? resultState.items : [];

  return {
    clearPredictions,
    finishSession,
    status,
    suggestions: visiblePredictions,
  };
};
