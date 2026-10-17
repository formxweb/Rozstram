import { createContext, useContext } from 'react';

export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

/** Açık sayfanın animasyonlu geri dönüşü */
export const ScreenCtx = createContext(null);
export const useBack = () => useContext(ScreenCtx);

/** Açık alt panelin animasyonlu kapanışı */
export const SheetCtx = createContext(null);
export const useSheetClose = () => useContext(SheetCtx);
