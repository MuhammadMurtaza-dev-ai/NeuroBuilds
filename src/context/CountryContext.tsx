import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

interface CountryContextValue {
  selectedCountry: string;
  setSelectedCountry: (country: string) => void;
}

const CountryContext = createContext<CountryContextValue>({
  selectedCountry: 'Pakistan',
  setSelectedCountry: () => {},
});

const STORAGE_KEY = 'nb_country';

export function CountryProvider({ children }: { children: ReactNode }) {
  const [selectedCountry, setSelectedCountryState] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) ?? 'Pakistan'
  );

  const setSelectedCountry = (country: string) => {
    localStorage.setItem(STORAGE_KEY, country);
    setSelectedCountryState(country);
  };

  return (
    <CountryContext.Provider value={{ selectedCountry, setSelectedCountry }}>
      {children}
    </CountryContext.Provider>
  );
}

export const useCountry = () => useContext(CountryContext);
