import { z } from 'zod';
export const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.hash
    );
  }, 'Use an HTTP or HTTPS URL without credentials or a fragment.');
export const monitorSchema = z.object({
  websiteId: z.string().min(1).optional(),
  name: z.string().trim().min(1, 'Give your monitor a name.').max(100),
  url: httpUrl,
  method: z.enum(['GET', 'HEAD']).default('GET'),
  intervalSeconds: z.number().int().min(30).max(86400).default(60),
  timeoutMs: z.number().int().min(1000).max(30000).default(10000),
  expectedStatusCodes: z.array(z.number().int().min(100).max(599)).min(1).max(30).default([200]),
  failureThreshold: z.number().int().min(1).max(10).default(2),
  recoveryThreshold: z.number().int().min(1).max(10).default(1),
  isActive: z.boolean().default(true),
});
export const websiteSchema = z
  .object({
    name: z.string().trim().min(1, 'Give your website a name.').max(100),
    url: httpUrl,
    emailEnabled: z.boolean().default(false),
    intervalSeconds: z.number().int().min(30).max(86400).default(60),
    failureThreshold: z.number().int().min(1).max(10).default(2),
    recoveryThreshold: z.number().int().min(1).max(10).default(1),
    pages: z
      .array(
        z.object({
          name: z.string().trim().min(1, 'Give this page a name.').max(100),
          url: z.string().trim().min(1, 'Enter a page URL or path.').max(2048),
        }),
      )
      .min(1)
      .max(50),
  })
  .superRefine((value, ctx) => {
    let origin: string;
    try {
      origin = new URL(value.url).origin;
    } catch {
      return;
    }
    const seen = new Set<string>();
    value.pages.forEach((page, index) => {
      try {
        const url = new URL(page.url, origin + '/');
        if (
          url.origin !== origin ||
          url.hash ||
          url.username ||
          url.password ||
          page.url.includes('\\') ||
          Array.from(page.url).some((char) => char.charCodeAt(0) < 32)
        ) {
          throw new Error('Use a URL on this website without credentials or a fragment.');
        }
        if (seen.has(url.href)) throw new Error('This page URL is already in the list.');
        seen.add(url.href);
      } catch (error) {
        ctx.addIssue({
          code: 'custom',
          path: ['pages', index, 'url'],
          message: error instanceof Error ? error.message : 'Enter a valid page URL.',
        });
      }
    });
  });
export type WebsiteInput = z.input<typeof websiteSchema>;
export type WebsiteConfig = z.output<typeof websiteSchema>;
export const registrationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z
    .string()
    .min(12, 'Use at least 12 characters.')
    .max(72)
    .refine(
      (v) => new TextEncoder().encode(v).length <= 72,
      'Password must fit within 72 UTF-8 bytes.',
    ),
});
export const loginSchema = registrationSchema
  .pick({ email: true, password: true })
  .extend({ password: z.string().min(1).max(72) });
export const statusPageSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens.'),
  isPublic: z.boolean().default(false),
  monitorIds: z.array(z.string()).max(100).default([]),
});
export const preferencesSchema = z.object({
  monitorId: z.string().nullable().default(null),
  emailEnabled: z.boolean(),
  outageNotifications: z.boolean(),
  recoveryNotifications: z.boolean(),
});
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).default(''),
  status: z.enum(['UP', 'DOWN', 'PAUSED', 'PENDING', 'UNKNOWN']).optional(),
  sort: z.enum(['name', 'createdAt', 'lastCheckedAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type MonitorInput = z.input<typeof monitorSchema>;
export type MonitorConfig = z.output<typeof monitorSchema>;
