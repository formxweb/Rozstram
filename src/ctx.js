import { createContext, useContext } from 'react';

export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

/** Açık sayfanın animasyonlu geri dönüşü */
export const ScreenCtx = createContext(null);
export const useBack = () => useContext(ScreenCtx);

/** Sayfanın içindeki bir adım akışı (ör. paylaşım oluşturma) geri tuşunu önce kendisi karşılar */
export const BackInterceptCtx = createContext(null);

/** Açık alt panelin animasyonlu kapanışı */
export const SheetCtx = createContext(null);
export const useSheetClose = () => useContext(SheetCtx);
