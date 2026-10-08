import { v } from 'convex/values';

export const outcomeValidator = v.union(v.literal('ricochet_body'), v.literal('body'), v.literal('hat_only'), v.literal('miss'));
export const resolutionValidator = v.union(v.literal('shooter'), v.literal('witness'), v.literal('timeout'), v.literal('skipped'));
