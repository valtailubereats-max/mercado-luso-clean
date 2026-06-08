import { Ad } from '../types';

export interface AdCache {
  ads: Ad[];
  lastFetchTime: number;
  featuredAds: Ad[];
  lastFeaturedFetchTime: number;
}

const cache: AdCache = {
  ads: [],
  lastFetchTime: 0,
  featuredAds: [],
  lastFeaturedFetchTime: 0,
};

export function getCachedAds(): Ad[] {
  return cache.ads;
}

export function setCachedAds(ads: Ad[]) {
  cache.ads = ads;
  cache.lastFetchTime = Date.now();
  console.log(`[Cache] Gravou cache de ads às: ${new Date(cache.lastFetchTime).toISOString()} com ${ads.length} anúncios.`);
}

export function getLastFetchTime(): number {
  return cache.lastFetchTime;
}

export function getCachedFeaturedAds(): Ad[] {
  return cache.featuredAds;
}

export function setCachedFeaturedAds(featuredAds: Ad[]) {
  cache.featuredAds = featuredAds;
  cache.lastFeaturedFetchTime = Date.now();
  console.log(`[Cache] Gravou cache de ads destacados às: ${new Date(cache.lastFeaturedFetchTime).toISOString()} com ${featuredAds.length} anúncios.`);
}

export function getLastFeaturedFetchTime(): number {
  return cache.lastFeaturedFetchTime;
}

export function clearHomeCache() {
  cache.ads = [];
  cache.lastFetchTime = 0;
  cache.featuredAds = [];
  cache.lastFeaturedFetchTime = 0;
  console.log('[Cache] Cache da Home limpa com sucesso.');
}
